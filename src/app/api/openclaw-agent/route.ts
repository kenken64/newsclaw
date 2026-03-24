import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getUserChannelConfigByUserId,
  replaceCategoryPreferences,
  upsertOpenClawAgent,
  upsertUserChannelConfig,
} from "@/lib/db";
import { inferPriorityLaneKeys } from "@/lib/constants";
import { encryptSecretValue } from "@/lib/secrets";
import { getCurrentUserFromRequest } from "@/lib/session";

const requestSchema = z.object({
  agentName: z.string().trim().min(3).max(80),
  trackingTopics: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  region: z.string().trim().min(2).max(80),
  preferredChannel: z.enum(["whatsapp", "telegram"]),
  whatsAppPhoneNumber: z.string().trim().max(30).optional(),
  telegramBotToken: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const existingChannelConfig = getUserChannelConfigByUserId(user.id);

    if (body.preferredChannel === "whatsapp" && !body.whatsAppPhoneNumber) {
      return NextResponse.json({ error: "WhatsApp phone number is required." }, { status: 400 });
    }

    if (
      body.preferredChannel === "telegram" &&
      !body.telegramBotToken &&
      !existingChannelConfig?.telegramBotTokenEncrypted
    ) {
      return NextResponse.json({ error: "Telegram bot token is required." }, { status: 400 });
    }

    upsertOpenClawAgent({
      userId: user.id,
      agentName: body.agentName,
      mission: "Topic-led OpenClaw workspace",
      newsSources: [],
      trackingTopics: body.trackingTopics,
      region: body.region,
      freshness: "On demand",
    });

    replaceCategoryPreferences(user.id, inferPriorityLaneKeys(body.trackingTopics, body.region));

    upsertUserChannelConfig({
      userId: user.id,
      preferredChannel: body.preferredChannel,
      whatsappPhoneNumber: body.preferredChannel === "whatsapp" ? body.whatsAppPhoneNumber ?? null : null,
      telegramBotTokenEncrypted:
        body.preferredChannel === "telegram"
          ? (body.telegramBotToken
              ? encryptSecretValue(body.telegramBotToken)
              : existingChannelConfig?.telegramBotTokenEncrypted ?? null)
          : null,
    });

    return NextResponse.json({ success: true, nextPath: "/restore-instance" });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to save OpenClaw agent.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}