import { NextResponse } from "next/server";

import {
  createRestoreJob,
  getLatestRestoreJobByUserId,
  getOpenClawAgentByUserId,
} from "@/lib/db";
import {
  getProvisioningConfig,
  getProvisioningReadiness,
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

  return NextResponse.json({
    restoreJob: serializeRestoreJob(restoreJob),
    missingConfig: getProvisioningReadiness(),
  });
}

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const agent = getOpenClawAgentByUserId(user.id);

  if (!agent) {
    return NextResponse.json({ error: "Configure the OpenClaw agent before starting restore." }, { status: 400 });
  }

  const missingConfig = getProvisioningReadiness();

  if (missingConfig.length > 0) {
    return NextResponse.json({ error: `Missing provisioning configuration: ${missingConfig.join(", ")}.` }, { status: 400 });
  }

  const latestRestoreJob = getLatestRestoreJobByUserId(user.id);

  if (latestRestoreJob?.status === "running" || latestRestoreJob?.status === "pending") {
    return NextResponse.json({ restoreJob: serializeRestoreJob(latestRestoreJob) });
  }

  if (latestRestoreJob?.status === "completed") {
    return NextResponse.json({ restoreJob: serializeRestoreJob(latestRestoreJob) });
  }

  const config = getProvisioningConfig();
  const restoreJob = createRestoreJob({
    userId: user.id,
    provider: "lightsail",
    snapshotName: config.snapshotName,
    region: config.region,
    size: config.size,
  });

  spawnProvisioningWorker({
    mode: "restore",
    jobId: restoreJob.id,
    userId: user.id,
    snapshotName: restoreJob.snapshotName,
    region: restoreJob.region,
    size: restoreJob.size,
  });

  return NextResponse.json({ restoreJob: serializeRestoreJob(restoreJob) });
}