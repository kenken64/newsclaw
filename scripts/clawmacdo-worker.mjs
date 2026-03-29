import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
const OPENCLAW_HOME = "/home/openclaw";
const RESTORE_PLUGIN_NAME = "@openguardrails/moltguard";
const RESTORE_PLUGIN_INSTALL_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.NEWSCLAW_RESTORE_PLUGIN_INSTALL_DELAY_MS ?? "15000", 10) || 15000,
);
const QR_GLYPH_PATTERN = /[█▀▄▐▌▖▗▘▙▚▛▜▝▞▟]/u;
const ANSI_QR_PATTERN = /(\x1b\[[0-9;]*m[ ]{2}){3,}/u;

function sanitizePairingOutput(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;]*m/gu, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^\[plugins\]/iu.test(line))
    .filter((line) => !/^\[telegram\]/iu.test(line))
    .filter((line) => !/^\[moltguard\]/iu.test(line))
    .filter((line) => !/^\[whatsapp\]/iu.test(line))
    .filter((line) => !/plugins\.allow is empty/iu.test(line))
    .filter((line) => !/OpenGuardrails dashboard started/iu.test(line))
    .filter((line) => !/Gateway port .* is still in use after waiting/iu.test(line))
    .filter((line) => !/^Configuring Telegram bot token\b/iu.test(line))
    .filter((line) => !/^Setting up Telegram\b/iu.test(line))
    .filter((line) => !/^Restarting gateway\b/iu.test(line))
    .filter((line) => !/^Config warnings:/iu.test(line))
    .filter((line) => !/Config warnings:.*plugins\.entries\.\w+:\s*plugin not found/iu.test(line))
    .filter((line) => !/^-\s*plugins\.entries\.\w+:\s*plugin not found/iu.test(line))
    .join("\n")
    .trim();
}

function getClawmacdoSpawnOptions(commandArgs) {
  if (process.platform === "win32" && /[\\/]node_modules[\\/]clawmacdo[\\/]bin[\\/]clawmacdo$/i.test(clawmacdoBin)) {
    return {
      command: process.execPath,
      args: [clawmacdoBin, ...commandArgs],
    };
  }

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

function getEncryptionKey(secret) {
  return crypto.scryptSync(secret, "newsclaw-restore-key", 32);
}

function decryptSecretValue(payloadValue) {
  const [version, iv, authTag, encrypted] = String(payloadValue ?? "").split(":");

  if (version !== "v1" || !iv || !authTag || !encrypted) {
    throw new Error("Encrypted payload format is invalid.");
  }

  const key = getEncryptionKey(encryptionSecret.trim());
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function sshUserForProvider(provider) {
  return provider === "lightsail" ? "ubuntu" : "root";
}

function getOpenClawRemoteShell(sshUser) {
  return sshUser === "root"
    ? "su - openclaw -s /bin/bash -c '/bin/bash -se'"
    : "sudo su - openclaw -s /bin/bash -c '/bin/bash -se'";
}

function getRestoreJobById(jobId) {
  return db.prepare("SELECT * FROM restore_jobs WHERE id = ?").get(jobId);
}

function resolveRestoreConnection(restoreJobId) {
  const restoreJob = getRestoreJobById(restoreJobId);

  if (!restoreJob) {
    throw new Error("Restore job not found for messaging setup.");
  }

  const host = restoreJob.ip_address || restoreJob.hostname;

  if (!host) {
    throw new Error("No SSH host is available for the restored instance.");
  }

  return {
    host,
    provider: restoreJob.provider || "digitalocean",
    sshKeyPath: restoreJob.ssh_key_path || null,
    sshPrivateKeyEncrypted: restoreJob.ssh_private_key_encrypted || null,
  };
}

function createTemporaryPrivateKeyFile(privateKey) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "newsclaw-ssh-"));
  const privateKeyPath = path.join(tempDirectory, "id_rsa");
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
  return {
    privateKeyPath,
    cleanup() {
      try {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures for temporary SSH material.
      }
    },
  };
}

function hasScannableQr(output) {
  return QR_GLYPH_PATTERN.test(output) || ANSI_QR_PATTERN.test(output);
}

function shouldRetryWhatsAppLogin(output, code) {
  if (code === 0) {
    return false;
  }

  const loweredOutput = String(output || "").toLowerCase();

  return (
    loweredOutput.includes("session logged out") ||
    loweredOutput.includes("whatsapp session logged out") ||
    loweredOutput.includes("cleared whatsapp web credentials") ||
    loweredOutput.includes("cleared cached web session")
  );
}

function hasCompletedWhatsAppLink(output) {
  const loweredOutput = String(output || "").toLowerCase();

  return (
    loweredOutput.includes("linked!") ||
    loweredOutput.includes("whatsapp linked") ||
    loweredOutput.includes("credentials saved for future sends") ||
    loweredOutput.includes("credentials saved")
  );
}

function getCleanStalePluginsCommand() {
  const configPath = `${OPENCLAW_HOME}/.openclaw/openclaw.json`;
  return `python3 -c "
import json, os
p = '${configPath}'
if not os.path.exists(p):
    exit(0)
d = json.load(open(p))
entries = d.get('plugins', {}).get('entries', {})
stale = [k for k in entries if k not in ('whatsapp', 'telegram', 'webchat')]
if stale:
    for k in stale:
        del entries[k]
    with open(p, 'w') as f:
        json.dump(d, f, indent=2)
    print('Removed stale plugins:', ', '.join(stale))
" 2>/dev/null || true`;
}

async function cleanStalePluginsOnInstance(restoreJobId) {
  try {
    await withRestoreSshConnection(restoreJobId, async (connection) => {
      await runSshCommand({
        ...connection,
        remoteCommand: getOpenClawRemoteShell(connection.sshUser),
        stdinScript: getCleanStalePluginsCommand(),
      });
    });
  } catch (_ignored) {
    // Non-fatal: stale plugins cause noise but don't break core functionality.
  }
}

function getWhatsAppSetupCommand(phoneNumber) {
  const envFile = `${OPENCLAW_HOME}/.openclaw/.env`;
  const pathValue = `${OPENCLAW_HOME}/.local/bin:${OPENCLAW_HOME}/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin`;

  return [
    `PHONE=${shellEscape(phoneNumber)}`,
    `ENV_FILE=${shellEscape(envFile)}`,
    `if grep -q '^WHATSAPP_PHONE_NUMBER=' "$ENV_FILE" 2>/dev/null; then sed -i "s|^WHATSAPP_PHONE_NUMBER=.*|WHATSAPP_PHONE_NUMBER=${"$"}PHONE|" "$ENV_FILE"; else printf 'WHATSAPP_PHONE_NUMBER=%s\\n' "${"$"}PHONE" >> "$ENV_FILE"; fi`,
    'chmod 600 "$ENV_FILE"',
    `export PATH=${shellEscape(pathValue)}`,
    `export HOME=${shellEscape(OPENCLAW_HOME)}`,
    '(openclaw plugins enable whatsapp 2>&1 || true)',
    'export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus',
    '(systemctl --user daemon-reload 2>/dev/null || true)',
    '(systemctl --user restart openclaw-gateway.service 2>/dev/null || systemctl --user start openclaw-gateway.service 2>/dev/null || true)',
    'sleep 2',
    "echo -n 'gateway: '",
    '(systemctl --user is-active openclaw-gateway.service 2>/dev/null || true)',
  ].join('; ');
}

function getWhatsAppQrFetchCommand() {
  return [
    `export PATH=${shellEscape(`${OPENCLAW_HOME}/.local/bin:${OPENCLAW_HOME}/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin`)}`,
    `export HOME=${shellEscape(OPENCLAW_HOME)}`,
    "export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus",
    "pkill -f 'openclaw channels login' 2>/dev/null || true",
    "sleep 0.3",
    "QF=/tmp/wa_qr_$$.txt",
    `nohup script -q -f -c ${shellEscape("TERM=dumb NO_COLOR=1 FORCE_COLOR=0 timeout 90s openclaw channels login --channel whatsapp")} \"$QF\" >/dev/null 2>&1 &`,
    "for I in $(seq 1 30); do sleep 0.5; SZ=$(wc -c <\"$QF\" 2>/dev/null || echo 0); [ \"$SZ\" -ge 1000 ] && break; done",
    "sleep 0.5",
    "cat \"$QF\" 2>/dev/null | tr -d '\\r' || echo 'QR not ready'",
  ].join("\n");
}

function runSshCommand({ host, sshUser, keyPath, remoteCommand, stdinScript }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [
      "-i",
      keyPath,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=30",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "LogLevel=ERROR",
      `${sshUser}@${host}`,
      remoteCommand,
    ], {
      cwd: workspaceRoot,
      windowsHide: true,
      env: {
        ...process.env,
      },
    });

    activeCommandChild = child;
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    if (stdinScript) {
      child.stdin.end(stdinScript);
    } else {
      child.stdin.end();
    }

    child.on("error", reject);
    child.on("close", (code) => {
      activeCommandChild = null;
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function fetchWhatsAppQrWithRetry(connection) {
  const firstAttempt = await runSshCommand({
    ...connection,
    remoteCommand: getOpenClawRemoteShell(connection.sshUser),
    stdinScript: getWhatsAppQrFetchCommand(),
  });

  const firstOutput = `${firstAttempt.stdout || ""}${firstAttempt.stderr ? `\n${firstAttempt.stderr}` : ""}`.trim();

  if (!shouldRetryWhatsAppLogin(firstOutput, firstAttempt.code)) {
    return firstAttempt;
  }

  return runSshCommand({
    ...connection,
    remoteCommand: getOpenClawRemoteShell(connection.sshUser),
    stdinScript: getWhatsAppQrFetchCommand(),
  });
}

async function withRestoreSshConnection(restoreJobId, callback) {
  const connection = resolveRestoreConnection(restoreJobId);
  let temporaryKey = null;
  let keyPath = connection.sshKeyPath;

  if (!keyPath || !fs.existsSync(keyPath)) {
    if (!connection.sshPrivateKeyEncrypted) {
      throw new Error("No SSH private key is available for the restored instance.");
    }

    temporaryKey = createTemporaryPrivateKeyFile(decryptSecretValue(connection.sshPrivateKeyEncrypted));
    keyPath = temporaryKey.privateKeyPath;
  }

  try {
    return await callback({
      host: connection.host,
      sshUser: sshUserForProvider(connection.provider),
      keyPath,
    });
  } finally {
    temporaryKey?.cleanup();
  }
}

function isRestoreCanceled(jobId) {
  const row = db.prepare("SELECT status FROM restore_jobs WHERE id = ?").get(jobId);
  return row?.status === "canceled";
}

function now() {
  return new Date().toISOString();
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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
  const current = db.prepare("SELECT * FROM messaging_pairings WHERE user_id = ? AND channel = ?").get(input.user_id, input.channel);
  const timestamp = now();

  if (current) {
    db.prepare(
      `UPDATE messaging_pairings
       SET restore_job_id = ?, status = ?, qr_output = ?, instruction_text = ?, pairing_code = ?, error_message = ?, last_updated_at = ?, updated_at = ?
       WHERE user_id = ? AND channel = ?`,
    ).run(
      input.restore_job_id,
      input.status,
      input.qr_output ?? current.qr_output,
      input.instruction_text ?? current.instruction_text,
      input.pairing_code === undefined ? current.pairing_code : input.pairing_code,
      input.error_message === undefined ? current.error_message : input.error_message,
      input.last_updated_at === undefined ? current.last_updated_at : input.last_updated_at,
      timestamp,
      input.user_id,
      input.channel,
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

async function runCommandWithRetry(commandArgs, handlers, { retries = 2, delayMs = 3000, retryOn = /Connection refused/i } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await runCommand(commandArgs, handlers);

    if (result.code === 0) {
      return result;
    }

    const output = `${result.stderr || ""} ${result.stdout || ""}`;

    if (attempt < retries && retryOn.test(output)) {
      await sleep(delayMs);
      continue;
    }

    return result;
  }
}


async function runRestore() {
  const metadata = {
    deploy_id: null,
    hostname: null,
    ip_address: null,
    ssh_key_path: null,
    ssh_private_key_encrypted: null,
  };
  const totalSteps = 5;

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
          total_steps: totalSteps,
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

  await cleanStalePluginsOnInstance(payload.jobId);

  updateRestoreJob(payload.jobId, {
    status: "completed",
    current_step: totalSteps,
    total_steps: totalSteps,
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
  await cleanStalePluginsOnInstance(payload.restoreJobId);

  const pairingStatus = mode === "telegram-setup" ? "awaiting_code" : "fetching_qr";

  upsertMessagingPairing({
    user_id: payload.userId,
    restore_job_id: payload.restoreJobId,
    channel: payload.channel,
    status: pairingStatus,
    qr_output: "",
    instruction_text: mode === "telegram-setup" ? "Preparing Telegram bot. This may take a moment..." : "Fetching WhatsApp pairing QR code.",
    pairing_code: null,
    error_message: null,
  });

  let result;

  if (mode === "telegram-setup") {
    result = await runCommandWithRetry(
      ["telegram-setup", "--instance", payload.instance, "--bot-token", payload.telegramBotToken, "--reset"],
      { onStdoutLine() {}, onStderrLine() {} },
      { retries: 2, delayMs: 3000, retryOn: /Connection refused|Connection reset|Connection timed out/i },
    );

    if (result.code === 0 && payload.telegramBotToken) {
      try {
        await withRestoreSshConnection(payload.restoreJobId, async (connection) => {
          await runSshCommand({
            ...connection,
            remoteCommand: `python3 -c "
import json, sys
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f:
    d = json.load(f)
changed = False
t = d.get('channels', {}).get('telegram')
if t and t.get('botToken') != sys.argv[1]:
    t['botToken'] = sys.argv[1]
    changed = True
entries = d.get('plugins', {}).get('entries', {})
if 'moltguard' in entries:
    del entries['moltguard']
    changed = True
if changed:
    with open(p, 'w') as f:
        json.dump(d, f, indent=2)
" '${payload.telegramBotToken.replace(/'/g, "'\\''")}'`,
          });
        });
      } catch (_ignored) {
        // non-fatal: gateway.env token will still be used on next restart
      }
    }
  } else if (mode === "whatsapp-setup") {
    result = await runCommandWithRetry(
      ["whatsapp-setup", "--instance", payload.instance, "--phone-number", payload.phoneNumber ?? "", "--reset"],
      { onStdoutLine() {}, onStderrLine() {} },
      { retries: 2, delayMs: 3000, retryOn: /Connection refused|Connection reset|Connection timed out/i },
    );
  } else {
    result = await runCommandWithRetry(
      ["whatsapp-qr", "--instance", payload.instance],
      { onStdoutLine() {}, onStderrLine() {} },
      { retries: 2, delayMs: 3000, retryOn: /Connection refused|Connection reset|Connection timed out/i },
    );
  }

  const combinedOutput = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
  const loweredOutput = combinedOutput.toLowerCase();

  if (result.code !== 0) {
    const failureMessage = sanitizePairingOutput(result.stderr || result.stdout || `Messaging pairing command exited with code ${result.code}.`);

    upsertMessagingPairing({
      user_id: payload.userId,
      restore_job_id: payload.restoreJobId,
      channel: payload.channel,
      status: "failed",
      qr_output: payload.channel === "whatsapp" ? result.stdout.trim() : "",
      instruction_text: payload.channel === "telegram"
        ? "Telegram bot setup failed. Check the bot token and try again."
        : sanitizePairingOutput(result.stdout),
      error_message: failureMessage,
      last_updated_at: now(),
    });
    return;
  }

  if (payload.channel === "whatsapp") {
    if (loweredOutput.includes("unsupported channel: whatsapp") || loweredOutput.includes("unsupported channel whatsapp")) {
      upsertMessagingPairing({
        user_id: payload.userId,
        restore_job_id: payload.restoreJobId,
        channel: payload.channel,
        status: "failed",
        qr_output: combinedOutput,
        instruction_text: "WhatsApp channel unsupported on this instance. Repair or enable the plugin first.",
        error_message: "WhatsApp channel unsupported on this instance. Repair or enable the plugin first.",
        last_updated_at: now(),
      });
      return;
    }

    if (hasCompletedWhatsAppLink(combinedOutput)) {
      upsertMessagingPairing({
        user_id: payload.userId,
        restore_job_id: payload.restoreJobId,
        channel: payload.channel,
        status: "completed",
        qr_output: combinedOutput,
        instruction_text: "WhatsApp is linked and ready for NewsClaw.",
        error_message: null,
        last_updated_at: now(),
      });
      return;
    }

    if (!hasScannableQr(combinedOutput)) {
      upsertMessagingPairing({
        user_id: payload.userId,
        restore_job_id: payload.restoreJobId,
        channel: payload.channel,
        status: "failed",
        qr_output: combinedOutput,
        instruction_text: combinedOutput || "No scannable WhatsApp QR code was returned.",
        error_message: "No scannable WhatsApp QR code was returned. Refresh and try again.",
        last_updated_at: now(),
      });
      return;
    }
  }

  upsertMessagingPairing({
    user_id: payload.userId,
    restore_job_id: payload.restoreJobId,
    channel: payload.channel,
    status: mode === "telegram-setup" ? "awaiting_code" : "qr_ready",
    qr_output: mode === "telegram-setup" ? "" : combinedOutput,
    instruction_text: mode === "telegram-setup"
      ? "Telegram bot is ready. Send /start to the bot, then enter the challenge code below."
      : "Scan the QR code with WhatsApp to complete pairing.",
    error_message: null,
    last_updated_at: now(),
  });
}

async function runPluginInstall() {
  if (!payload.instance) {
    appendRestoreOutput(payload.restoreJobId, `[plugin] No instance identifier, skipping plugin install.\n`);
    return;
  }

  await cleanStalePluginsOnInstance(payload.restoreJobId);

  if (RESTORE_PLUGIN_INSTALL_DELAY_MS > 0) {
    appendRestoreOutput(payload.restoreJobId, `[plugin] Waiting ${RESTORE_PLUGIN_INSTALL_DELAY_MS}ms before plugin installation\n`);
    await sleep(RESTORE_PLUGIN_INSTALL_DELAY_MS);
  }

  appendRestoreOutput(payload.restoreJobId, `[plugin] Installing plugin ${RESTORE_PLUGIN_NAME}\n`);

  const pluginInstallResult = await runCommand([
    "plugin-install",
    "--instance",
    payload.instance,
    "--plugin",
    RESTORE_PLUGIN_NAME,
  ], {
    onStdoutLine(line) {
      appendRestoreOutput(payload.restoreJobId, `[plugin] ${line}\n`);
    },
    onStderrLine(line) {
      appendRestoreOutput(payload.restoreJobId, `[plugin][stderr] ${line}\n`);
    },
  });

  if (pluginInstallResult.code !== 0) {
    appendRestoreOutput(
      payload.restoreJobId,
      `[plugin] Plugin installation failed: ${(pluginInstallResult.stderr || pluginInstallResult.stdout || "unknown error").trim()}\n`,
    );
  } else {
    appendRestoreOutput(payload.restoreJobId, `[plugin] Plugin ${RESTORE_PLUGIN_NAME} installed successfully.\n`);
  }
}

try {
  if (payload.mode === "restore") {
    await runRestore();
  } else if (payload.mode === "whatsapp-setup" || payload.mode === "whatsapp-refresh" || payload.mode === "telegram-setup") {
    await runMessagingSetup(payload.mode);
  } else if (payload.mode === "plugin-install") {
    await runPluginInstall();
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

  if (payload.mode === "plugin-install") {
    appendRestoreOutput(
      payload.restoreJobId,
      `[plugin] Background plugin installation failed: ${message}\n`,
    );
  }
}