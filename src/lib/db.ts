import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const dataDirectorySetting = process.env.SQLITE_DATA_DIR?.trim() || "./data";
const dataDirectory = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  dataDirectorySetting
);

const databaseFile = path.join(dataDirectory, "newsclaw.db");

type UserRow = {
  id: string;
  email: string;
  name: string;
  current_challenge: string | null;
  created_at: string;
  updated_at: string;
};

type PasskeyRow = {
  id: string;
  user_id: string;
  name: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string;
  backed_up: number;
  transports: string | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
};

type OpenClawAgentRow = {
  id: string;
  user_id: string;
  agent_name: string;
  mission: string;
  news_sources: string;
  tracking_topics: string;
  region: string;
  freshness: string;
  created_at: string;
  updated_at: string;
};

type RestoreJobRow = {
  id: string;
  user_id: string;
  provider: string;
  snapshot_name: string;
  region: string;
  size: string;
  status: string;
  current_step: number;
  total_steps: number;
  step_label: string | null;
  deploy_id: string | null;
  hostname: string | null;
  ip_address: string | null;
  ssh_key_path: string | null;
  worker_pid: number | null;
  ssh_private_key_encrypted: string | null;
  raw_output: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

type WhatsAppPairingRow = {
  id: string;
  user_id: string;
  restore_job_id: string;
  phone_number: string;
  status: string;
  qr_output: string | null;
  error_message: string | null;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserChannelConfigRow = {
  id: string;
  user_id: string;
  preferred_channel: string;
  whatsapp_phone_number: string | null;
  telegram_bot_token_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

type MessagingPairingRow = {
  id: string;
  user_id: string;
  restore_job_id: string;
  channel: string;
  status: string;
  qr_output: string | null;
  instruction_text: string | null;
  pairing_code: string | null;
  error_message: string | null;
  last_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type DailyDigestScheduleRow = {
  id: string;
  user_id: string;
  time_sgt: string;
  time_utc: string;
  job_name: string;
  delivery_channel: string | null;
  delivery_target: string | null;
  prompt_text: string;
  created_at: string;
  updated_at: string;
};

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  currentChallenge: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PasskeyRecord = {
  id: string;
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type OpenClawAgentRecord = {
  id: string;
  userId: string;
  agentName: string;
  mission: string;
  newsSources: string[];
  trackingTopics: string[];
  region: string;
  freshness: string;
  createdAt: string;
  updatedAt: string;
};

export type RestoreJobRecord = {
  id: string;
  userId: string;
  provider: string;
  snapshotName: string;
  region: string;
  size: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  stepLabel: string | null;
  deployId: string | null;
  hostname: string | null;
  ipAddress: string | null;
  sshKeyPath: string | null;
  workerPid: number | null;
  sshPrivateKeyEncrypted: string | null;
  rawOutput: string;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type WhatsAppPairingRecord = {
  id: string;
  userId: string;
  restoreJobId: string;
  phoneNumber: string;
  status: string;
  qrOutput: string;
  errorMessage: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserChannelConfigRecord = {
  id: string;
  userId: string;
  preferredChannel: "whatsapp" | "telegram";
  whatsappPhoneNumber: string | null;
  telegramBotTokenEncrypted: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessagingPairingRecord = {
  id: string;
  userId: string;
  restoreJobId: string;
  channel: "whatsapp" | "telegram";
  status: string;
  qrOutput: string;
  instructionText: string;
  pairingCode: string | null;
  errorMessage: string | null;
  lastUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyDigestScheduleRecord = {
  id: string;
  userId: string;
  timeSgt: string;
  timeUtc: string;
  jobName: string;
  deliveryChannel: "whatsapp" | "telegram";
  deliveryTarget: string;
  promptText: string;
  createdAt: string;
  updatedAt: string;
};

function ensureDatabaseFile() {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
}

function parseStringList(value: string) {
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeStringList(values: string[]) {
  return JSON.stringify(values);
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    currentChallenge: row.current_challenge,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPasskey(row: PasskeyRow): PasskeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    deviceType: row.device_type,
    backedUp: Boolean(row.backed_up),
    transports: row.transports ? parseStringList(row.transports) : [],
    createdAt: row.created_at,
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapAgent(row: OpenClawAgentRow): OpenClawAgentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    agentName: row.agent_name,
    mission: row.mission,
    newsSources: parseStringList(row.news_sources),
    trackingTopics: parseStringList(row.tracking_topics),
    region: row.region,
    freshness: row.freshness,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRestoreJob(row: RestoreJobRow): RestoreJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    snapshotName: row.snapshot_name,
    region: row.region,
    size: row.size,
    status: row.status,
    currentStep: row.current_step,
    totalSteps: row.total_steps,
    stepLabel: row.step_label,
    deployId: row.deploy_id,
    hostname: row.hostname,
    ipAddress: row.ip_address,
    sshKeyPath: row.ssh_key_path,
    workerPid: row.worker_pid,
    sshPrivateKeyEncrypted: row.ssh_private_key_encrypted,
    rawOutput: row.raw_output ?? "",
    errorMessage: row.error_message,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapWhatsAppPairing(row: WhatsAppPairingRow): WhatsAppPairingRecord {
  return {
    id: row.id,
    userId: row.user_id,
    restoreJobId: row.restore_job_id,
    phoneNumber: row.phone_number,
    status: row.status,
    qrOutput: row.qr_output ?? "",
    errorMessage: row.error_message,
    lastFetchedAt: row.last_fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserChannelConfig(row: UserChannelConfigRow): UserChannelConfigRecord {
  return {
    id: row.id,
    userId: row.user_id,
    preferredChannel: row.preferred_channel as "whatsapp" | "telegram",
    whatsappPhoneNumber: row.whatsapp_phone_number,
    telegramBotTokenEncrypted: row.telegram_bot_token_encrypted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessagingPairing(row: MessagingPairingRow): MessagingPairingRecord {
  return {
    id: row.id,
    userId: row.user_id,
    restoreJobId: row.restore_job_id,
    channel: row.channel as "whatsapp" | "telegram",
    status: row.status,
    qrOutput: row.qr_output ?? "",
    instructionText: row.instruction_text ?? "",
    pairingCode: row.pairing_code,
    errorMessage: row.error_message,
    lastUpdatedAt: row.last_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDailyDigestSchedule(row: DailyDigestScheduleRow): DailyDigestScheduleRecord {
  return {
    id: row.id,
    userId: row.user_id,
    timeSgt: row.time_sgt,
    timeUtc: row.time_utc,
    jobName: row.job_name,
    deliveryChannel: (row.delivery_channel as "whatsapp" | "telegram" | null) ?? "whatsapp",
    deliveryTarget: row.delivery_target ?? "",
    promptText: row.prompt_text ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

declare global {
  var __newsClawDb: Database.Database | undefined;
}

function initDatabase(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      current_challenge TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS openclaw_agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      agent_name TEXT NOT NULL,
      mission TEXT NOT NULL,
      news_sources TEXT NOT NULL,
      tracking_topics TEXT NOT NULL,
      region TEXT NOT NULL,
      freshness TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS restore_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      snapshot_name TEXT NOT NULL,
      region TEXT NOT NULL,
      size TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 0,
      total_steps INTEGER NOT NULL DEFAULT 0,
      step_label TEXT,
      deploy_id TEXT,
      hostname TEXT,
      ip_address TEXT,
      ssh_key_path TEXT,
      worker_pid INTEGER,
      ssh_private_key_encrypted TEXT,
      raw_output TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whatsapp_pairings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      restore_job_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status TEXT NOT NULL,
      qr_output TEXT,
      error_message TEXT,
      last_fetched_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (restore_job_id) REFERENCES restore_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_channel_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      preferred_channel TEXT NOT NULL,
      whatsapp_phone_number TEXT,
      telegram_bot_token_encrypted TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messaging_pairings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      restore_job_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      qr_output TEXT,
      instruction_text TEXT,
      pairing_code TEXT,
      error_message TEXT,
      last_updated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (restore_job_id) REFERENCES restore_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_digest_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      time_sgt TEXT NOT NULL,
      time_utc TEXT NOT NULL,
      job_name TEXT NOT NULL,
      delivery_channel TEXT NOT NULL DEFAULT 'whatsapp',
      delivery_target TEXT NOT NULL DEFAULT '',
      prompt_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, time_sgt),
      UNIQUE (job_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(database, "restore_jobs", "ssh_private_key_encrypted", "TEXT");
  ensureColumn(database, "restore_jobs", "worker_pid", "INTEGER");
  ensureColumn(database, "daily_digest_schedules", "delivery_channel", "TEXT NOT NULL DEFAULT 'whatsapp'");
  ensureColumn(database, "daily_digest_schedules", "delivery_target", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "daily_digest_schedules", "prompt_text", "TEXT NOT NULL DEFAULT ''");
}

function ensureColumn(database: Database.Database, tableName: string, columnName: string, definition: string) {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function getDatabase() {
  if (!globalThis.__newsClawDb) {
    ensureDatabaseFile();
    globalThis.__newsClawDb = new Database(databaseFile);
  }

  initDatabase(globalThis.__newsClawDb);

  return globalThis.__newsClawDb;
}

export const db = getDatabase();

export function getUserByEmail(email: string) {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function getUserById(id: string) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;

  return row ? mapUser(row) : null;
}

export function createUser(input: { email: string; name: string }) {
  const timestamp = new Date().toISOString();
  const user: UserRecord = {
    id: crypto.randomUUID(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    currentChallenge: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO users (id, email, name, current_challenge, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    user.id,
    user.email,
    user.name,
    user.currentChallenge,
    user.createdAt,
    user.updatedAt
  );

  return user;
}

export function setUserChallenge(userId: string, challenge: string | null) {
  db.prepare(
    "UPDATE users SET current_challenge = ?, updated_at = ? WHERE id = ?"
  ).run(challenge, new Date().toISOString(), userId);
}

export function getPasskeysByUserId(userId: string) {
  const rows = db
    .prepare("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as PasskeyRow[];

  return rows.map(mapPasskey);
}

export function getPasskeyByCredentialId(credentialId: string) {
  const row = db
    .prepare("SELECT * FROM passkeys WHERE credential_id = ?")
    .get(credentialId) as PasskeyRow | undefined;

  return row ? mapPasskey(row) : null;
}

export function createPasskey(input: {
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
}) {
  const passkey: PasskeyRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    name: input.name.trim(),
    credentialId: input.credentialId,
    publicKey: input.publicKey,
    counter: input.counter,
    deviceType: input.deviceType,
    backedUp: input.backedUp,
    transports: input.transports,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO passkeys (
      id, user_id, name, credential_id, public_key, counter, device_type, backed_up, transports, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    passkey.id,
    passkey.userId,
    passkey.name,
    passkey.credentialId,
    passkey.publicKey,
    passkey.counter,
    passkey.deviceType,
    passkey.backedUp ? 1 : 0,
    serializeStringList(passkey.transports),
    passkey.createdAt
  );

  return passkey;
}

export function updatePasskeyCounter(credentialId: string, counter: number) {
  db.prepare("UPDATE passkeys SET counter = ? WHERE credential_id = ?").run(
    counter,
    credentialId
  );
}

export function createSession(input: { userId: string; expiresAt: string }) {
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(session.id, session.userId, session.expiresAt, session.createdAt);

  return session;
}

export function getSessionById(id: string) {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;

  return row ? mapSession(row) : null;
}

export function deleteSession(id: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function pruneExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
    new Date().toISOString()
  );
}

export function getOpenClawAgentByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM openclaw_agents WHERE user_id = ?")
    .get(userId) as OpenClawAgentRow | undefined;

  return row ? mapAgent(row) : null;
}

export function upsertOpenClawAgent(input: {
  userId: string;
  agentName: string;
  mission: string;
  newsSources: string[];
  trackingTopics?: string[];
  region: string;
  freshness: string;
}) {
  const existing = getOpenClawAgentByUserId(input.userId);
  const timestamp = new Date().toISOString();
  const trackingTopics = input.trackingTopics ?? [];

  if (existing) {
    db.prepare(
      `UPDATE openclaw_agents
       SET agent_name = ?, mission = ?, news_sources = ?, tracking_topics = ?, region = ?, freshness = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      input.agentName.trim(),
      input.mission.trim(),
      serializeStringList(input.newsSources),
      serializeStringList(trackingTopics),
      input.region.trim(),
      input.freshness.trim(),
      timestamp,
      input.userId
    );

    return getOpenClawAgentByUserId(input.userId)!;
  }

  const record: OpenClawAgentRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    agentName: input.agentName.trim(),
    mission: input.mission.trim(),
    newsSources: input.newsSources,
    trackingTopics,
    region: input.region.trim(),
    freshness: input.freshness.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO openclaw_agents (
      id, user_id, agent_name, mission, news_sources, tracking_topics, region, freshness, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.agentName,
    record.mission,
    serializeStringList(record.newsSources),
    serializeStringList(record.trackingTopics),
    record.region,
    record.freshness,
    record.createdAt,
    record.updatedAt
  );

  return record;
}

export function getDailyDigestSchedulesByUserId(userId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM daily_digest_schedules WHERE user_id = ? ORDER BY time_sgt ASC"
    )
    .all(userId) as DailyDigestScheduleRow[];

  return rows.map(mapDailyDigestSchedule);
}

export function getDailyDigestScheduleById(id: string) {
  const row = db
    .prepare("SELECT * FROM daily_digest_schedules WHERE id = ?")
    .get(id) as DailyDigestScheduleRow | undefined;

  return row ? mapDailyDigestSchedule(row) : null;
}

export function getDailyDigestScheduleByUserIdAndTime(userId: string, timeSgt: string) {
  const row = db
    .prepare("SELECT * FROM daily_digest_schedules WHERE user_id = ? AND time_sgt = ?")
    .get(userId, timeSgt) as DailyDigestScheduleRow | undefined;

  return row ? mapDailyDigestSchedule(row) : null;
}

export function createDailyDigestSchedule(input: {
  userId: string;
  timeSgt: string;
  timeUtc: string;
  jobName: string;
  deliveryChannel: "whatsapp" | "telegram";
  deliveryTarget: string;
  promptText: string;
}) {
  const timestamp = new Date().toISOString();
  const record: DailyDigestScheduleRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    timeSgt: input.timeSgt,
    timeUtc: input.timeUtc,
    jobName: input.jobName,
    deliveryChannel: input.deliveryChannel,
    deliveryTarget: input.deliveryTarget.trim(),
    promptText: input.promptText,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO daily_digest_schedules (
      id, user_id, time_sgt, time_utc, job_name, delivery_channel, delivery_target, prompt_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.timeSgt,
    record.timeUtc,
    record.jobName,
    record.deliveryChannel,
    record.deliveryTarget,
    record.promptText,
    record.createdAt,
    record.updatedAt
  );

  return record;
}

export function updateDailyDigestSchedule(id: string, input: {
  timeSgt?: string;
  timeUtc?: string;
  jobName?: string;
  deliveryChannel?: "whatsapp" | "telegram";
  deliveryTarget?: string;
  promptText?: string;
}) {
  const existing = getDailyDigestScheduleById(id);

  if (!existing) {
    return null;
  }

  db.prepare(
    `UPDATE daily_digest_schedules
     SET time_sgt = ?, time_utc = ?, job_name = ?, delivery_channel = ?, delivery_target = ?, prompt_text = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.timeSgt ?? existing.timeSgt,
    input.timeUtc ?? existing.timeUtc,
    input.jobName ?? existing.jobName,
    input.deliveryChannel ?? existing.deliveryChannel,
    input.deliveryTarget === undefined ? existing.deliveryTarget : input.deliveryTarget.trim(),
    input.promptText ?? existing.promptText,
    new Date().toISOString(),
    id,
  );

  return getDailyDigestScheduleById(id);
}

export function deleteDailyDigestSchedule(id: string) {
  db.prepare("DELETE FROM daily_digest_schedules WHERE id = ?").run(id);
}

export function createRestoreJob(input: {
  userId: string;
  provider: string;
  snapshotName: string;
  region: string;
  size: string;
}) {
  const timestamp = new Date().toISOString();
  const record: RestoreJobRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    provider: input.provider.trim(),
    snapshotName: input.snapshotName.trim(),
    region: input.region.trim(),
    size: input.size.trim(),
    status: "pending",
    currentStep: 0,
    totalSteps: 0,
    stepLabel: null,
    deployId: null,
    hostname: null,
    ipAddress: null,
    sshKeyPath: null,
    workerPid: null,
    sshPrivateKeyEncrypted: null,
    rawOutput: "",
    errorMessage: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };

  db.prepare(
    `INSERT INTO restore_jobs (
      id, user_id, provider, snapshot_name, region, size, status, current_step, total_steps, step_label,
      deploy_id, hostname, ip_address, ssh_key_path, worker_pid, ssh_private_key_encrypted, raw_output, error_message, started_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.provider,
    record.snapshotName,
    record.region,
    record.size,
    record.status,
    record.currentStep,
    record.totalSteps,
    record.stepLabel,
    record.deployId,
    record.hostname,
    record.ipAddress,
    record.sshKeyPath,
    record.workerPid,
    record.sshPrivateKeyEncrypted,
    record.rawOutput,
    record.errorMessage,
    record.startedAt,
    record.updatedAt,
    record.completedAt,
  );

  return record;
}

export function getRestoreJobById(id: string) {
  const row = db.prepare("SELECT * FROM restore_jobs WHERE id = ?").get(id) as
    | RestoreJobRow
    | undefined;

  return row ? mapRestoreJob(row) : null;
}

export function getLatestRestoreJobByUserId(userId: string) {
  const row = db
    .prepare(
      "SELECT * FROM restore_jobs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1"
    )
    .get(userId) as RestoreJobRow | undefined;

  return row ? mapRestoreJob(row) : null;
}

export function appendRestoreJobOutput(id: string, chunk: string) {
  db.prepare(
    "UPDATE restore_jobs SET raw_output = COALESCE(raw_output, '') || ?, updated_at = ? WHERE id = ?"
  ).run(chunk, new Date().toISOString(), id);
}

export function updateRestoreJob(id: string, input: {
  status?: string;
  currentStep?: number;
  totalSteps?: number;
  stepLabel?: string | null;
  deployId?: string | null;
  hostname?: string | null;
  ipAddress?: string | null;
  sshKeyPath?: string | null;
  workerPid?: number | null;
  sshPrivateKeyEncrypted?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
}) {
  const existing = getRestoreJobById(id);

  if (!existing) {
    return null;
  }

  db.prepare(
    `UPDATE restore_jobs
     SET status = ?, current_step = ?, total_steps = ?, step_label = ?, deploy_id = ?, hostname = ?,
       ip_address = ?, ssh_key_path = ?, worker_pid = ?, ssh_private_key_encrypted = ?, error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.status ?? existing.status,
    input.currentStep ?? existing.currentStep,
    input.totalSteps ?? existing.totalSteps,
    input.stepLabel === undefined ? existing.stepLabel : input.stepLabel,
    input.deployId === undefined ? existing.deployId : input.deployId,
    input.hostname === undefined ? existing.hostname : input.hostname,
    input.ipAddress === undefined ? existing.ipAddress : input.ipAddress,
    input.sshKeyPath === undefined ? existing.sshKeyPath : input.sshKeyPath,
    input.workerPid === undefined ? existing.workerPid : input.workerPid,
    input.sshPrivateKeyEncrypted === undefined ? existing.sshPrivateKeyEncrypted : input.sshPrivateKeyEncrypted,
    input.errorMessage === undefined ? existing.errorMessage : input.errorMessage,
    input.completedAt === undefined ? existing.completedAt : input.completedAt,
    new Date().toISOString(),
    id,
  );

  return getRestoreJobById(id);
}

export function upsertWhatsAppPairing(input: {
  userId: string;
  restoreJobId: string;
  phoneNumber: string;
  status: string;
  qrOutput?: string;
  errorMessage?: string | null;
  lastFetchedAt?: string | null;
}) {
  const existing = getWhatsAppPairingByUserId(input.userId);
  const timestamp = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE whatsapp_pairings
       SET restore_job_id = ?, phone_number = ?, status = ?, qr_output = ?, error_message = ?, last_fetched_at = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      input.restoreJobId,
      input.phoneNumber.trim(),
      input.status,
      input.qrOutput ?? existing.qrOutput,
      input.errorMessage === undefined ? existing.errorMessage : input.errorMessage,
      input.lastFetchedAt === undefined ? existing.lastFetchedAt : input.lastFetchedAt,
      timestamp,
      input.userId,
    );

    return getWhatsAppPairingByUserId(input.userId)!;
  }

  const record: WhatsAppPairingRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    restoreJobId: input.restoreJobId,
    phoneNumber: input.phoneNumber.trim(),
    status: input.status,
    qrOutput: input.qrOutput ?? "",
    errorMessage: input.errorMessage ?? null,
    lastFetchedAt: input.lastFetchedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO whatsapp_pairings (
      id, user_id, restore_job_id, phone_number, status, qr_output, error_message, last_fetched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.restoreJobId,
    record.phoneNumber,
    record.status,
    record.qrOutput,
    record.errorMessage,
    record.lastFetchedAt,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function getWhatsAppPairingByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM whatsapp_pairings WHERE user_id = ?")
    .get(userId) as WhatsAppPairingRow | undefined;

  return row ? mapWhatsAppPairing(row) : null;
}

export function getUserChannelConfigByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM user_channel_configs WHERE user_id = ?")
    .get(userId) as UserChannelConfigRow | undefined;

  return row ? mapUserChannelConfig(row) : null;
}

export function upsertUserChannelConfig(input: {
  userId: string;
  preferredChannel: "whatsapp" | "telegram";
  whatsappPhoneNumber?: string | null;
  telegramBotTokenEncrypted?: string | null;
}) {
  const existing = getUserChannelConfigByUserId(input.userId);
  const timestamp = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE user_channel_configs
       SET preferred_channel = ?, whatsapp_phone_number = ?, telegram_bot_token_encrypted = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      input.preferredChannel,
      input.whatsappPhoneNumber ?? null,
      input.telegramBotTokenEncrypted ?? null,
      timestamp,
      input.userId,
    );

    return getUserChannelConfigByUserId(input.userId)!;
  }

  const record: UserChannelConfigRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    preferredChannel: input.preferredChannel,
    whatsappPhoneNumber: input.whatsappPhoneNumber ?? null,
    telegramBotTokenEncrypted: input.telegramBotTokenEncrypted ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO user_channel_configs (
      id, user_id, preferred_channel, whatsapp_phone_number, telegram_bot_token_encrypted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.preferredChannel,
    record.whatsappPhoneNumber,
    record.telegramBotTokenEncrypted,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function getTelegramConfigsWithCompletedPairing(excludeUserId: string) {
  return db.prepare(`
    SELECT ucc.telegram_bot_token_encrypted
    FROM user_channel_configs ucc
    INNER JOIN messaging_pairings mp ON mp.user_id = ucc.user_id
    WHERE ucc.preferred_channel = 'telegram'
      AND ucc.telegram_bot_token_encrypted IS NOT NULL
      AND ucc.user_id != ?
      AND mp.status = 'completed'
      AND mp.channel = 'telegram'
  `).all(excludeUserId) as Array<{ telegram_bot_token_encrypted: string }>;
}

export function getMessagingPairingByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM messaging_pairings WHERE user_id = ?")
    .get(userId) as MessagingPairingRow | undefined;

  return row ? mapMessagingPairing(row) : null;
}

export function upsertMessagingPairing(input: {
  userId: string;
  restoreJobId: string;
  channel: "whatsapp" | "telegram";
  status: string;
  qrOutput?: string;
  instructionText?: string;
  pairingCode?: string | null;
  errorMessage?: string | null;
  lastUpdatedAt?: string | null;
}) {
  const existing = getMessagingPairingByUserId(input.userId);
  const timestamp = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE messaging_pairings
       SET restore_job_id = ?, channel = ?, status = ?, qr_output = ?, instruction_text = ?, pairing_code = ?, error_message = ?, last_updated_at = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      input.restoreJobId,
      input.channel,
      input.status,
      input.qrOutput ?? existing.qrOutput,
      input.instructionText ?? existing.instructionText,
      input.pairingCode === undefined ? existing.pairingCode : input.pairingCode,
      input.errorMessage === undefined ? existing.errorMessage : input.errorMessage,
      input.lastUpdatedAt === undefined ? existing.lastUpdatedAt : input.lastUpdatedAt,
      timestamp,
      input.userId,
    );

    return getMessagingPairingByUserId(input.userId)!;
  }

  const record: MessagingPairingRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    restoreJobId: input.restoreJobId,
    channel: input.channel,
    status: input.status,
    qrOutput: input.qrOutput ?? "",
    instructionText: input.instructionText ?? "",
    pairingCode: input.pairingCode ?? null,
    errorMessage: input.errorMessage ?? null,
    lastUpdatedAt: input.lastUpdatedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `INSERT INTO messaging_pairings (
      id, user_id, restore_job_id, channel, status, qr_output, instruction_text, pairing_code, error_message, last_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.userId,
    record.restoreJobId,
    record.channel,
    record.status,
    record.qrOutput,
    record.instructionText,
    record.pairingCode,
    record.errorMessage,
    record.lastUpdatedAt,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}