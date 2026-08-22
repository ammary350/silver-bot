# Silver Bot

WhatsApp MD bot built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

---

## Authentication — How It Works

The bot stores WhatsApp auth data in the `session/` directory. This data allows
the bot to reconnect without scanning a QR code every time.

### Default flow (QR-first)

- **No valid session** (first run, cleared, or logged out) → the bot connects
  fresh and prints a **QR code in the terminal**. Scan it with
  **WhatsApp > Linked Devices > Link a Device**.
- **Valid session** → the bot reconnects **silently** using the saved auth —
  no QR, no prompts. This works across restarts, terminal closes, server
  reboots, and PM2 restarts.
- **Invalid/corrupt session** → the bot detects it, clears the stale files,
  and starts a clean login flow (fresh QR).
- **Logged out** (device unlinked in WhatsApp) → the bot clears the session
  and automatically shows a fresh QR — no manual restart needed.

### When a new session is created

A new session is created only when:

- The `session/` directory is empty (first run).
- The saved session is detected as `loggedOut` (user unlinked the device from
  WhatsApp) — fresh QR is shown automatically.
- The saved session is detected as `badSession` (auth files corrupted).
- You explicitly opt in to pairing-code login (`PAIRING_NUMBER` or menu
  option 2).

In all other disconnect scenarios (network loss, server restart, temporary
connection drop), the bot reconnects automatically using the saved session.

### Auto-start for VPS/PM2

The bot auto-starts with the saved session by default — no interactive menu
shown, no QR when the session is valid. Set `FORCE_MENU=1` to show the
interactive startup menu.

Usage:
```bash
node index.js
```

### QR Code Login (first run / re-link)

1. Start the bot with an empty `session/` folder:
   ```bash
   node index.js
   ```
2. A QR code is printed to the terminal with clear instructions:
   ```
   [qr] Scan the QR code below with your phone:
   [qr]   WhatsApp > Linked Devices > Link a Device
   ```
3. On your phone: **WhatsApp > Linked Devices > Link a Device** and scan the
   QR.
4. The session is saved immediately (`session/creds.json`) — from then on the
   bot reconnects silently.

The QR refreshes automatically if it expires (WhatsApp rotates it). Terminal
width matters: use a full-width window so the block-char QR renders correctly.

### Pairing Code Login (optional — disabled by default)

Pairing-code login is **disabled** unless you explicitly ask for it. To use it:

1. Set `PAIRING_NUMBER` in `.env` (headless, no prompts), **or** run with
   `FORCE_MENU=1` and choose **option 2 (Pair a Number)**.
2. The number must include the country code and be **digits only** (no `+`,
   spaces, hyphens or parentheses). A leading `00` international prefix is
   stripped automatically. Examples:
   - `212722838422` ✅ (Morocco)
   - `00212722838422` → normalized to `212722838422` ✅
   - `+212 722 838 422` → automatically normalized to digits ✅
   - `722838422` ❌ (missing country code)
3. The pairing code is printed to the console:
   ```
   [pairing] Pairing code: 1BP4PVBW
   ```
4. On your phone: **WhatsApp > Linked Devices > Link a Device** and enter the
   code.

The pairing flow is safe:
- The number is validated **before** the request; invalid formats produce a
  clear error instead of silently failing.
- If the session is already registered, pairing is skipped.
- If the socket is not ready yet, the bot waits and retries **once**; it never
  requests multiple codes for the same fresh session.
- On failure, the cause is logged and the bot retries on the next QR signal.

---

## Permanent Contact-Ban System

A global, persistent ban list (`data/blocklist.json`) that is **automatically
enforced** — no manual checking.

### How it works

- `.ban <name | number | @mention> [reason]` resolves the target and stores it
  permanently: number, JID, reason, date, group, action.
- The ban survives restarts (`data/blocklist.json`).
- When a ban is issued, the bot:
  1. Blocks the number on WhatsApp (`updateBlockStatus`).
  2. Removes the contact from **every group** where the bot is admin
     (`groupParticipantsUpdate`). Groups where the bot is not admin are logged
     (`[bans] Cannot remove ... bot is not admin`).
- **Startup enforcement**: every banned contact is re-checked and re-removed
  from all groups on each bot start (group scan, rate-limit-safe delays).
- **Live enforcement**: if a banned contact joins a group, the bot removes them
  immediately. If the bot is not admin there, it locks the group and alerts
  admins as a fallback.

### Resolving by name

`.ban` accepts names, not only raw numbers:

- **Exact number** → banned directly.
- **@mention or quoted message** → that contact.
- **Name** → matched against saved contacts and group push names.
  - One match → banned directly.
  - Several matches → the bot lists them and you pick with `.ban <index>`.

### Commands

| Command | Description |
|---|---|
| `.ban <name/number/@mention> [reason]` | Permanently ban + enforce everywhere |
| `.blocks` (aliases: `.blist`, `.bans`) | List the ban list |
| `.check <number>` (alias: `.lookup`) | Check a number |
| `.delblock <number>` (aliases: `.unblk`, `.unban`, `.removeblock`) | Remove from the ban list |

---

## Reconnect & Auto Recovery

The bot handles different disconnect reasons differently:

| Disconnect Reason | Behavior |
|---|---|
| `loggedOut` (401) | Session cleared. Bot restarts with a fresh QR automatically. |
| `badSession` (500) | Session cleared. Retries with fresh auth (new QR). |
| `restartRequired` (515) | Reconnects immediately (no delay). |
| `connectionClosed` (428) | Reconnects with exponential backoff (1s → 60s max). |
| `connectionLost` / `timedOut` (408) | Reconnects with exponential backoff. |
| `connectionReplaced` (440) | Logged, reconnects normally. |

- **Exponential backoff**: 1s, 2s, 4s, 8s, ... up to 60s, with random jitter
  to prevent thundering herd.
- **Reconnect counter** resets to zero on successful connection.
- **Inactivity watchdog**: pings every 5 minutes; if no activity for 30
  minutes, triggers a clean reconnect.
- **Uncaught exceptions**: recoverable errors trigger a 3-second delayed
  restart. Fatal errors (SyntaxError, MODULE_NOT_FOUND, etc.) exit the
  process.
- **Unhandled rejections**: network-level errors (ECONNRESET, ETIMEDOUT, etc.)
  are silently suppressed. Rate-limit errors are ignored. Other errors are
  logged.

---

## Local Setup

### Prerequisites

- Node.js 18 or later
- npm

### Install

```bash
git clone <your-repo-url> silver-bot
cd silver-bot
npm ci --omit=dev
```

### Configure

Edit `config.js`:

```js
ownerNumber: ['212722838422'],     // Your WhatsApp number (with country code)
ownerName: ['Your Name'],
botName: 'Silver Bot',
```

### Run

```bash
node index.js
```

On first run, a QR code is printed in the terminal. Scan it with WhatsApp >
Linked Devices > Link a Device. The session is saved automatically — from then
on the bot reconnects silently. To use pairing-code login instead, run with
`FORCE_MENU=1` and choose option 2 (Pair a Number).

---

## Ubuntu VPS + PM2 Setup

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
```

### 2. Clone and install

```bash
git clone <your-repo-url> silver-bot
cd silver-bot
npm ci --omit=dev
```

### 3. Install PM2

```bash
sudo npm install -g pm2
```

### 4. Start the bot once interactively

```bash
node index.js
```

On first run, a QR code is printed in the terminal. Scan it with WhatsApp >
Linked Devices > Link a Device. Let it connect fully, then stop with `Ctrl+C`.

### 5. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

The bot will start with the saved session on PM2 restart.

### 6. Production hardening

```bash
npm ci --omit=dev            # deterministic install from package-lock.json
pm2 install pm2-logrotate    # rotate logs (default: 10 files x 10 MB)
pm2 set pm2-logrotate:max_size 10M
pm2 save                     # persist the process list after every change
pm2 startup                  # (already done) re-run after `pm2 save`
```

- The bot runs as **one fork process** (`instances: 1`) — never scale it up.
- Auth lives in `session/` and survives restarts; `creds.json` is written on
  every `creds.update` and flushed on graceful shutdown (PM2 waits up to
  `kill_timeout: 10000`).
- Logs go to `./logs/output.log` (stdout) and `./logs/error.log` (stderr),
  both timestamped.
- If the bot is restarted automatically after a crash, it reconnects
  silently with the saved session (QR is only shown when no valid session
  exists).

### Useful PM2 commands

```bash
pm2 logs              # View logs
pm2 status            # Check status
pm2 restart silver-bot  # Restart
pm2 stop silver-bot   # Stop
pm2 delete silver-bot # Remove from PM2
```

---

## Oracle Cloud VPS (Ubuntu LTS) Setup

### 1. Provision a VM

- Create an **Ubuntu 22.04 / 24.04 LTS** VM on Oracle Cloud (free tier eligible).
- Open port **22** (SSH) in the security list.
- SSH into the instance.

### 2. Install dependencies

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2
```

### 3. Clone and install

```bash
git clone <your-repo-url> silver-bot
cd silver-bot
npm ci --omit=dev
```

### 4. Configure

Edit `config.js` with your owner number:
```js
ownerNumber: ['212722838422'],
ownerName: ['Your Name'],
```

### 5. First-time login

```bash
node index.js
```

A QR code is printed in the terminal. Scan it with WhatsApp > Linked Devices,
let it connect fully, then stop with `Ctrl+C`. (To use pairing-code login
instead, set `PAIRING_NUMBER` in `.env`.)

### 6. Run with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami)
```

The bot will now:
- Auto-start on system boot
- Restart on crash (max 10 times, with 5s delay)
- Keep logs in `logs/` directory
- Preserve the session across restarts

### 7. Useful Oracle VPS commands

```bash
pm2 status              # Check bot status
pm2 logs silver-bot     # View live logs
pm2 monit               # Monitor CPU/RAM usage
sudo reboot             # Test reboot recovery
```

---

## Project Structure

```
silver-bot/
├── index.js              # Thin entry point → src/startup/bootstrap.js
├── src/                  # Modular core (CommonJS)
│   ├── config/           # Bot configuration (config/index.js)
│   ├── core/             # logger, message store, JID utils, permissions
│   ├── storage/          # data layer (database.js) + session persistence (session.js)
│   ├── services/         # WhatsApp socket bootstrap (waSocket.js)
│   ├── events/           # connection/creds/messages/group-participants/messages-update/errors
│   ├── features/
│   │   ├── pairing/      # pairing-code login (validation, wait/retry, dedupe)
│   │   ├── bans/         # ban resolver (name→JID), enforcer (block + group removal)
│   │   ├── groups/       # group metadata + admin checks
│   │   ├── contacts/     # contact name/push-name lookup
│   │   └── display/      # owner/number display formatting (owners.js)
│   ├── handlers/         # message pipeline, group updates, protections, anti-call
│   ├── utils/            # command loader, group stats, temp manager, cleanup
│   └── startup/          # bootstrap + interactive input (menu/pairing prompt)
├── config.js             # → src/config (compat shim)
├── database.js           # → src/storage/database (compat shim)
├── handler.js            # → src/handlers (compat shim)
├── lib/                  # → src/core (compat shims for commands)
├── commands/             # Command modules (admin, owner, protection, general, roles, utility, ai)
├── utils/                # Command-support helpers (api, jidHelper, tempManager, autoReact, webp2mp4, exif, commandLoader)
├── data/                 # Runtime data (groups, users, settings, blocklist.json)
├── session/              # WhatsApp auth credentials (created at runtime)
├── temp/                 # Temporary media files (auto-cleaned)
├── ecosystem.config.js   # PM2 configuration
├── Procfile              # Heroku process type
└── app.json              # Heroku deploy configuration
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PAIRING_NUMBER` | (unset) | **Optional**: phone number (digits + country code) to use pairing-code login instead of QR — explicit opt-in, headless |
| `FORCE_MENU` | (unset) | Set to `1` to show the interactive startup menu (manual choice) |
| `SESSION_ID` | (unset) | Pre-configured session string for Heroku (`KnightBot!<base64>` format) |
| `NODE_ENV` | (unset) | Set to `production` to suppress pino-pretty formatting |

---

## Troubleshooting

### QR code is not appearing
1. The QR only shows when there is **no valid session** — with a valid session
   the bot reconnects silently by design. To force a fresh QR: delete
   `session/*.json` (or run with `FORCE_MENU=1` and choose **Re-link Fresh**)
   and restart.
2. Make sure neither `PAIRING_NUMBER` nor `FORCE_MENU` is set (QR is the
   default flow; `PAIRING_NUMBER` switches to pairing-code login).
3. The QR renders as block characters in the terminal — a very narrow window
   can garble it. Use a full-width terminal and check the logs for the
   `[qr] Scan the QR code below with your phone:` banner.
4. The QR refreshes automatically when it expires; wait a few seconds and a
   new one appears.

### "Invalid phone number ..." (pairing mode)
The number must include the country code and be 10–15 digits total. `+`,
spaces, hyphens and parentheses are stripped automatically, so `+212 722 838
422` works, but a number without the country code (e.g., `722838422`) is
rejected with a clear error.

### Session is not saving / bot re-pairs after every restart
1. Credentials are saved automatically on every `creds.update` to
   `session/creds.json` (multi-file auth: `creds.json` + Signal key files).
2. Verify the process has **write permission** on the project directory
   (`chown -R youruser:youruser silver-bot` on Linux; never run as root on
   Oracle Cloud without fixing permissions).
3. Check the log for `[creds] No space left to save credentials` (disk full —
   run `pm2 flush` and clean `temp/`).
4. If the session was cleared, the bot logs the reason: `loggedOut` (user
   unlinked the device — a fresh QR is shown automatically) or `badSession`
   (corrupted files — auto-cleared, fresh login).

### Session lost after restart
1. The auth folder is fixed at `<project root>/session/` — start the bot from
   the same working directory every time (PM2 `ecosystem.config.js` already
   sets `cwd: './'`).
2. Startup logs `[auth] Session restored — N auth files` when a valid session
   is found. If you see `[auth] Existing session is invalid ... Clearing`, the
   files were corrupt or incomplete and a fresh login started — that is the
   intended graceful behavior.
3. Do not set `SESSION_ID` to a stale string — it overwrites the local
   `creds.json` on startup.

### Logged out state
- `loggedOut` means the linked device was removed in
  **WhatsApp > Linked Devices** (or WhatsApp revoked the session). The bot
  clears the session and shows a **fresh QR automatically** — no manual
  restart needed. Just scan it.
- If you keep getting logged out, check that no other device/app is revoking
  the session, and that the bot is not running from two different auth
  folders.

### Duplicate sockets / two bots responding
1. The code guards against this: `isConnecting` prevents concurrent socket
   creation, `closeActiveSocket()` tears down the old socket before a new one,
   and the watchdog only acts on the active socket.
2. PM2 `ecosystem.config.js` uses `instances: 1` — do not scale it up.
3. If duplicates still appear, another process is running: `pm2 status` and
   `pm2 delete` the old one, or check for stray `node index.js` processes
   (`ps aux | grep node` / Task Manager).

### Banned contact is not being kicked
1. The bot must be **admin** in the group. Groups where the bot is not admin
   are logged as `[bans] Cannot remove ... bot is not admin` — promote the bot
   in those groups, then run `.ban <number>` again (it re-enforces).
2. Enforcement runs on startup and on join. If you banned someone already
   inside a group, the block + removal happens immediately at `.ban` time.
3. Check `data/blocklist.json` to confirm the entry exists.

### Bot is not admin in a group
- Add the bot as admin manually in the group settings, or have the owner run
  `.promote @bot`. Anti-spam, anti-link kicks and ban removals all require
  admin rights; everything else works without it.

### Command not working / wrong command running
1. Every command has exactly **one canonical name** — duplicate commands were
   removed. If an old name is gone, use its replacement:
   - `.blocklist`/`.checkblock` → `.blocks` / `.check` (owner)
   - admin `.unblock <number>` → `.delblock <number>` (alias `.removeblock`)
2. If a command seems to do the wrong thing, check it is not shadowed: e.g.
   `.clean` (delete messages), `.scan` (scan group for blocked numbers),
   `.alive` (bot alive check), `.uptime` (runtime) are separate commands —
   the aliases that used to collide were removed.
3. Run `.menu` to see the current command list; unknown commands get no reply.

### Detection on/off not behaving
1. Each detector is one command with one setting — `.antilink`, `.antitag`,
   `.antiacc`, `.antispam`, `.antiword`, `.detc`, `.antidelete`. `on` enables,
   `off` disables, nothing else triggers it.
2. `.antiacc` controls contact-card protection per group (off by default).
   Contact-card enforcement only runs while it is ON.
3. The old forwarded-status "anti mention" system was merged into `.antitag`;
   if a group still has stale settings, `.antitag off` then `.antitag on`
   resets them cleanly.
4. Detectors never act on the bot owner/co-owners and respect group admin
   status. If detection is off but messages still get removed, check another
   protection (`antiall`, mute) or the bans system.

### Owner display looks wrong
1. The menu shows the **bot's own number first, labeled `C Owner`**, then the
   configured owners in international format (+CC XXX XXX XXX). Owner numbers
   come from `config.js` — editing the list there updates every display.
2. JIDs (`...@s.whatsapp.net`) are always resolved to plain numbers in
   displays. The `.owner` command still sends contact cards for the configured
   owners.

### Permission denied when it should work
1. Hierarchy is strict and unchanged: **Owner (config) > Co-owner (database) >
   Bot Admin (database) > Bot User (session)**. Group admin alone does not
   grant bot command access.
2. `ownerOnly` commands require a config owner; `coOwnerOnly` accepts owners +
   co-owners; `adminOnly` accepts owners/co-owners + group admins.
3. In private mode (`selfMode`), only role-holders can use any command.
4. Check the role with `.roles`; add/remove approvals with `.addco/.delco`
   (owner) and `.addadm/.deladm` (owner/co-owner).

---

## Commands

| Category | Commands |
|---|---|
| **Owner** | `ban`, `mode`, `broadcast`, `restart`, `disconnect`, `setprefix`, `setbotname`, `setbotpp`, `setmenuimage`, `anticall`, `autoreact`, `update`, `addblock`, `delblock`, `blocks`, `check` |
| **Protection** | `lock`, `unlock`, `antispam`, `antiword`, `addword`, `delword`, `antidelete`, `scan`, `panic`, `detc`, `spamlimit`, `spamtime`, `rules` |
| **Admin** | `kick`, `promote`, `demote`, `antilink`, `antitag`, `antiacc`, `welcome`, `setwelcome`, `goodbye`, `setgoodbye`, `warn`, `resetwarn`, `setrules`, `ginfo`, `tagall`, `hidetag`, `mute`, `unmute`, `delete`, `clean`, `grouplink`, `reqs`, `approveall`, `setreqmsg` |
| **Roles** | `addco`, `delco`, `addadm`, `deladm`, `roles` |
| **General** | `menu`, `ping`, `alive`, `status`, `sticker`, `attp`, `tts`, `getpp`, `owner`, `uptime`, `viewonce`, `chat` |
| **AI** | `ai`, `imagine`, `gptimage` |
| **Utility** | `calc`, `translate`, `weather` |

---

## Legal

- This project is **not affiliated** with WhatsApp Inc.
- This is **independent and unofficial software**.
- Use at your own risk. The author assumes no liability for misuse.
