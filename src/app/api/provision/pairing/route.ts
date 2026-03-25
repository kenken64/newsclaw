import { NextResponse } from "next/server";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getUserChannelConfigByUserId,
  upsertMessagingPairing,
} from "@/lib/db";
import { decryptSecretValue } from "@/lib/secrets";
import {
  getRestoreInstanceIdentifier,
  getPairingReadiness,
  sanitizeProvisioningText,
  serializeMessagingPairing,
  serializeRestoreJob,
  spawnProvisioningWorker,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

export async function GET(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);
  const pairing = getMessagingPairingByUserId(user.id);

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

  const pairing = getMessagingPairingByUserId(user.id);

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

  return NextResponse.json({ pairing: serializeMessagingPairing(getMessagingPairingByUserId(user.id)) });
}