import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getUserChannelConfigByUserId,
  upsertMessagingPairing,
} from "@/lib/db";
import { decryptSecretValue } from "@/lib/secrets";
import {
  getRestoreInstanceIdentifier,
  runClawmacdoCommand,
  sanitizeProvisioningText,
  serializeMessagingPairing,
  spawnProvisioningWorker,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";
import { getValidationErrorMessage } from "@/lib/validation";

const requestSchema = z.object({
  code: z.string().trim().min(4).max(128),
});

const TELEGRAM_PAIRING_SUCCESS_MESSAGE = "Telegram pairing approved. Send a message to your bot to start chatting.";

function sanitizeTelegramPairingOutput(value: string | null | undefined) {
  const sanitized = sanitizeProvisioningText(value)
    .replace(/\x1b\[[0-9;]*m/gu, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^Approving Telegram pairing code\b/iu.test(line))
    .filter((line) => !/^\[plugins\]/iu.test(line))
    .filter((line) => !/^\[telegram\]/iu.test(line))
    .filter((line) => !/^\[moltguard\]/iu.test(line))
    .filter((line) => !/plugins\.allow is empty/iu.test(line))
    .filter((line) => !/OpenGuardrails dashboard started/iu.test(line))
    .filter((line) => !/Gateway port .* is still in use after waiting/iu.test(line))
    .join("\n")
    .trim();

  return sanitized;
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    return NextResponse.json({ error: "Restore must complete before Telegram pairing." }, { status: 400 });
  }

  if (!channelConfig || channelConfig.preferredChannel !== "telegram") {
    return NextResponse.json({ error: "Telegram is not the selected pairing channel for this user." }, { status: 400 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const instance = getRestoreInstanceIdentifier(restoreJob);

    if (!instance) {
      return NextResponse.json({ error: "No deployment identifier is available for Telegram pairing." }, { status: 400 });
    }

    const result = await runClawmacdoCommand([
      "telegram-pair",
      "--instance",
      instance,
      "--code",
      body.code,
    ]);

    const details = sanitizeTelegramPairingOutput(result.stderr || result.stdout || "Telegram pairing failed.") || "Telegram pairing failed.";

    if (result.code !== 0) {
      if (/No pending pairing request found for code:/iu.test(details)) {
        const restartMessage = "This Telegram pairing code is no longer valid. Telegram pairing is being restarted now. Send /start to the bot again, then enter the new code.";

        upsertMessagingPairing({
          userId: user.id,
          restoreJobId: restoreJob.id,
          channel: "telegram",
          status: "awaiting_code",
          instructionText: restartMessage,
          pairingCode: null,
          errorMessage: null,
          lastUpdatedAt: new Date().toISOString(),
        });

        if (!channelConfig.telegramBotTokenEncrypted) {
          return NextResponse.json({ error: restartMessage }, { status: 409 });
        }

        spawnProvisioningWorker({
          mode: "telegram-setup",
          restoreJobId: restoreJob.id,
          userId: user.id,
          instance,
          channel: "telegram",
          telegramBotToken: decryptSecretValue(channelConfig.telegramBotTokenEncrypted),
        });

        return NextResponse.json(
          {
            error: restartMessage,
            pairing: serializeMessagingPairing(getMessagingPairingByUserId(user.id)),
          },
          { status: 409 },
        );
      }

      upsertMessagingPairing({
        userId: user.id,
        restoreJobId: restoreJob.id,
        channel: "telegram",
        status: "failed",
        instructionText: sanitizeTelegramPairingOutput(result.stdout) || "Telegram pairing failed.",
        pairingCode: body.code,
        errorMessage: details,
        lastUpdatedAt: new Date().toISOString(),
      });

      return NextResponse.json({ error: details }, { status: 400 });
    }

    upsertMessagingPairing({
      userId: user.id,
      restoreJobId: restoreJob.id,
      channel: "telegram",
      status: "completed",
      instructionText: TELEGRAM_PAIRING_SUCCESS_MESSAGE,
      pairingCode: body.code,
      errorMessage: null,
      lastUpdatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ pairing: serializeMessagingPairing(getMessagingPairingByUserId(user.id)) });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to verify the Telegram pairing code.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}