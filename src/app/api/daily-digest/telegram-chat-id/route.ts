import { NextResponse } from "next/server";

import { getLatestRestoreJobByUserId, getUserChannelConfigByUserId } from "@/lib/db";
import { getRestoreInstanceIdentifier, getTelegramChatIdFromInstance } from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

export async function GET(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!channelConfig || channelConfig.preferredChannel !== "telegram") {
    return NextResponse.json({ error: "Telegram is not the configured delivery channel for this account." }, { status: 400 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    return NextResponse.json({ error: "Restore the OpenClaw instance before fetching the Telegram chat ID." }, { status: 400 });
  }

  const instance = getRestoreInstanceIdentifier(restoreJob);

  if (!instance) {
    return NextResponse.json({ error: "No deployment identifier is available for fetching the Telegram chat ID." }, { status: 400 });
  }

  try {
    const chatId = await getTelegramChatIdFromInstance(instance);

    return NextResponse.json({ chatId });
  } catch (caughtError) {
    const message = caughtError instanceof Error
      ? caughtError.message
      : "Unable to fetch the Telegram chat ID from OpenClaw.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}