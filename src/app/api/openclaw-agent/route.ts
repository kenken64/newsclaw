import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  getLatestRestoreJobByUserId,
  getOpenClawAgentByUserId,
  getUserChannelConfigByUserId,
  upsertOpenClawAgent,
  upsertUserChannelConfig,
} from "@/lib/db";
import { writeNewsClawSkillFiles } from "@/lib/newsclaw-skills";
import {
  getRestoreInstanceIdentifier,
  runClawmacdoCommand,
  sanitizeProvisioningText,
} from "@/lib/provisioning";
import { encryptSecretValue } from "@/lib/secrets";
import { getCurrentUserFromRequest } from "@/lib/session";
import { getValidationErrorMessage } from "@/lib/validation";

const requestSchema = z.object({
  agentName: z.string().trim().min(3).max(80),
  trackingTopics: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  region: z.string().trim().min(2).max(80),
  preferredChannel: z.enum(["whatsapp", "telegram"]),
  whatsAppPhoneNumber: z.string().trim().max(30).optional(),
  telegramBotToken: z.string().trim().max(200).optional(),
});

function skillInputsChanged(
  existingAgent: ReturnType<typeof getOpenClawAgentByUserId>,
  nextInput: {
    agentName: string;
    trackingTopics: string[];
    region: string;
  },
) {
  if (!existingAgent) {
    return true;
  }

  if (existingAgent.agentName !== nextInput.agentName || existingAgent.region !== nextInput.region) {
    return true;
  }

  if (existingAgent.trackingTopics.length !== nextInput.trackingTopics.length) {
    return true;
  }

  return existingAgent.trackingTopics.some((topic, index) => topic !== nextInput.trackingTopics[index]);
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const existingAgent = getOpenClawAgentByUserId(user.id);
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

    const shouldSyncSkills = skillInputsChanged(existingAgent, {
      agentName: body.agentName,
      trackingTopics: body.trackingTopics,
      region: body.region,
    });

    upsertOpenClawAgent({
      userId: user.id,
      agentName: body.agentName,
      mission: "Topic-led OpenClaw workspace",
      newsSources: [],
      trackingTopics: body.trackingTopics,
      region: body.region,
      freshness: "On demand",
    });

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

    if (shouldSyncSkills) {
      after(async () => {
        try {
          const skillBundle = await writeNewsClawSkillFiles({
            agentName: body.agentName,
            trackingTopics: body.trackingTopics,
            region: body.region,
          });

          const latestRestoreJob = getLatestRestoreJobByUserId(user.id);

          if (latestRestoreJob?.status !== "completed") {
            return;
          }

          const instanceIdentifier = getRestoreInstanceIdentifier(latestRestoreJob);

          if (!instanceIdentifier) {
            console.error("Saved preferred topics, but no deployment identifier is available to deploy the NewsClaw skill bundle.");
            return;
          }

          const deployResult = await runClawmacdoCommand([
            "skill-deploy",
            "--instance",
            instanceIdentifier,
            "--file",
            skillBundle.zipFilePath,
          ]);

          if (deployResult.code !== 0) {
            console.error(
              sanitizeProvisioningText(
                deployResult.stderr || deployResult.stdout || "Unable to deploy the NewsClaw skill bundle to the OpenClaw instance.",
              ),
            );
          }
        } catch (caughtError) {
          console.error("Unable to sync NewsClaw skill bundle after saving preferred topics.", caughtError);
        }
      });
    }

    return NextResponse.json({ success: true, nextPath: "/restore-instance", skillSyncQueued: shouldSyncSkills });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to save OpenClaw agent.");

    return NextResponse.json({ error: message }, { status: 400 });
  }
}