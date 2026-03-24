import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { decryptPrivateKey } from "./clawmacdo-crypto.mjs";

function parseArgs(argv) {
  const args = { jobId: "", output: "" };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--job" || value === "--job-id") {
      args.jobId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--output") {
      args.output = argv[index + 1] ?? "";
      index += 1;
    }
  }

  return args;
}

const { jobId, output } = parseArgs(process.argv);

if (!jobId) {
  console.error("Usage: node scripts/decrypt-restore-key.mjs --job <restore-job-id> [--output <file>]");
  process.exit(1);
}

const encryptionSecret = process.env.NEWSCLAW_KEY_ENCRYPTION_SECRET;

if (!encryptionSecret?.trim()) {
  console.error("NEWSCLAW_KEY_ENCRYPTION_SECRET is required.");
  process.exit(1);
}

const workspaceRoot = process.cwd();
const dataDirectory = path.resolve(workspaceRoot, process.env.SQLITE_DATA_DIR?.trim() || "./data");
const databaseFile = path.join(dataDirectory, "newsclaw.db");
const db = new Database(databaseFile, { readonly: true });

const row = db
  .prepare("SELECT ssh_private_key_encrypted FROM restore_jobs WHERE id = ?")
  .get(jobId);

if (!row?.ssh_private_key_encrypted) {
  console.error(`No encrypted SSH private key found for restore job ${jobId}.`);
  process.exit(1);
}

const plaintext = decryptPrivateKey(row.ssh_private_key_encrypted, encryptionSecret);

if (output) {
  fs.writeFileSync(output, plaintext, { encoding: "utf8", mode: 0o600 });
  console.log(`Decrypted key written to ${output}`);
} else {
  process.stdout.write(plaintext);
}