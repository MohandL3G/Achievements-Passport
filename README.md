# Achievements Passport

A self-hosted, multi-user gaming achievements passport web app — "Login with Steam" and get a luxury corpus.gg-style passport card plus a searchable game library, mixed from your **Steam owned games** (Web API, one shared server key) and **CloudRedirect** JSON files (pirated/unowned games).

---

## Features

- **Multi-User "Sign in through Steam" (OpenID 2.0):** each visitor creates their own card with the identity-only Steam login. No passwords, no per-user API keys — the server holds **one shared Steam Web API key** in `.env`.
- **Multi-Source Priority Auto-Merge:**
  1. **Steam Web API (priority 1):** owned games, achievements, unlock state, global rarity `<10%`, completion %, playtime.
  2. **CloudRedirect stats JSON (priority 2):** achievements + `playtime_forever`, `minutes_2weeks`, `last_played` for pirated games.
- **Drop rule:** games with 0 playtime **and** 0 achievements are excluded.
- **Game name resolution:** unknown `App <id>` names resolved via cached `ISteamApps/GetAppList` (7-day disk cache).
- **Three generation paths** (in the Generate wizard): from Steam only, drop a folder of CloudRedirect JSONs, upload a `.zip`, or (owner) **auto-pull from S3 / RustFS**.
- **Single nightly scheduler (default 00:00, admin-editable cron):** regenerates every user that has **Auto-update** enabled; the owner additionally re-pulls CloudRedirect data from S3 first. UI shows "Automatic updates refresh daily at 00:00".
- **Access gate (protected by default):** the owner adds SteamID64s to a whitelist (or switches the gate to *Open* for any signed-in user). All covered from an admin panel with its own login.
- **GitHub badge:** `GET /badge.svg?steamid=<id>` live SVG + "Copy GitHub Badge" and "Save as PNG" buttons on the card.
- **No database.** Everything is JSON on disk: `data/users/<steamid64>/card.json` + timestamped backups, `data/users/index.json`, encrypted admin secrets.

---

## Repository Structure

```
Achievements-Passport/
└── host/
    ├── server/                     # Node 18+ / Express 5 API + static host (no DB)
    │   ├── server.js               # entry point (listens + starts scheduler)
    │   ├── .env.example            # configuration template (copy to .env)
    │   └── src/
    │       ├── app.js              # express assembly, sessions, rate limits, SPA fallback
    │       ├── config.js           # env loading
    │       ├── lib/
    │       │   ├── openid.js       # hand-rolled Steam OpenID 2.0 (identity-only)
    │       │   ├── steamApi.js     # shared-key Steam fetchers with disk cache
    │       │   ├── cloudRedirect.js# CR JSON parser (corrected minutes_2weeks/last_played)
    │       │   ├── aggregator.js   # priority merge, drop rule, summary, highlights
    │       │   ├── storage.js      # users, cards, backups, settings, secrets, cache
    │       │   ├── secrets.js      # AES-256-GCM at-rest encryption
    │       │   ├── s3Client.js     # path-style S3 pull + layout auto-detect
    │       │   ├── scheduler.js    # node-cron nightly job with lock file
    │       │   ├── badgesvg.js     # dynamic badge.svg renderer
    │       │   └── guards.js       # login/admin/CSRF/gate middleware
    │       └── routes/
    │           ├── auth.js         # Steam login, admin login, /me
    │           ├── generate.js     # POST /api/generate (steam|folder|zip|s3)
    │           ├── users.js        # GET /api/u/:steamid/card|games|games/:appid, /badge.svg
    │           ├── admin.js        # gate, scheduler, s3, users management, logs
    │           └── badge.js        # GET /badge.svg?steamid=
    └── frontend/                   # React 19 + Vite 6 + Tailwind 4
        └── src/
            ├── api.ts              # typed fetch helpers + CSRF
            ├── App.tsx             # auth state, tabs, shared /u/:id views
            └── components/
                ├── SignIn.tsx      # "Sign in through Steam" hero
                ├── PassportCard.tsx# card + copy GitHub badge + save PNG
                ├── GamesList.tsx   # search/filter/sort library
                ├── GameDetail.tsx  # per-game achievements
                ├── GenerateWizard.tsx
                ├── AdminPanel.tsx  # gate, scheduler, S3, users, logs
                └── Navbar.tsx      # tabs + user switcher
```

---

## Environment Setup (`host/server/.env`)

| Key | Purpose |
| --- | --- |
| `PORT` / `HOST` | Listen address (default `3281` / `0.0.0.0`) |
| `DATA_DIR` | Where user cards, settings, cache live (default `./data`) |
| `BASE_URL` | Public URL (e.g. `https://passport.mohandl3g.ly`). Empty = auto-detect. |
| `COOKIE_SECRET` | Session signing secret (long random string) |
| `ENCRYPTION_SECRET` | Key that encrypts stored admin S3 secrets at rest |
| `STEAM_API_KEY` | **One shared** Web API key (free at steamcommunity.com/dev/apikey) |
| `OWNER_STEAMID` | Site owner SteamID64 (Admin tab + nightly S3 pull) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Hard-coded admin account (login in `.env`, **never commit**) |
| `SCHEDULE_CRON` | Default nightly cron (default `0 0 * * *`) |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Run

```bash
cd host/server
npm install
node server.js
```

```bash
cd host/frontend
npm install
npm run build      # outputs host/frontend/dist (served by Express)
```

Dev frontend: `npm run dev` (proxies `/api` to `:3281`).

---

## Security Notes

- Admin credentials live only in `.env` (git-ignored); login is timing-safe, rate-limited (10 tries/15 min), and session cookie is HttpOnly + SameSite=Lax.
- Admin S3 credentials are encrypted at rest with AES-256-GCM using `ENCRYPTION_SECRET`.
- Mutating API routes validate a per-session CSRF token and same-origin.
- Uploads are capped (100 MB zip, ≤5000 files, 20 MB/file), only `*.json` entries are read from folders/zips.
- The nightly Steam re-pull uses per-user/per-game disk caches (24 h) and a concurrency limit to stay far below Steam's ~100k calls/day per key.
