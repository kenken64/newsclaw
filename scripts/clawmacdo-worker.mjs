import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { encryptPrivateKey } from "./clawmacdo-crypto.mjs";

const payload = JSON.parse(process.argv[2] ?? "{}");
const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
const dataDirectorySetting = process.env.SQLITE_DATA_DIR?.trim() || "./data";
const dataDirectory = path.resolve(workspaceRoot, dataDirectorySetting);
const databaseFile = path.join(dataDirectory, "newsclaw.db");
const clawmacdoBin = process.env.CLAWMACDO_BIN;
const encryptionSecret = process.env.NEWSCLAW_KEY_ENCRYPTION_SECRET;

if (!clawmacdoBin) {
  throw new Error("CLAWMACDO_BIN is not configured for the worker.");
}

if (!encryptionSecret?.trim()) {
  throw new Error("NEWSCLAW_KEY_ENCRYPTION_SECRET is required for the worker.");
}

fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

const db = new Database(databaseFile);
let activeCommandChild = null;
let shuttingDown = false;

function getClawmacdoSpawnOptions(commandArgs) {
  if (process.platform === "win32" && /\.cmd$/i.test(clawmacdoBin)) {
    const commandLine = [quoteWindowsArgument(clawmacdoBin), ...commandArgs.map(quoteWindowsArgument)].join(" ");

    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", commandLine],
    };
  }

  return {
    command: clawmacdoBin,
    args: commandArgs,
  };
}

function quoteWindowsArgument(value) {
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

function isRestoreCanceled(jobId) {
  const row = db.prepare("SELECT status FROM restore_jobs WHERE id = ?").get(jobId);
  return row?.status === "canceled";
}

function now() {
  return new Date().toISOString();
}

function appendRestoreOutput(jobId, chunk) {
  db.prepare(
    "UPDATE restore_jobs SET raw_output = COALESCE(raw_output, '') || ?, updated_at = ? WHERE id = ?",
  ).run(chunk, now(), jobId);
}

function updateRestoreJob(jobId, input) {
  const current = db.prepare("SELECT * FROM restore_jobs WHERE id = ?").get(jobId);

  if (!current) {
    return;
  }

  db.prepare(
    `UPDATE restore_jobs
     SET status = ?, current_step = ?, total_steps = ?, step_label = ?, deploy_id = ?, hostname = ?, ip_address = ?,
       ssh_key_path = ?, worker_pid = ?, ssh_private_key_encrypted = ?, error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.status ?? current.status,
    input.current_step ?? current.current_step,
    input.total_steps ?? current.total_steps,
    input.step_label === undefined ? current.step_label : input.step_label,
    input.deploy_id === undefined ? current.deploy_id : input.deploy_id,
    input.hostname === undefined ? current.hostname : input.hostname,
    input.ip_address === undefined ? current.ip_address : input.ip_address,
    input.ssh_key_path === undefined ? current.ssh_key_path : input.ssh_key_path,
    input.worker_pid === undefined ? current.worker_pid : input.worker_pid,
    input.ssh_private_key_encrypted === undefined ? current.ssh_private_key_encrypted : input.ssh_private_key_encrypted,
    input.error_message === undefined ? current.error_message : input.error_message,
    input.completed_at === undefined ? current.completed_at : input.completed_at,
    now(),
    jobId,
  );
}

function upsertMessagingPairing(input) {
  const current = db.prepare("SELECT * FROM messaging_pairings WHERE user_id = ?").get(input.user_id);
  const timestamp = now();

  if (current) {
    db.prepare(
      `UPDATE messaging_pairings
       SET restore_job_id = ?, channel = ?, status = ?, qr_output = ?, instruction_text = ?, pairing_code = ?, error_message = ?, last_updated_at = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(
      input.restore_job_id,
      input.channel,
      input.status,
      input.qr_output ?? current.qr_output,
      input.instruction_text ?? current.instruction_text,
      input.pairing_code === undefined ? current.pairing_code : input.pairing_code,
      input.error_message === undefined ? current.error_message : input.error_message,
      input.last_updated_at === undefined ? current.last_updated_at : input.last_updated_at,
      timestamp,
      input.user_id,
    );
    return;
  }

  db.prepare(
    `INSERT INTO messaging_pairings (
      id, user_id, restore_job_id, channel, status, qr_output, instruction_text, pairing_code, error_message, last_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    input.user_id,
    input.restore_job_id,
    input.channel,
    input.status,
    input.qr_output ?? "",
    input.instruction_text ?? "",
    input.pairing_code ?? null,
    input.error_message ?? null,
    input.last_updated_at ?? null,
    timestamp,
    timestamp,
  );
}

function runCommand(commandArgs, handlers) {
  return new Promise((resolve, reject) => {
    const spawnOptions = getClawmacdoSpawnOptions(commandArgs);

    const child = spawn(spawnOptions.command, spawnOptions.args, {
      cwd: workspaceRoot,
      windowsHide: true,
      env: {
        ...process.env,
      },
    });

    activeCommandChild = child;
    const cancelWatcher = payload.mode === "restore"
      ? setInterval(() => {
          if (isRestoreCanceled(payload.jobId) && activeCommandChild && !activeCommandChild.killed) {
            activeCommandChild.kill("SIGTERM");
          }
        }, 1000)
      : null;

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";

    function flushLines(buffer, callback) {
      const lines = buffer.split(/\r?\n/);
      const remainder = lines.pop() ?? "";

      for (const line of lines) {
        callback(line);
      }

      return remainder;
    }

    child.stdout.on("data", (chunk) => {
      const value = chunk.toString();
      stdout += value;
      stdoutBuffer += value;
      stdoutBuffer = flushLines(stdoutBuffer, handlers.onStdoutLine);
    });

    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      stderrBuffer += value;
      stderrBuffer = flushLines(stderrBuffer, handlers.onStderrLine);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      activeCommandChild = null;

      if (cancelWatcher) {
        clearInterval(cancelWatcher);
      }

      if (stdoutBuffer) {
        handlers.onStdoutLine(stdoutBuffer);
      }

      if (stderrBuffer) {
        handlers.onStderrLine(stderrBuffer);
      }

      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function runRestore() {
  const metadata = {
    deploy_id: null,
    hostname: null,
    ip_address: null,
    ssh_key_path: null,
    ssh_private_key_encrypted: null,
  };

  updateRestoreJob(payload.jobId, { status: "running", error_message: null, worker_pid: process.pid });

  const commandArgs = payload.provider === "digitalocean"
    ? [
        "do-restore",
        "--snapshot-name",
        payload.snapshotName,
        "--region",
        payload.region,
        "--size",
        payload.size,
      ]
    : [
        "ls-restore",
        "--snapshot-name",
        payload.snapshotName,
        "--region",
        payload.region,
        "--size",
        payload.size,
      ];

  const result = await runCommand(commandArgs, {
    onStdoutLine(line) {
      appendRestoreOutput(payload.jobId, `${line}\n`);

      const stepMatch = line.match(/^\[Step\s+(\d+)\/(\d+)\]\s+(.+)$/);

      if (stepMatch) {
        updateRestoreJob(payload.jobId, {
          status: "running",
          current_step: Number(stepMatch[1]),
          total_steps: Number(stepMatch[2]),
          step_label: stepMatch[3].trim(),
        });
      }

      const deployIdMatch = line.match(/^\s*Deploy ID:\s+(.+)$/);
      if (deployIdMatch) {
        metadata.deploy_id = deployIdMatch[1].trim();
      }

      const hostnameMatch = line.match(/^\s*Hostname:\s+(.+)$/);
      if (hostnameMatch) {
        metadata.hostname = hostnameMatch[1].trim();
      }

      const ipMatch = line.match(/^\s*IP Address:\s+(.+)$/);
      if (ipMatch) {
        metadata.ip_address = ipMatch[1].trim();
      }

      const sshKeyMatch = line.match(/^\s*SSH Key:\s+(.+)$/);
      if (sshKeyMatch) {
        metadata.ssh_key_path = sshKeyMatch[1].trim();
      }
    },
    onStderrLine(line) {
      appendRestoreOutput(payload.jobId, `[stderr] ${line}\n`);
    },
  });

  if (result.code !== 0) {
    const current = db.prepare("SELECT status FROM restore_jobs WHERE id = ?").get(payload.jobId);

    if (current?.status === "canceled") {
      return;
    }

    updateRestoreJob(payload.jobId, {
      status: "failed",
      step_label: "Restore failed",
      worker_pid: null,
      error_message: (result.stderr || result.stdout || "Restore failed.").trim(),
      completed_at: now(),
    });
    return;
  }

  if (metadata.ssh_key_path) {
    const privateKey = fs.readFileSync(metadata.ssh_key_path, "utf8");
    metadata.ssh_private_key_encrypted = encryptPrivateKey(privateKey, encryptionSecret);
  }

  updateRestoreJob(payload.jobId, {
    status: "completed",
    current_step: 5,
    total_steps: 5,
    step_label: "Restore complete",
    deploy_id: metadata.deploy_id,
    hostname: metadata.hostname,
    ip_address: metadata.ip_address,
    ssh_key_path: metadata.ssh_key_path,
    worker_pid: null,
    ssh_private_key_encrypted: metadata.ssh_private_key_encrypted,
    error_message: null,
    completed_at: now(),
  });
}

function cancelRestoreFromSignal() {
  if (payload.mode !== "restore" || shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (activeCommandChild && !activeCommandChild.killed) {
    activeCommandChild.kill("SIGTERM");
  }

  appendRestoreOutput(payload.jobId, "[cancel] Restore canceled by user.\n");
  updateRestoreJob(payload.jobId, {
    status: "canceled",
    step_label: "Restore canceled",
    worker_pid: null,
    error_message: null,
    completed_at: now(),
  });

  process.exit(0);
}

process.on("SIGTERM", cancelRestoreFromSignal);
process.on("SIGINT", cancelRestoreFromSignal);

async function runMessagingSetup(mode) {
  const pairingStatus = mode === "telegram-setup" ? "awaiting_code" : "fetching_qr";

  upsertMessagingPairing({
    user_id: payload.userId,
    restore_job_id: payload.restoreJobId,
    channel: payload.channel,
    status: pairingStatus,
    qr_output: "",
    instruction_text: mode === "telegram-setup" ? "Setting up Telegram bot and waiting for pairing challenge code." : "Fetching WhatsApp pairing QR code.",
    pairing_code: null,
    error_message: null,
  });

  const commandArgs =
    mode === "telegram-setup"
      ? ["telegram-setup", "--instance", payload.instance, "--bot-token", payload.telegramBotToken]
      : mode === "whatsapp-setup"
        ? ["whatsapp-setup", "--instance", payload.instance, "--phone-number", payload.phoneNumber]
        : ["whatsapp-qr", "--instance", payload.instance];

  const result = await runCommand(commandArgs, {
    onStdoutLine() {},
    onStderrLine() {},
  });

  if (result.code !== 0) {
    upsertMessagingPairing({
      user_id: payload.userId,
      restore_job_id: payload.restoreJobId,
      channel: payload.channel,
      status: "failed",
      qr_output: result.stdout.trim(),
      instruction_text: result.stdout.trim(),
      error_message: (result.stderr || result.stdout || "Unable to start the messaging pairing flow.").trim(),
      last_updated_at: now(),
    });
    return;
  }

  upsertMessagingPairing({
    user_id: payload.userId,
    restore_job_id: payload.restoreJobId,
    channel: payload.channel,
    status: mode === "telegram-setup" ? "awaiting_code" : "qr_ready",
    qr_output: mode === "telegram-setup" ? "" : result.stdout.trim(),
    instruction_text: mode === "telegram-setup" ? result.stdout.trim() : "Scan the QR code with WhatsApp to complete pairing.",
    error_message: null,
    last_updated_at: now(),
  });
}

try {
  if (payload.mode === "restore") {
    await runRestore();
  } else if (payload.mode === "whatsapp-setup" || payload.mode === "whatsapp-refresh" || payload.mode === "telegram-setup") {
    await runMessagingSetup(payload.mode);
  } else {
    throw new Error(`Unsupported worker mode: ${payload.mode}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Worker failed unexpectedly.";

  if (payload.mode === "restore") {
    updateRestoreJob(payload.jobId, {
      status: "failed",
      step_label: "Restore failed",
      worker_pid: null,
      error_message: message,
      completed_at: now(),
    });
  }

  if (payload.mode === "whatsapp-setup" || payload.mode === "whatsapp-refresh" || payload.mode === "telegram-setup") {
    upsertMessagingPairing({
      user_id: payload.userId,
      restore_job_id: payload.restoreJobId,
      channel: payload.channel,
      status: "failed",
      error_message: message,
      last_updated_at: now(),
    });
  }
}