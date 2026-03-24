import "server-only";

import crypto from "node:crypto";

const ENCRYPTION_VERSION = "v1";

function getEncryptionSecret() {
  const secret = process.env.NEWSCLAW_KEY_ENCRYPTION_SECRET?.trim();

  if (!secret) {
    throw new Error("NEWSCLAW_KEY_ENCRYPTION_SECRET is not configured.");
  }

  return secret;
}

function getEncryptionKey(secret: string) {
  return crypto.scryptSync(secret, "newsclaw-restore-key", 32);
}

export function encryptSecretValue(plaintext: string) {
  const iv = crypto.randomBytes(12);
  const secret = getEncryptionSecret();
  const key = getEncryptionKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecretValue(payload: string) {
  const [version, iv, authTag, encrypted] = payload.split(":");

  if (version !== ENCRYPTION_VERSION || !iv || !authTag || !encrypted) {
    throw new Error("Encrypted payload format is invalid.");
  }

  const secret = getEncryptionSecret();
  const key = getEncryptionKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}