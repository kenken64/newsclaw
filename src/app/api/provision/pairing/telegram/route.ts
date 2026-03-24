import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getUserChannelConfigByUserId,
  upsertMessagingPairing,
} from "@/lib/db";
import { getRestoreInstanceIdentifier, runClawmacdoCommand, serializeMessagingPairing } from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

const requestSchema = z.object({
  code: z.string().trim().min(4).max(32),
});

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

    if (result.code !== 0) {
      upsertMessagingPairing({
        userId: user.id,
        restoreJobId: restoreJob.id,
        channel: "telegram",
        status: "failed",
        instructionText: result.stdout.trim(),
        pairingCode: body.code,
        errorMessage: (result.stderr || result.stdout || "Telegram pairing failed.").trim(),
        lastUpdatedAt: new Date().toISOString(),
      });

      return NextResponse.json({ error: (result.stderr || result.stdout || "Telegram pairing failed.").trim() }, { status: 400 });
    }

    upsertMessagingPairing({
      userId: user.id,
      restoreJobId: restoreJob.id,
      channel: "telegram",
      status: "completed",
      instructionText: result.stdout.trim(),
      pairingCode: body.code,
      errorMessage: null,
      lastUpdatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ pairing: serializeMessagingPairing(getMessagingPairingByUserId(user.id)) });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unable to verify the Telegram pairing code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}