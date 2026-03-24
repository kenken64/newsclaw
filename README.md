# NewsClaw

NewsClaw is a Next.js 16 web application for passkey-secured news monitoring. A user signs in with WebAuthn passkeys, completes a first-login OpenClaw agent setup, and then lands on a professional dashboard to choose the news categories that should drive their workspace.

## Stack

- Next.js 16 with App Router and TypeScript
- Tailwind CSS v4 and shadcn/ui
- SQLite with `better-sqlite3`
- Native WebAuthn passkeys with `@simplewebauthn/server` and `@simplewebauthn/browser`
- Local session persistence with HTTP-only cookies and SQLite-backed session records

## Features

- Passkey-first authentication with account creation and sign-in flows
- First-login gate that requires OpenClaw agent setup before dashboard access
- AWS Lightsail snapshot restore orchestrated through the local `clawmacdo` CLI
- Per-user messaging channel choice for WhatsApp QR pairing or Telegram bot challenge pairing
- SQLite persistence for users, passkeys, sessions, agent configuration, and category preferences
- Dashboard experience for selecting preferred news categories
- Tailwind + shadcn styling with a polished editorial UI

## Environment

Create a `.env` file from `.env.example`.

```bash
SQLITE_DATA_DIR=./data
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
WEBAUTHN_REQUIRE_USER_VERIFICATION=false
SESSION_COOKIE_NAME=newsclaw_session
NEWSCLAW_KEY_ENCRYPTION_SECRET=change-this-to-a-long-random-secret
CLAWMACDO_SNAPSHOT_NAME=openclaw-6ce6169b-10007-prod
CLAWMACDO_INSTANCE_SIZE=s-2vcpu-4gb
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
```

Set `WEBAUTHN_REQUIRE_USER_VERIFICATION=true` only if you want to force biometric/PIN verification on every authenticator and your test devices support it consistently.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000.

## Authentication Flow

1. New users create an account with name, email, and a passkey.
2. After the passkey is registered, NewsClaw checks whether an OpenClaw agent exists.
3. If no agent exists, the user is redirected to `/setup-agent`.
4. Setup now captures the user-specific channel choice: WhatsApp or Telegram.
5. NewsClaw restores the pinned Lightsail snapshot through `clawmacdo ls-restore`.
6. After restore, the user completes WhatsApp QR pairing or Telegram challenge pairing.
7. Once pairing is complete, the user lands on `/dashboard`.

## SQLite Storage

The app creates `newsclaw.db` inside the directory configured by `SQLITE_DATA_DIR`.

Examples:

- `SQLITE_DATA_DIR=./data`
- `SQLITE_DATA_DIR=./storage/sqlite`

If `SQLITE_DATA_DIR` is not set, the app falls back to `./data`.

Stored entities:

- `users`
- `passkeys`
- `sessions`
- `openclaw_agents`
- `category_preferences`
- `restore_jobs`
- `user_channel_configs`
- `messaging_pairings`

## Passkey Testing Notes

- Use a browser with WebAuthn support.
- Chrome DevTools includes a WebAuthn emulator if you want to test passkeys without a physical authenticator.
- For local development, the relying party ID defaults to `localhost`.

## Build Validation

Production build validation succeeds with:

```bash
npm run build
```

Decrypt an encrypted restore-job private key for manual inspection:

```bash
npm run decrypt-restore-key -- --job <restore-job-id>
```

## Notes

- The OpenClaw step currently captures the agent configuration required for the news-search workflow and stores it locally in SQLite.
- Category choices are saved immediately and reloaded on the dashboard.
