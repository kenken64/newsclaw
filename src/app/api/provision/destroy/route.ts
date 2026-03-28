import { NextResponse } from "next/server";

import { db, getDailyDigestSchedulesByUserId, getLatestRestoreJobByUserId } from "@/lib/db";
import {
  getProvisioningConfig,
  getRestoreInstanceIdentifier,
  runClawmacdoCommand,
} from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const schedules = getDailyDigestSchedulesByUserId(user.id);

  if (schedules.length > 0) {
    return NextResponse.json(
      { error: `Remove all daily digest schedules before destroying the instance. You have ${schedules.length} active schedule(s).` },
      { status: 400 },
    );
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const instance = restoreJob ? getRestoreInstanceIdentifier(restoreJob) : null;
  const config = getProvisioningConfig();

  let destroyOutput = "";

  if (instance && restoreJob?.status === "completed") {
    try {
      const result = await runClawmacdoCommand([
        "destroy",
        "--provider",
        config.provider,
        "--name",
        instance,
        "--yes",
      ]);

      destroyOutput = (result.stdout || result.stderr || "").trim();

      if (result.code !== 0) {
        return NextResponse.json(
          { error: `Instance destroy failed: ${destroyOutput || "unknown error"}` },
          { status: 500 },
        );
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to destroy the instance.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  db.prepare("DELETE FROM messaging_pairings WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM restore_jobs WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM user_channel_configs WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM openclaw_agents WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM category_preferences WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM daily_digest_schedules WHERE user_id = ?").run(user.id);

  return NextResponse.json({ destroyed: Boolean(instance), output: destroyOutput });
}
