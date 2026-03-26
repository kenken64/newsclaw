import "server-only";

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import type {
  MessagingPairingRecord,
  RestoreJobRecord,
  UserChannelConfigRecord,
} from "@/lib/db";

export const DEFAULT_LIGHTSAIL_REGION = "ap-southeast-1";
export const DEFAULT_LIGHTSAIL_SIZE = "s-2vcpu-4gb";
export const DEFAULT_DIGITALOCEAN_REGION = "sgp1";
export const DEFAULT_DIGITALOCEAN_SIZE = "s-2vcpu-4gb";

export type ProvisioningProvider = "lightsail" | "digitalocean";

const PROVISIONING_NOISE_PATTERNS = [
  /^\[stderr\]\s*Azure CLI not found .*$/u,
  /^Azure CLI not found .*$/u,
  /^\[stderr\]\s*Warning: Azure CLI prerequisite check failed:.*$/u,
  /^Warning: Azure CLI prerequisite check failed:.*$/u,
  /^Found an existing package already installed\..*$/u,
  /^No available upgrade found\.?$/u,
  /^No newer package versions are available from the configured sources\.?$/u,
  /^[-\\/|]+$/u,
];

type WorkerPayload =
  | {
      mode: "restore";
      jobId: string;
      userId: string;
  provider: ProvisioningProvider;
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

export function normalizeProvisioningProvider(value: string | null | undefined): ProvisioningProvider {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "digitalocean" || normalized === "do") {
    return "digitalocean";
  }

  return "lightsail";
}

export function getProvisioningProviderDisplayName(provider: ProvisioningProvider) {
  return provider === "digitalocean" ? "DigitalOcean" : "AWS Lightsail";
}

function getAwsCliCompatConfigPath() {
  if (process.env.AWS_CONFIG_FILE?.trim()) {
    return process.env.AWS_CONFIG_FILE.trim();
  }

  const configDirectory = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "aws"
  );
  const configPath = path.join(configDirectory, "config");

  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configDirectory, { recursive: true });
    fs.writeFileSync(configPath, "[default]\ncli_timestamp_format = wire\n", "utf8");
  }

  return configPath;
}

function getSpawnOptions(command: string, commandArgs: string[]) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const commandLine = [quoteWindowsArgument(command), ...commandArgs.map(quoteWindowsArgument)].join(" ");

    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", commandLine],
    };
  }

  return {
    command,
    args: commandArgs,
  };
}

function quoteWindowsArgument(value: string) {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  let quoted = '"';
  let backslashCount = 0;

  for (const character of value) {
    if (character === "\\") {
      backslashCount += 1;
      continue;
    }

    if (character === '"') {
      quoted += "\\".repeat(backslashCount * 2 + 1);
      quoted += character;
      backslashCount = 0;
      continue;
    }

    if (backslashCount > 0) {
      quoted += "\\".repeat(backslashCount);
      backslashCount = 0;
    }

    quoted += character;
  }

  if (backslashCount > 0) {
    quoted += "\\".repeat(backslashCount * 2);
  }

  quoted += '"';
  return quoted;
}

export function getProvisioningConfig() {
  const provider = normalizeProvisioningProvider(process.env.CLAWMACDO_PROVIDER);

  return {
    provider,
    snapshotName: process.env.CLAWMACDO_SNAPSHOT_NAME?.trim() ?? "",
    region: provider === "digitalocean"
      ? process.env.DO_REGION?.trim() || DEFAULT_DIGITALOCEAN_REGION
      : process.env.AWS_REGION?.trim() || DEFAULT_LIGHTSAIL_REGION,
    size: process.env.CLAWMACDO_INSTANCE_SIZE?.trim()
      || (provider === "digitalocean" ? DEFAULT_DIGITALOCEAN_SIZE : DEFAULT_LIGHTSAIL_SIZE),
  };
}

export function sanitizeProvisioningText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !PROVISIONING_NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getProvisioningReadiness() {
  const missing: string[] = [];
  const config = getProvisioningConfig();

  if (config.provider === "digitalocean") {
    if (!process.env.DO_TOKEN?.trim()) {
      missing.push("DO_TOKEN");
    }
  } else {
    if (!process.env.AWS_ACCESS_KEY_ID?.trim()) {
      missing.push("AWS_ACCESS_KEY_ID");
    }

    if (!process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
      missing.push("AWS_SECRET_ACCESS_KEY");
    }
  }

  if (!config.snapshotName) {
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
    rawOutput: sanitizeProvisioningText(job.rawOutput),
    errorMessage: job.errorMessage ? sanitizeProvisioningText(job.errorMessage) : null,
    progressPercent: getRestoreJobProgress(job),
  };
}

export function serializeMessagingPairing(pairing: MessagingPairingRecord | null) {
  if (!pairing) {
    return null;
  }

  return {
    ...pairing,
    qrOutput: sanitizeProvisioningText(pairing.qrOutput),
    instructionText: sanitizeProvisioningText(pairing.instructionText),
    errorMessage: pairing.errorMessage ? sanitizeProvisioningText(pairing.errorMessage) : null,
  };
}

function matchRestoreOutputField(rawOutput: string, label: string) {
  const pattern = new RegExp(`^\\s*${label}:\\s+(.+)$`, "imu");
  const match = rawOutput.match(pattern);
  return match?.[1]?.trim() || null;
}

export function getRestoreInstanceIdentifier(job: RestoreJobRecord | null) {
  if (!job) {
    return null;
  }

  return (
    job.deployId ||
    job.hostname ||
    job.ipAddress ||
    matchRestoreOutputField(job.rawOutput, "Deploy ID") ||
    matchRestoreOutputField(job.rawOutput, "Hostname") ||
    matchRestoreOutputField(job.rawOutput, "IP Address")
  );
}

export function runClawmacdoCommand(commandArgs: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const spawnOptions = getSpawnOptions(getClawmacdoBinaryPath(), commandArgs);

    const child = spawn(spawnOptions.command, spawnOptions.args, {
      cwd: /* turbopackIgnore: true */ process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AWS_CONFIG_FILE: getAwsCliCompatConfigPath(),
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

export async function getTelegramChatIdFromInstance(instance: string) {
  const result = await runClawmacdoCommand([
    "telegram-chat-id",
    "--instance",
    instance,
  ]);

  const output = sanitizeProvisioningText(result.stdout || result.stderr);

  if (result.code !== 0) {
    throw new Error(output || "Unable to fetch the Telegram chat ID from OpenClaw.");
  }

  const chatIdMatch = output.match(/"allowFrom"\s*:\s*\[\s*"(-?\d+)"/u);

  if (!chatIdMatch?.[1]) {
    throw new Error("No Telegram chat ID is available on the restored OpenClaw instance yet.");
  }

  return chatIdMatch[1];
}

function runExternalCommand(command: string, commandArgs: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const spawnOptions = getSpawnOptions(command, commandArgs);

    const child = spawn(spawnOptions.command, spawnOptions.args, {
      cwd: /* turbopackIgnore: true */ process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AWS_CONFIG_FILE: getAwsCliCompatConfigPath(),
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

export async function verifyLightsailSnapshotExists(snapshotName: string, region: string) {
  const awsCommand = process.env.AWS_CLI_BIN?.trim() || "aws";

  try {
    const result = await runExternalCommand(awsCommand, [
      "lightsail",
      "get-instance-snapshot",
      "--instance-snapshot-name",
      snapshotName,
      "--region",
      region,
    ]);

    if (result.code === 0) {
      return { ok: true as const };
    }

    const details = sanitizeProvisioningText(result.stderr || result.stdout);

    if (/NotFoundException|DoesNotExist|does not exist|Snapshot not found/iu.test(details)) {
      return {
        ok: false as const,
        error: `The Lightsail snapshot "${snapshotName}" was not found in region "${region}". Update CLAWMACDO_SNAPSHOT_NAME or AWS_REGION and try again.`,
      };
    }

    return {
      ok: false as const,
      error: details || `Unable to verify the Lightsail snapshot "${snapshotName}" in region "${region}".`,
    };
  } catch (error) {
    const message = error instanceof Error ? sanitizeProvisioningText(error.message) : "Unable to verify the Lightsail snapshot.";

    if (/ENOENT|not recognized|cannot find/iu.test(message)) {
      return {
        ok: false as const,
        error: "AWS CLI is not available on this machine, so NewsClaw cannot verify the Lightsail snapshot before provisioning.",
      };
    }

    return {
      ok: false as const,
      error: message || `Unable to verify the Lightsail snapshot "${snapshotName}" in region "${region}".`,
    };
  }
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
      AWS_CONFIG_FILE: getAwsCliCompatConfigPath(),
    },
  });

  child.unref();

  return child.pid ?? null;
}

export async function verifyDigitalOceanSnapshotExists(snapshotName: string) {
  const token = process.env.DO_TOKEN?.trim();

  if (!token) {
    return {
      ok: false as const,
      error: "DO_TOKEN is required before NewsClaw can verify the DigitalOcean snapshot.",
    };
  }

  try {
    const response = await fetch("https://api.digitalocean.com/v2/snapshots?resource_type=droplet&per_page=200", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as
      | { snapshots?: Array<{ name?: string }>; message?: string }
      | null;

    if (!response.ok) {
      return {
        ok: false as const,
        error: sanitizeProvisioningText(payload?.message) || `Unable to verify the DigitalOcean snapshot "${snapshotName}".`,
      };
    }

    const snapshots = payload?.snapshots ?? [];
    const hasSnapshot = snapshots.some((snapshot) => snapshot.name?.trim() === snapshotName);

    if (!hasSnapshot) {
      return {
        ok: false as const,
        error: `The DigitalOcean snapshot "${snapshotName}" was not found. Update CLAWMACDO_SNAPSHOT_NAME or DO_TOKEN and try again.`,
      };
    }

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? sanitizeProvisioningText(error.message) : "Unable to verify the DigitalOcean snapshot.";

    return {
      ok: false as const,
      error: message || `Unable to verify the DigitalOcean snapshot "${snapshotName}".`,
    };
  }
}

export async function verifyProvisioningSnapshotExists(config: ReturnType<typeof getProvisioningConfig>) {
  if (config.provider === "digitalocean") {
    return verifyDigitalOceanSnapshotExists(config.snapshotName);
  }

  return verifyLightsailSnapshotExists(config.snapshotName, config.region);
}