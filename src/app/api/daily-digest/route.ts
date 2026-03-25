import { NextResponse } from "next/server";
import { z } from "zod";

import { getLatestRestoreJobByUserId, getOpenClawAgentByUserId } from "@/lib/db";
import {
  getRestoreInstanceIdentifier,
  runClawmacdoCommand,
  sanitizeProvisioningText,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";
import { getValidationErrorMessage } from "@/lib/validation";

const requestSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/u, "Enter a valid daily time in HH:MM format."),
});

function buildCronExpression(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

function buildDigestPrompt(agentName: string, region: string, trackingTopics: string[]) {
  const topics = trackingTopics.join(", ");

  return [
    `Prepare the daily NewsClaw digest for ${agentName}.`,
    `Region focus: ${region}.`,
    `Preferred topics: ${topics}.`,
    "Summarize the most important developments, explain why they matter, and include direct source links.",
  ].join(" ");
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const agent = getOpenClawAgentByUserId(user.id);

    if (!agent) {
      return NextResponse.json({ error: "Set up your OpenClaw agent before scheduling a daily digest." }, { status: 400 });
    }

    const restoreJob = getLatestRestoreJobByUserId(user.id);

    if (!restoreJob || restoreJob.status !== "completed") {
      return NextResponse.json({ error: "Restore the OpenClaw instance before scheduling a daily digest." }, { status: 400 });
    }

    const instance = getRestoreInstanceIdentifier(restoreJob);

    if (!instance) {
      return NextResponse.json({ error: "No deployment identifier is available for scheduling the daily digest." }, { status: 400 });
    }

    const jobName = `newsclaw-digest-${user.id.slice(0, 8)}`;

    await runClawmacdoCommand([
      "cron-remove",
      "--instance",
      instance,
      "--name",
      jobName,
    ]);

    const result = await runClawmacdoCommand([
      "cron-message",
      "--instance",
      instance,
      "--name",
      jobName,
      "--schedule",
      buildCronExpression(body.time),
      "--channel",
      "last",
      "--message",
      buildDigestPrompt(agent.agentName, agent.region, agent.trackingTopics),
    ]);

    if (result.code !== 0) {
      return NextResponse.json(
        {
          error: sanitizeProvisioningText(
            result.stderr || result.stdout || "Unable to schedule the daily digest.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      scheduledTime: body.time,
      schedule: buildCronExpression(body.time),
    });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to schedule the daily digest.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}