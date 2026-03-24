import "server-only";

import path from "node:path";
import { spawn } from "node:child_process";

import type {
  MessagingPairingRecord,
  RestoreJobRecord,
  UserChannelConfigRecord,
} from "@/lib/db";

export const DEFAULT_LIGHTSAIL_REGION = "ap-southeast-1";
export const DEFAULT_LIGHTSAIL_SIZE = "s-2vcpu-4gb";

type WorkerPayload =
  | {
      mode: "restore";
      jobId: string;
      userId: string;
      snapshotName: string;
      region: string;
      size: string;
    }
  | {
      mode: "whatsapp-setup" | "whatsapp-refresh" | "telegram-setup";
      restoreJobId: string;
      userId: string;
      instance: string;
      channel: "whatsapp" | "telegram";
      phoneNumber?: string;
      telegramBotToken?: string;
    };

export function getClawmacdoBinaryPath() {
  if (process.env.CLAWMACDO_BIN?.trim()) {
    return process.env.CLAWMACDO_BIN.trim();
  }

  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "clawmacdo.cmd" : "clawmacdo",
  );
}

export function getProvisioningConfig() {
  return {
    snapshotName: process.env.CLAWMACDO_SNAPSHOT_NAME?.trim() ?? "",
    region: process.env.AWS_REGION?.trim() || DEFAULT_LIGHTSAIL_REGION,
    size: process.env.CLAWMACDO_INSTANCE_SIZE?.trim() || DEFAULT_LIGHTSAIL_SIZE,
  };
}

export function getProvisioningReadiness() {
  const missing: string[] = [];

  if (!process.env.AWS_ACCESS_KEY_ID?.trim()) {
    missing.push("AWS_ACCESS_KEY_ID");
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    missing.push("AWS_SECRET_ACCESS_KEY");
  }

  if (!getProvisioningConfig().snapshotName) {
    missing.push("CLAWMACDO_SNAPSHOT_NAME");
  }

  return missing;
}

export function getPairingReadiness(channelConfig: UserChannelConfigRecord | null) {
  const missing: string[] = [];

  if (!channelConfig) {
    missing.push("channel-config");
    return missing;
  }

  if (channelConfig.preferredChannel === "whatsapp" && !channelConfig.whatsappPhoneNumber) {
    missing.push("whatsapp-phone-number");
  }

  if (channelConfig.preferredChannel === "telegram" && !channelConfig.telegramBotTokenEncrypted) {
    missing.push("telegram-bot-token");
  }

  return missing;
}

export function getRestoreJobProgress(job: RestoreJobRecord | null) {
  if (!job || job.totalSteps <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((job.currentStep / job.totalSteps) * 100)));
}

export function serializeRestoreJob(job: RestoreJobRecord | null) {
  if (!job) {
    return null;
  }

  return {
    ...job,
    progressPercent: getRestoreJobProgress(job),
  };
}

export function serializeMessagingPairing(pairing: MessagingPairingRecord | null) {
  if (!pairing) {
    return null;
  }

  return pairing;
}

export function runClawmacdoCommand(commandArgs: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(getClawmacdoBinaryPath(), commandArgs, {
      cwd: /* turbopackIgnore: true */ process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

export function spawnProvisioningWorker(payload: WorkerPayload) {
  const workerPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "scripts",
    "clawmacdo-worker.mjs",
  );

  const child = spawn(process.execPath, [workerPath, JSON.stringify(payload)], {
    cwd: /* turbopackIgnore: true */ process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      WORKSPACE_ROOT: /* turbopackIgnore: true */ process.cwd(),
      CLAWMACDO_BIN: getClawmacdoBinaryPath(),
    },
  });

  child.unref();
}