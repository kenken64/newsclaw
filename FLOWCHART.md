# NewsClaw — App Flowchart

## 1. Top-Level User Journey

```mermaid
flowchart TD
    A([Visit /]) --> B{Authenticated?}
    B -- No --> C["Landing page\nPasskeyAuthPanel"]
    B -- Yes --> D{getPostAuthPath}

    C --> E["Sign up / Sign in\nvia passkey"]
    E --> D

    D -- No agent --> F["/setup-agent"]
    D -- No channel config --> G["/setup-agent?edit=1"]
    D -- Restore not completed --> H["/restore-instance"]
    D -- Pairing not completed --> I["/pair-channel"]
    D -- All steps done --> J["/dashboard"]

    F --> F1[Save agent + channel config] --> H
    G --> G1[Update channel config] --> H
    H --> H1[Restore completed] --> I
    I --> I1[Pairing completed] --> J
    J --> K{User action}
    K -- Edit topics --> G
    K -- Destroy instance --> L["Destroy + logout, redirect to /"]
    K -- Sign out --> L2["Logout, redirect to /"]
```

---

## 2. Authentication Flow (Passkey / WebAuthn)

```mermaid
flowchart TD
    subgraph Signup
        S1[User enters name + email] --> S2["POST /api/passkey/register/options\nGenerate WebAuthn challenge"]
        S2 --> S3["Browser: startRegistration\nFace ID / Touch ID / Windows Hello"]
        S3 --> S4["POST /api/passkey/register/verify\nVerify + store passkey + create session"]
        S4 --> S5["Set session cookie\nCall getPostAuthPath"]
    end

    subgraph Signin
        L1[User enters email] --> L2["POST /api/passkey/authenticate/options\nGenerate challenge + load passkeys"]
        L2 --> L3["Browser: startAuthentication\nUser authenticates with device"]
        L3 --> L4["POST /api/passkey/authenticate/verify\nVerify + update counter + create session"]
        L4 --> L5["Set session cookie\nCall getPostAuthPath"]
    end

    subgraph Logout
        O1[POST /api/auth/logout] --> O2["Delete session from DB\nClear cookie, redirect to /"]
    end
```

---

## 3. Provisioning Flow

### Step 1 — Agent Setup (`/setup-agent`)

```mermaid
flowchart TD
    A1[OpenClawAgentForm] --> A2[POST /api/openclaw-agent]
    A2 --> A3{Validation}
    A3 -- Fail --> A4[Return 400 error]
    A3 -- Pass --> A5["Upsert agent record\nUpsert channel config"]
    A5 --> A6{"Agent already had\nan active instance?"}
    A6 -- Yes --> A7["Async: deploy skill bundle\nto running instance"]
    A6 -- No --> A8["Return nextPath: /restore-instance"]
    A7 --> A8
```

### Step 2 — Workspace Restore (`/restore-instance`)

```mermaid
flowchart TD
    B1["GET /api/provision/restore\nLoad current job status"] --> B2{Job status}
    B2 -- None / failed --> B3[User clicks Restore]
    B2 -- Pending / running --> B4[Poll for progress every 3 s]
    B2 -- Completed --> B5["Redirect to /pair-channel"]

    B3 --> B6[POST /api/provision/restore]
    B6 --> B7{Snapshot exists on provider?}
    B7 -- No --> B8[Return error]
    B7 -- Yes --> B9["Create restore_jobs record\nspawnProvisioningWorker mode=restore"]
    B9 --> B4

    subgraph Background Worker
        W1["Create cloud instance from snapshot\nDigitalOcean droplet or AWS Lightsail"] --> W2["Record deploy_id, hostname, IP, SSH key"]
        W2 --> W3["Update job: running to completed"]
    end

    B4 -- Completed --> B5
    B4 -- Failed --> B10[Show error + retry option]
    B4 -- User cancels --> B11["DELETE /api/provision/restore\nKill worker PID, status: canceled"]
```

### Step 3 — Channel Pairing (`/pair-channel`)

```mermaid
flowchart TD
    C0["GET /api/provision/pairing\nLoad pairing status"] --> C1{Channel}

    subgraph WhatsApp
        WA1["POST /api/provision/pairing\nSpawn whatsapp-setup worker"] --> WA2["Worker: clawmacdo whatsapp-setup\nGenerates QR code via SSH"]
        WA2 --> WA3[Poll: display QR to user]
        WA3 --> WA4{QR scanned?}
        WA4 -- No, QR expired --> WA5["POST /api/provision/pairing/refresh\nSpawn whatsapp-refresh worker"]
        WA5 --> WA3
        WA4 -- "Yes, linked! detected" --> WA6["Mark pairing: completed"]
    end

    subgraph Telegram
        TG1["POST /api/provision/pairing\nSpawn telegram-setup worker"] --> TG2["Worker: clawmacdo telegram-setup via SSH"]
        TG2 --> TG3["Display: send /start to bot"]
        TG3 --> TG4[User enters pairing code in UI]
        TG4 --> TG5["POST /api/provision/pairing/telegram\nRun: clawmacdo telegram-pair --code"]
        TG5 --> TG6{Success?}
        TG6 -- Code expired / No pending request --> TG7[Restart telegram-setup]
        TG7 --> TG3
        TG6 -- Yes --> TG8["Mark pairing: completed"]
    end

    C1 -- WhatsApp --> WA1
    C1 -- Telegram --> TG1

    WA6 --> DONE["Spawn plugin-install worker\nRedirect to /dashboard"]
    TG8 --> DONE
```

---

## 4. Dashboard Flow (`/dashboard`)

```mermaid
flowchart TD
    D0["/dashboard loads"] --> D1["Fetch daily digest schedules from DB\nFetch live cron jobs from instance"]

    subgraph dd[Daily Digests]
        DD1["User sets time + recipient + prompt"] --> DD2["POST /api/daily-digest\nConvert SGT to UTC\nRun: clawmacdo cron-message"]
        DD2 --> DD3["Schedule saved in DB\nLive cron job created on instance"]

        DD4[Edit schedule time] --> DD5["PATCH /api/daily-digest\nRemove old cron + create new"]
        DD6[Remove schedule] --> DD7["DELETE /api/daily-digest\nRun: clawmacdo cron-remove"]

        DD8[View live schedules] --> DD9["GET /api/daily-digest\nRun: clawmacdo cron-list, parse output"]
    end

    subgraph im[Instance Management]
        IM1[Edit preferred topics] --> IM2["/setup-agent?edit=1\nUpdate agent + async skill redeploy"]
        IM3[Destroy instance] --> IM4{"Any active\ndigest schedules?"}
        IM4 -- Yes --> IM5[Block: remove schedules first]
        IM4 -- No --> IM6["POST /api/provision/destroy\nRun: clawmacdo destroy --name hostname"]
        IM6 --> IM7[Delete all DB records for this user]
        IM7 --> IM8["POST /api/auth/logout\nClear session, redirect to /"]
    end

    D0 --> dd
    D0 --> im
```

---

## 5. API Routes Reference

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/passkey/register/options` | Generate passkey registration challenge |
| POST | `/api/passkey/register/verify` | Verify registration, create session |
| POST | `/api/passkey/authenticate/options` | Generate passkey auth challenge |
| POST | `/api/passkey/authenticate/verify` | Verify auth, create session |
| POST | `/api/auth/logout` | End session, clear cookie |
| POST | `/api/openclaw-agent` | Create / update agent + channel config |
| GET | `/api/provision/restore` | Get restore job status |
| POST | `/api/provision/restore` | Start workspace restore |
| DELETE | `/api/provision/restore` | Cancel active restore |
| GET | `/api/provision/pairing` | Get pairing status |
| POST | `/api/provision/pairing` | Start channel pairing |
| POST | `/api/provision/pairing/telegram` | Submit Telegram pairing code |
| POST | `/api/provision/pairing/refresh` | Refresh WhatsApp QR code |
| POST | `/api/provision/destroy` | Destroy cloud instance + reset account |
| GET | `/api/daily-digest` | List schedules + live cron jobs |
| POST | `/api/daily-digest` | Create digest schedule |
| PATCH | `/api/daily-digest` | Update digest time |
| DELETE | `/api/daily-digest` | Remove digest schedule |
| GET | `/api/daily-digest/telegram-chat-id` | Fetch Telegram chat ID from instance |

---

## 6. Background Worker Modes

```mermaid
flowchart LR
    W[clawmacdo-worker.mjs] --> M1["restore\nCreate instance from snapshot"]
    W --> M2["whatsapp-setup\nGenerate WhatsApp QR via SSH"]
    W --> M3["whatsapp-refresh\nRefresh WhatsApp QR via SSH"]
    W --> M4["telegram-setup\nInitialise Telegram bot link via SSH"]
    W --> M5["plugin-install\nInstall moltguard plugin on instance"]

    M1 -. on complete .-> M2
    M1 -. on complete .-> M4
    M2 -. on link .-> M5
    M4 -. on pair .-> M5
```

All workers communicate with the cloud instance over SSH using an encrypted private key stored in the database. They write progress and output back to the `restore_jobs` or `messaging_pairings` tables, which the Next.js API routes poll to serve status to the frontend.
