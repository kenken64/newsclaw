import { NextResponse } from "next/server";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserIdAndChannel,
  getUserChannelConfigByUserId,
  upsertMessagingPairing,
} from "@/lib/db";
import { decryptSecretValue } from "@/lib/secrets";
import {
  getLatestChannelRecipientFromRestoreJob,
  getRestoreInstanceIdentifier,
  getWhatsAppStatus,
  getPairingReadiness,
  sanitizeProvisioningText,
  serializeMessagingPairing,
  serializeRestoreJob,
  spawnProvisioningWorker,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

const WHATSAPP_COMPLETION_CHECK_INTERVAL_MS = 5_000;
const lastWhatsAppCompletionCheckAt = new Map<string, number>();
const pluginInstallSpawned = new Set<string>();

function hasCompletedWhatsAppLink(output: string | null | undefined) {
  const loweredOutput = String(output || "").toLowerCase();

  return (
    loweredOutput.includes("linked!") ||
    loweredOutput.includes("whatsapp linked") ||
    loweredOutput.includes("credentials saved for future sends") ||
    loweredOutput.includes("credentials saved")
  );
}

export async function GET(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);
  let pairing = getMessagingPairingByUserIdAndChannel(user.id, channelConfig?.preferredChannel ?? "whatsapp");
  const now = Date.now();

  if (
    restoreJob &&
    pairing &&
    pairing.restoreJobId === restoreJob.id &&
    pairing.channel === "whatsapp" &&
    pairing.status !== "completed" &&
    now - (lastWhatsAppCompletionCheckAt.get(user.id) ?? 0) >= WHATSAPP_COMPLETION_CHECK_INTERVAL_MS
  ) {
    const textHint =
      hasCompletedWhatsAppLink(pairing.qrOutput) || hasCompletedWhatsAppLink(pairing.instructionText);
    const hasQr = pairing.status === "qr_ready" && pairing.qrOutput.trim().length > 0;

    if (textHint || hasQr) {
      lastWhatsAppCompletionCheckAt.set(user.id, now);
      const instance = getRestoreInstanceIdentifier(restoreJob);

      try {
        let whatsappConfirmed = false;

        if (instance) {
          try {
            const status = await getWhatsAppStatus(instance);
            whatsappConfirmed = status === "connected";

            // If gateway explicitly says QR not scanned yet, skip completion.
            if (status === "pending") {
              lastWhatsAppCompletionCheckAt.set(user.id, now);
            }
          } catch {
            // clawmacdo whatsapp-status may fail (e.g. gateway token not supported).
            // Fall back to text-hint / SSH detection.
            whatsappConfirmed = textHint;
          }
        } else {
          whatsappConfirmed = textHint;
        }

        if (whatsappConfirmed) {
          let deliveryNote = "WhatsApp is linked and ready for NewsClaw.";

          if (hasQr) {
            try {
              const sshPrivateKey = restoreJob.sshPrivateKeyEncrypted
                ? decryptSecretValue(restoreJob.sshPrivateKeyEncrypted)
                : undefined;
              const recipient = await getLatestChannelRecipientFromRestoreJob(restoreJob, "whatsapp", sshPrivateKey);

              if (recipient) {
                deliveryNote = `WhatsApp is linked and ready for delivery to ${recipient}.`;
              }
            } catch {
              // Non-fatal: use the generic message.
            }
          }

          pairing = upsertMessagingPairing({
            userId: user.id,
            restoreJobId: restoreJob.id,
            channel: "whatsapp",
            status: "completed",
            instructionText: deliveryNote,
            errorMessage: null,
            lastUpdatedAt: new Date().toISOString(),
          });
          lastWhatsAppCompletionCheckAt.delete(user.id);

          if (instance && !pluginInstallSpawned.has(restoreJob.id)) {
            pluginInstallSpawned.add(restoreJob.id);
            spawnProvisioningWorker({
              mode: "plugin-install",
              restoreJobId: restoreJob.id,
              userId: user.id,
              instance,
            });
          }
        }
      } catch (error) {
        console.error(
          "[pairing] WhatsApp status check failed:",
          error instanceof Error ? sanitizeProvisioningText(error.message) : error,
        );
      }
    }
  }

  return NextResponse.json({
    restoreJob: serializeRestoreJob(restoreJob),
    channelConfig: channelConfig
      ? {
          preferredChannel: channelConfig.preferredChannel,
          whatsappPhoneNumber: channelConfig.whatsappPhoneNumber,
        }
      : null,
    pairing: serializeMessagingPairing(pairing),
    missingConfig: getPairingReadiness(channelConfig),
  });
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    return NextResponse.json({ error: "Complete the workspace restore before starting pairing." }, { status: 400 });
  }

  const channelConfig = getUserChannelConfigByUserId(user.id);
  const missingConfig = getPairingReadiness(channelConfig);

  if (!channelConfig || missingConfig.length > 0) {
    return NextResponse.json({ error: `Missing pairing configuration: ${missingConfig.join(", ")}.` }, { status: 400 });
  }

  const instanceIdentifier = getRestoreInstanceIdentifier(restoreJob);

  if (!instanceIdentifier) {
    return NextResponse.json({ error: "No deployment identifier is available for pairing." }, { status: 400 });
  }

  const pairing = getMessagingPairingByUserIdAndChannel(user.id, channelConfig.preferredChannel);

  const canReuseExistingPairing = Boolean(
    pairing &&
    pairing.restoreJobId === restoreJob.id &&
    (
      pairing.status === "completed" ||
      pairing.status === "fetching_qr" ||
      pairing.status === "qr_ready" ||
      (
        pairing.status === "awaiting_code" &&
        !pairing.pairingCode &&
        !pairing.errorMessage
      )
    )
  );

  if (canReuseExistingPairing) {
    return NextResponse.json({ pairing: serializeMessagingPairing(pairing) });
  }

  upsertMessagingPairing({
    userId: user.id,
    restoreJobId: restoreJob.id,
    channel: channelConfig.preferredChannel,
    status: channelConfig.preferredChannel === "telegram" ? "awaiting_code" : "fetching_qr",
    instructionText: channelConfig.preferredChannel === "telegram"
      ? "Preparing Telegram bot setup and waiting for the challenge code."
      : "Preparing WhatsApp QR setup.",
    qrOutput: "",
    pairingCode: null,
    errorMessage: null,
    lastUpdatedAt: new Date().toISOString(),
  });

  if (channelConfig.preferredChannel === "telegram") {
    spawnProvisioningWorker({
      mode: "telegram-setup",
      restoreJobId: restoreJob.id,
      userId: user.id,
      instance: instanceIdentifier,
      channel: "telegram",
      telegramBotToken: decryptSecretValue(channelConfig.telegramBotTokenEncrypted!),
    });
  } else {
    spawnProvisioningWorker({
      mode: "whatsapp-setup",
      restoreJobId: restoreJob.id,
      userId: user.id,
      instance: instanceIdentifier,
      channel: "whatsapp",
      phoneNumber: channelConfig.whatsappPhoneNumber ?? "",
    });
  }

  return NextResponse.json({ pairing: serializeMessagingPairing(getMessagingPairingByUserIdAndChannel(user.id, channelConfig.preferredChannel)) });
}