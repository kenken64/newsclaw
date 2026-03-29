import { NextResponse } from "next/server";

import {
  getLatestRestoreJobByUserId,
  getUserChannelConfigByUserId,
  getTelegramConfigsWithCompletedPairing,
  isWhatsAppNumberPairedByOtherUser,
  upsertMessagingPairing,
  upsertUserChannelConfig,
} from "@/lib/db";
import {
  getRestoreInstanceIdentifier,
  spawnProvisioningWorker,
} from "@/lib/provisioning";
import { encryptSecretValue, decryptSecretValue } from "@/lib/secrets";
import { getCurrentUserFromRequest } from "@/lib/session";

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    return NextResponse.json(
      { error: "No completed restore job found." },
      { status: 400 },
    );
  }

  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!channelConfig) {
    return NextResponse.json(
      { error: "No channel configuration found." },
      { status: 400 },
    );
  }

  const instanceIdentifier = getRestoreInstanceIdentifier(restoreJob);

  if (!instanceIdentifier) {
    return NextResponse.json(
      { error: "No deployment identifier is available for pairing." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    channel: "whatsapp" | "telegram";
    telegramBotToken?: string;
    whatsAppPhoneNumber?: string;
  };

  if (body.channel !== "whatsapp" && body.channel !== "telegram") {
    return NextResponse.json(
      { error: "Invalid channel. Must be 'whatsapp' or 'telegram'." },
      { status: 400 },
    );
  }

  if (body.channel === "telegram") {
    if (!body.telegramBotToken?.trim()) {
      return NextResponse.json(
        { error: "Telegram bot token is required." },
        { status: 400 },
      );
    }

    const activeTelegramConfigs = getTelegramConfigsWithCompletedPairing(user.id);
    const tokenInUse = activeTelegramConfigs.some((config) => {
      try {
        return decryptSecretValue(config.telegram_bot_token_encrypted) === body.telegramBotToken;
      } catch {
        return false;
      }
    });

    if (tokenInUse) {
      return NextResponse.json(
        { error: "This Telegram bot token is already paired with another account." },
        { status: 400 },
      );
    }

    upsertUserChannelConfig({
      userId: user.id,
      preferredChannel: "telegram",
      whatsappPhoneNumber: channelConfig.whatsappPhoneNumber,
      telegramBotTokenEncrypted: encryptSecretValue(body.telegramBotToken.trim()),
    });
  }

  if (body.channel === "whatsapp") {
    const phoneNumber = body.whatsAppPhoneNumber?.trim() || channelConfig.whatsappPhoneNumber;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "WhatsApp phone number is required." },
        { status: 400 },
      );
    }

    if (!/^\+65[89]\d{7}$/.test(phoneNumber)) {
      return NextResponse.json(
        { error: "Enter a valid Singapore mobile number (+65 followed by 8 digits starting with 8 or 9)." },
        { status: 400 },
      );
    }

    if (isWhatsAppNumberPairedByOtherUser(phoneNumber, user.id)) {
      return NextResponse.json(
        { error: "This WhatsApp number is already paired with another instance." },
        { status: 400 },
      );
    }

    if (phoneNumber !== channelConfig.whatsappPhoneNumber) {
      upsertUserChannelConfig({
        userId: user.id,
        preferredChannel: "whatsapp",
        whatsappPhoneNumber: phoneNumber,
        telegramBotTokenEncrypted: channelConfig.telegramBotTokenEncrypted,
      });
    }
  }

  upsertMessagingPairing({
    userId: user.id,
    restoreJobId: restoreJob.id,
    channel: body.channel,
    status: body.channel === "telegram" ? "awaiting_code" : "fetching_qr",
    instructionText: body.channel === "telegram"
      ? "Re-pairing Telegram with new bot token."
      : "Re-pairing WhatsApp.",
    qrOutput: "",
    pairingCode: null,
    errorMessage: null,
    lastUpdatedAt: new Date().toISOString(),
  });

  if (body.channel === "telegram") {
    spawnProvisioningWorker({
      mode: "telegram-setup",
      restoreJobId: restoreJob.id,
      userId: user.id,
      instance: instanceIdentifier,
      channel: "telegram",
      telegramBotToken: decryptSecretValue(
        (getUserChannelConfigByUserId(user.id))!.telegramBotTokenEncrypted!
      ),
    });
  } else {
    const updatedConfig = getUserChannelConfigByUserId(user.id);
    spawnProvisioningWorker({
      mode: "whatsapp-setup",
      restoreJobId: restoreJob.id,
      userId: user.id,
      instance: instanceIdentifier,
      channel: "whatsapp",
      phoneNumber: updatedConfig?.whatsappPhoneNumber ?? "",
    });
  }

  return NextResponse.json({ success: true, nextPath: "/pair-channel" });
}
