import { NextResponse } from "next/server";

import {
  createRestoreJob,
  getLatestRestoreJobByUserId,
  getOpenClawAgentByUserId,
  updateRestoreJob,
} from "@/lib/db";
import {
  getProvisioningConfig,
  getProvisioningReadiness,
  serializeRestoreJob,
  spawnProvisioningWorker,
  verifyLightsailSnapshotExists,
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
  const snapshotCheck = await verifyLightsailSnapshotExists(config.snapshotName, config.region);

  if (!snapshotCheck.ok) {
    return NextResponse.json({ error: snapshotCheck.error }, { status: 400 });
  }

  const restoreJob = createRestoreJob({
    userId: user.id,
    provider: "lightsail",
    snapshotName: config.snapshotName,
    region: config.region,
    size: config.size,
  });

  const workerPid = spawnProvisioningWorker({
    mode: "restore",
    jobId: restoreJob.id,
    userId: user.id,
    snapshotName: restoreJob.snapshotName,
    region: restoreJob.region,
    size: restoreJob.size,
  });

  if (workerPid) {
    updateRestoreJob(restoreJob.id, { workerPid });
  }

  return NextResponse.json({ restoreJob: serializeRestoreJob(getLatestRestoreJobByUserId(user.id)) });
}

export async function DELETE(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);

  if (!restoreJob || !["pending", "running"].includes(restoreJob.status)) {
    return NextResponse.json({ error: "There is no active restore to cancel." }, { status: 400 });
  }

  if (restoreJob.workerPid) {
    try {
      process.kill(restoreJob.workerPid, "SIGTERM");
    } catch {
      // Ignore process lookup failures; the worker also polls database status.
    }
  }

  updateRestoreJob(restoreJob.id, {
    status: "canceled",
    stepLabel: "Restore canceled",
    workerPid: null,
    errorMessage: null,
    completedAt: new Date().toISOString(),
  });

  return NextResponse.json({ restoreJob: serializeRestoreJob(getLatestRestoreJobByUserId(user.id)) });
}