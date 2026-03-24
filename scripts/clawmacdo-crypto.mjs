import crypto from "node:crypto";

const ENCRYPTION_VERSION = "v1";

function getEncryptionKey(secret) {
  if (!secret?.trim()) {
    throw new Error("NEWSCLAW_KEY_ENCRYPTION_SECRET is required.");
  }

  return crypto.scryptSync(secret, "newsclaw-restore-key", 32);
}

export function encryptPrivateKey(plaintext, secret) {
  const iv = crypto.randomBytes(12);
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

export function decryptPrivateKey(payload, secret) {
  const [version, iv, authTag, encrypted] = (payload ?? "").split(":");

  if (version !== ENCRYPTION_VERSION || !iv || !authTag || !encrypted) {
    throw new Error("Encrypted key payload format is invalid.");
  }

  const key = getEncryptionKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}