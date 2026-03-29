import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createDailyDigestSchedule,
  deleteDailyDigestSchedule,
  getDailyDigestScheduleById,
  getDailyDigestScheduleByUserIdAndTime,
  getDailyDigestSchedulesByUserId,
  getLatestRestoreJobByUserId,
  getOpenClawAgentByUserId,
  updateDailyDigestSchedule,
  getUserChannelConfigByUserId,
} from "@/lib/db";
import {
  getRestoreInstanceIdentifier,
  getTelegramChatIdFromInstance,
  runClawmacdoCommand,
  sanitizeProvisioningText,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";
import { getValidationErrorMessage } from "@/lib/validation";

const requestSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/u, "Enter a valid daily time in HH:MM format."),
  channel: z.enum(["whatsapp", "telegram"]).optional(),
  recipient: z.string().trim().max(80, "Keep the delivery target under 80 characters.").optional().default(""),
  prompt: z.string().trim().max(2000, "Keep the daily digest prompt under 2000 characters.").optional().default(""),
});

const deleteSchema = z.object({
  id: z.string().uuid("Select a valid daily digest schedule to remove."),
});

const updateSchema = z.object({
  id: z.string().uuid("Select a valid daily digest schedule to update."),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/u, "Enter a valid daily time in HH:MM format."),
});

const SINGAPORE_TIMEZONE = "Asia/Singapore";
const SINGAPORE_UTC_OFFSET_HOURS = 8;
const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/u;
const WHATSAPP_PHONE_PATTERN = /^\+65[89]\d{7}$/u;
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/gu;
const REMOTE_CRON_UNREACHABLE_PATTERN = /(?:SSH error: .*?(?:connection timed out|operation timed out|no route to host|network is unreachable|connection refused|could not resolve hostname)|TCP connect .*?(?:connection timed out|operation timed out)|i\/o timeout)/iu;

function convertSingaporeTimeToUtc(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const utcHour = (hour - SINGAPORE_UTC_OFFSET_HOURS + 24) % 24;

  return `${String(utcHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildCronExpression(time: string) {
  const [hour, minute] = convertSingaporeTimeToUtc(time).split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

function buildDailyDigestJobName(userId: string, time: string) {
  return `newsclaw-digest-${userId.slice(0, 8)}-${time.replace(":", "")}`;
}

function buildDigestPrompt(agentName: string, region: string, trackingTopics: string[], customPrompt?: string) {
  const topics = trackingTopics.join(", ");
  const trimmedPrompt = customPrompt?.trim();

  return [
    `Prepare the daily NewsClaw digest for ${agentName}.`,
    `Region focus: ${region}.`,
    `Preferred topics: ${topics}.`,
    "Summarize the most important developments, explain why they matter, and include direct source links.",
    trimmedPrompt ? `Additional instructions: ${trimmedPrompt}` : null,
  ].filter(Boolean).join(" ");
}

function serializeSchedules(userId: string) {
  return getDailyDigestSchedulesByUserId(userId).map((schedule) => ({
    id: schedule.id,
    time: schedule.timeSgt,
    timezone: SINGAPORE_TIMEZONE,
    utcTime: schedule.timeUtc,
    jobName: schedule.jobName,
    deliveryChannel: schedule.deliveryChannel,
    deliveryTarget: schedule.deliveryTarget,
    promptText: schedule.promptText,
  }));
}

function resolveDeliveryTarget(
  preferredChannel: "whatsapp" | "telegram",
  requestedRecipient: string,
  defaultWhatsAppPhoneNumber: string | null,
) {
  const deliveryTarget = requestedRecipient.trim() || (preferredChannel === "whatsapp" ? defaultWhatsAppPhoneNumber?.trim() ?? "" : "");

  if (!deliveryTarget) {
    if (preferredChannel === "telegram") {
      throw new Error("Enter the Telegram chat ID that should receive this scheduled digest.");
    }

    throw new Error("Enter the WhatsApp phone number that should receive this scheduled digest.");
  }

  if (preferredChannel === "telegram" && !TELEGRAM_CHAT_ID_PATTERN.test(deliveryTarget)) {
    throw new Error("Telegram schedules require a numeric chat ID.");
  }

  if (preferredChannel === "whatsapp" && !WHATSAPP_PHONE_PATTERN.test(deliveryTarget)) {
    throw new Error("WhatsApp schedules require a valid Singapore mobile number (+65 followed by 8 digits starting with 8 or 9).");
  }

  return deliveryTarget;
}

function sanitizeLiveCronOutput(output: string) {
  return sanitizeProvisioningText(output)
    .replace(ANSI_ESCAPE_PATTERN, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Bind:\s+/iu.test(line))
    .filter((line) => !/^Gateway target:\s+/iu.test(line))
    .filter((line) => !/^\[plugins\]/iu.test(line))
    .filter((line) => !/^\[telegram\]/iu.test(line))
    .filter((line) => !/^\[moltguard\]/iu.test(line))
    .filter((line) => !/plugins\.allow is empty/iu.test(line))
    .filter((line) => !/OpenGuardrails dashboard started/iu.test(line))
    .filter((line) => !/Gateway port .* is still in use after waiting/iu.test(line))
    .filter((line) => !/^Config warnings:/iu.test(line))
    .filter((line) => !/Config warnings:.*plugins\.entries\.\w+:\s*plugin not found/iu.test(line))
    .filter((line) => !/^-\s*plugins\.entries\.\w+:\s*plugin not found/iu.test(line))
    .filter((line) => !/plugins\.entries\.\w+:\s*plugin not found/iu.test(line))
    .filter((line) => !/^[│├╮╯◇─╭╰┤┌┐└┘┬┴┼▐▌░▒▓█]+$/u.test(line.replace(/\s/g, "")))
    .filter((line) => !/^[│╮╯◇]\s*Config warnings/iu.test(line))
    .filter((line) => !/stale config entry ignored/iu.test(line))
    .join("\n")
    .trim();
}

function isRemoteCronCleanupRecoverableError(output: string) {
  return REMOTE_CRON_UNREACHABLE_PATTERN.test(sanitizeProvisioningText(output));
}

function parseLiveCronRecords(output: string) {
  const lines = sanitizeLiveCronOutput(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [] as Array<{
      id: string;
      name: string;
      schedule: string;
      next: string;
      last: string;
      status: string;
      target: string;
      agentId: string;
      model: string;
    }>;
  }

  const headerIndex = lines.findIndex((line) => /^ID\s+Name\s+Schedule\s+Next\s+Last\s+Status\s+Target\s+Agent\s+ID\s+Model$/iu.test(line));

  if (headerIndex === -1) {
    return [] as Array<{
      id: string;
      name: string;
      schedule: string;
      next: string;
      last: string;
      status: string;
      target: string;
      agentId: string;
      model: string;
    }>;
  }

  return lines
    .slice(headerIndex + 1)
    .map((line) => line.split(/\s+/).map((part) => part.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 9)
    .map((parts) => {
      const id = parts[0];
      const name = parts[1];
      const model = parts.at(-1) ?? "-";
      const agentId = parts.at(-2) ?? "-";
      const target = parts.at(-3) ?? "-";
      const status = parts.at(-4) ?? "-";

      let middle = parts.slice(2, -4);
      let last = "-";
      let next = "-";

      if (middle.length >= 2 && middle.at(-1) === "ago") {
        last = middle.slice(-2).join(" ");
        middle = middle.slice(0, -2);
      } else if (middle.at(-1) === "-") {
        last = "-";
        middle = middle.slice(0, -1);
      }

      if (middle.length >= 2 && middle.at(-2) === "in") {
        next = middle.slice(-2).join(" ");
        middle = middle.slice(0, -2);
      } else if (middle.at(-1) === "-") {
        next = "-";
        middle = middle.slice(0, -1);
      }

      const schedule = middle.join(" ");

      return {
        id,
        name,
        schedule,
        next,
        last,
        status,
        target,
        agentId,
        model,
      };
    });
}

async function getLiveCronJobs(instance: string) {
  const result = await runClawmacdoCommand([
    "cron-list",
    "--instance",
    instance,
  ]);

  const output = sanitizeLiveCronOutput(result.stdout || result.stderr);

  if (result.code !== 0) {
    throw new Error(output || "Unable to list the live cron jobs.");
  }

  if (!output || output === "No cron jobs.") {
    return {
      liveCronOutput: output || "No cron jobs.",
      liveCronLines: [] as string[],
      liveCronRecords: [] as Array<{
        id: string;
        name: string;
        schedule: string;
        next: string;
        last: string;
        status: string;
        target: string;
        agentId: string;
        model: string;
      }>,
    };
  }

  return {
    liveCronOutput: output,
    liveCronLines: output.split("\n").map((line) => line.trim()).filter(Boolean),
    liveCronRecords: parseLiveCronRecords(output),
  };
}

async function getLiveCronJobsSafe(instance: string) {
  try {
    return await getLiveCronJobs(instance);
  } catch (error) {
    const message = error instanceof Error
      ? sanitizeLiveCronOutput(error.message) || "Unable to list the live cron jobs right now."
      : "Unable to list the live cron jobs right now.";

    return {
      liveCronOutput: message,
      liveCronLines: [] as string[],
      liveCronRecords: [] as Array<{
        id: string;
        name: string;
        schedule: string;
        next: string;
        last: string;
        status: string;
        target: string;
        agentId: string;
        model: string;
      }>,
    };
  }
}

function getDailyDigestContext(userId: string) {
  const agent = getOpenClawAgentByUserId(userId);

  if (!agent) {
    return { error: "Set up your OpenClaw agent before scheduling a daily digest.", status: 400 } as const;
  }

  const restoreJob = getLatestRestoreJobByUserId(userId);

  if (!restoreJob || restoreJob.status !== "completed") {
    return { error: "Restore the OpenClaw instance before scheduling a daily digest.", status: 400 } as const;
  }

  const instance = getRestoreInstanceIdentifier(restoreJob);

  if (!instance) {
    return { error: "No deployment identifier is available for scheduling the daily digest.", status: 400 } as const;
  }

  return { agent, instance } as const;
}

export async function GET(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const context = getDailyDigestContext(user.id);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const liveCronJobs = await getLiveCronJobsSafe(context.instance);

  return NextResponse.json({ schedules: serializeSchedules(user.id), ...liveCronJobs });
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const context = getDailyDigestContext(user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const existing = getDailyDigestScheduleByUserIdAndTime(user.id, body.time);

    if (existing) {
      return NextResponse.json({ error: `A daily digest is already scheduled for ${body.time} SGT.` }, { status: 409 });
    }

    const jobName = buildDailyDigestJobName(user.id, body.time);
    const channelConfig = getUserChannelConfigByUserId(user.id);

    if (!channelConfig) {
      return NextResponse.json({ error: "Configure the delivery channel before scheduling a daily digest." }, { status: 400 });
    }

    const deliveryChannel = body.channel ?? channelConfig.preferredChannel;
    const requestedRecipient = deliveryChannel === "telegram" && !body.recipient.trim()
      ? await getTelegramChatIdFromInstance(context.instance)
      : body.recipient;
    const deliveryTarget = resolveDeliveryTarget(
      deliveryChannel,
      requestedRecipient,
      channelConfig.whatsappPhoneNumber,
    );

    createDailyDigestSchedule({
      userId: user.id,
      timeSgt: body.time,
      timeUtc: convertSingaporeTimeToUtc(body.time),
      jobName,
      deliveryChannel,
      deliveryTarget,
      promptText: body.prompt,
    });

    void (async () => {
      try {
        const result = await runClawmacdoCommand([
          "cron-message",
          "--instance",
          context.instance,
          "--name",
          jobName,
          "--schedule",
          buildCronExpression(body.time),
          "--channel",
          deliveryChannel,
          "--to",
          deliveryTarget,
          "--message",
          buildDigestPrompt(context.agent.agentName, context.agent.region, context.agent.trackingTopics, body.prompt),
        ]);

        if (result.code !== 0) {
          console.error("[daily-digest] Background cron-message failed:", sanitizeProvisioningText(result.stderr || result.stdout || ""));
        }
      } catch (error) {
        console.error("[daily-digest] Background cron-message error:", error instanceof Error ? error.message : error);
      }
    })();

    return NextResponse.json({
      success: true,
      scheduledTime: body.time,
      scheduledTimezone: SINGAPORE_TIMEZONE,
      scheduledUtcTime: convertSingaporeTimeToUtc(body.time),
      deliveryChannel,
      deliveryTarget,
      schedule: buildCronExpression(body.time),
      schedules: serializeSchedules(user.id),
    });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to schedule the daily digest.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = deleteSchema.parse(await request.json());
    const schedule = getDailyDigestScheduleById(body.id);

    if (!schedule || schedule.userId !== user.id) {
      return NextResponse.json({ error: "Daily digest schedule not found." }, { status: 404 });
    }

    const context = getDailyDigestContext(user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const result = await runClawmacdoCommand([
      "cron-remove",
      "--instance",
      context.instance,
      "--name",
      schedule.jobName,
    ]);

    if (result.code !== 0) {
      const details = sanitizeProvisioningText(
        result.stderr || result.stdout || "Unable to remove the OpenClaw cron job. The local daily digest schedule was not deleted.",
      );

      const jobAlreadyGone = /no cron job named|not found on this instance/iu.test(details);

      if (isRemoteCronCleanupRecoverableError(details) || jobAlreadyGone) {
        deleteDailyDigestSchedule(schedule.id);

        return NextResponse.json({
          success: true,
          remoteRemoved: jobAlreadyGone,
          removedJobName: schedule.jobName,
          warning: jobAlreadyGone
            ? "Daily digest removed. The remote cron job was already gone."
            : `Daily digest removed locally, but NewsClaw could not reach ${context.instance} to remove the OpenClaw cron job. ${details}`,
          schedules: serializeSchedules(user.id),
        });
      }

      return NextResponse.json(
        {
          error: details,
        },
        { status: 400 },
      );
    }

    deleteDailyDigestSchedule(schedule.id);

    return NextResponse.json({
      success: true,
      remoteRemoved: true,
      removedJobName: schedule.jobName,
      schedules: serializeSchedules(user.id),
    });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to remove the daily digest schedule.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = updateSchema.parse(await request.json());
    const schedule = getDailyDigestScheduleById(body.id);

    if (!schedule || schedule.userId !== user.id) {
      return NextResponse.json({ error: "Daily digest schedule not found." }, { status: 404 });
    }

    const context = getDailyDigestContext(user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    if (schedule.timeSgt === body.time) {
      return NextResponse.json({
        success: true,
        updatedTime: schedule.timeSgt,
        updatedUtcTime: schedule.timeUtc,
        schedules: serializeSchedules(user.id),
        ...(await getLiveCronJobsSafe(context.instance)),
      });
    }

    const existingAtTime = getDailyDigestScheduleByUserIdAndTime(user.id, body.time);

    if (existingAtTime && existingAtTime.id !== schedule.id) {
      return NextResponse.json({ error: `A daily digest is already scheduled for ${body.time} SGT.` }, { status: 409 });
    }

    const updatedUtcTime = convertSingaporeTimeToUtc(body.time);
    const updatedJobName = buildDailyDigestJobName(user.id, body.time);

    updateDailyDigestSchedule(schedule.id, {
      timeSgt: body.time,
      timeUtc: updatedUtcTime,
      jobName: updatedJobName,
    });

    void (async () => {
      try {
        const removeJobs = [
          runClawmacdoCommand(["cron-remove", "--instance", context.instance, "--name", schedule.jobName]),
        ];

        if (updatedJobName !== schedule.jobName) {
          removeJobs.push(
            runClawmacdoCommand(["cron-remove", "--instance", context.instance, "--name", updatedJobName]),
          );
        }

        await Promise.all(removeJobs);

        const result = await runClawmacdoCommand([
          "cron-message",
          "--instance",
          context.instance,
          "--name",
          updatedJobName,
          "--schedule",
          buildCronExpression(body.time),
          "--channel",
          schedule.deliveryChannel,
          "--to",
          schedule.deliveryTarget,
          "--message",
          buildDigestPrompt(context.agent.agentName, context.agent.region, context.agent.trackingTopics, schedule.promptText),
        ]);

        if (result.code !== 0) {
          console.error("[daily-digest] Background time update failed:", sanitizeProvisioningText(result.stderr || result.stdout || ""));
        }
      } catch (error) {
        console.error("[daily-digest] Background time update error:", error instanceof Error ? error.message : error);
      }
    })();

    return NextResponse.json({
      success: true,
      updatedTime: body.time,
      updatedUtcTime,
      schedules: serializeSchedules(user.id),
    });
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to update the daily digest schedule.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}