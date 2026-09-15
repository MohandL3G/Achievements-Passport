# Agent Guidelines & Project Rules

Welcome to the project! This file (`AGENTS.md`) defines the default rules, coding standards, and workflows for AI agents working in this workspace.

---

## 1. Workstation & Environment Specifications

### Primary Workstation (Main Work PC)
- **Computer Name:** `MOHANDL3G-WORK`
- **User:** `MohandL3G`
- **OS:** Microsoft Windows 11 Pro (64-bit)
- **CPU:** 13th Gen Intel Core i7-13620H
- **GPU:** Intel UHD Graphics
- **Shell:** PowerShell 7 (`pwsh`)
- **Installed Developer Tooling:** Git, VS Code
- **Note:** Node.js is NOT installed on this machine — do not attempt to run `node`/`npm` here; builds/tests must be run on the LXC server or deferred.

### Secondary Workstation (Remote)
- **Computer Name:** `SHHLC-LY`
- **User:** `hlc.ly`
- **OS:** Microsoft Windows 11 Pro (64-bit)
- **Access:** Passwordless SSH (`ssh hlc.ly@shhlc-ly.local`)
- **Also accessible via:** RustDesk

### Hyper-V Virtual Machines (on `SHHLC-LY`)

#### VM 1: DietPi Services (`ssh dietpi`)
- **SSH Target:** `dietpi@dietpi.local`
- **OS:** DietPi / Debian GNU/Linux (trixie, 64-bit)
- **Runtime:** Docker

#### VM 2: Proxmox VE (`ssh pve`)
- **SSH Target:** `root@proxmoxve.local`
- **OS:** Proxmox VE 9.2 (Debian 13, Linux 7.0-pve)
- **Timezone:** `Africa/Tripoli` (UTC+2 / EET)
- **Storage:** single ext4 root (`/dev/sda1`, 200 GB); no `local-lvm`; images/ISOs under `local` (`/var/lib/vz`).
- **Networking:**
  - `vmbr0` — external bridge (DHCP), work LAN `10.31.0.0/16`. Public-facing containers attach here.
  - `vmbr1` — internal-only bridge, private subnet `10.99.0.0/24`, no gateway. Backend-to-backend traffic (Cloudreve ↔ RustFS).
- **Containers:**
  - **CT 100:** Proxmox Backup Server (`proxmox-backup-server.local`, datastore `Sanctuary`)
  - **CT 101:** Docker host (LXC, `vmbr0`)
  - **CT 102:** RustFS S3 (`rustfs.local`, `10.31.0.126` DHCP, internal `10.99.0.2`; API `:9000`, console `:9001`)
  - **CT 105:** Cloudreve (`cloudreve.local`, `10.31.0.26`, internal `10.99.0.3`, UI `:5212`, external `cloudreve-hlc.mohandl3g.ly`)

---

## 2. Project: Achievements Passport (Web-Only, Multi-User)

### Architecture (current)
- **Stack:** Node 18+ / Express **5.1** backend (no DB, no Docker) + React 19 / Vite 6 / Tailwind 4 frontend.
- **Auth:** Steam OpenID 2.0 (identity-only) + a single shared `STEAM_API_KEY` server-side. Admin panel login uses hard-coded env credentials.
- **Data:** per-user JSON under `host/server/data/users/<steamid64>/` (`card.json`, `last_cr/*.json`, `backups/`), `users/index.json`, admin settings, encrypted S3 secrets.
- **Sources (priority):** 1) Steam Web API owned games; 2) CloudRedirect JSON (`cloud_redirect/stats/<accountId>/<appid>.json`).
- **Corrected field names (critical, do NOT regress):** CloudRedirect playtime keys are `minutes_2weeks` and `last_played` (NOT `minutes_last_two_weeks`/`last_played_time`). Achievement entries use `stat_id`/`bits`/`unlock_times`.
- **Scheduler:** single nightly job (default `0 0 * * *`, admin-editable), regenerates only `autoUpdate`-enabled users; owner pulls S3 first.
- **Gate:** default `protected` (SteamID64 whitelist); `open` allows any signed-in user. Managed in Admin panel.
- **Deployment:** runs in an LXC behind NPM (`192.168.0.104`) + Cloudflare, public `passport.mohandl3g.ly`.
- **API surface:** `/api/auth/*`, `/api/generate`, `/api/u/:steamid/card|games|games/:appid|badge.svg`, `/api/admin/*`, `/badge.svg`. SPA fallback on the catch-all `app.use` (Express 5 — never use `app.get('*')`).

### Conventions & rules
- **Never run build/compile/install commands unless explicitly instructed.** (No Node on this workstation.)
- **Never commit or echo credentials.** `host/server/.env` holds `ADMIN_PASSWORD`, `STEAM_API_KEY`, session/encryption secrets; it is git-ignored.
- Keep the C# sampling bug-fix history in mind: BKV nodes `BKV_UINT64`/`INT64` read lower 32 bits; CR name resolution uses cached `ISteamApps/GetAppList/v2` (7-day cache).
- Frontend is typed strictly (`noUnusedLocals`). Reuse existing `types/index.ts` and `api.ts` patterns.

---

## 3. Additional Documentation & References
- **Server Setup & Configuration:** `Server.md` — *not yet created*. Will cover the live deployment at `server.local` / `192.168.0.103`.
- **Reference folders (Desktop `Reference/`):** `{Corpus-Palworld-Passport, CloudRedirect, BetterSteamTools, CloudReEdit, PC-Achievements}` — design, CR JSON schema, and library-grid UX (reference only; never use donor achievements).