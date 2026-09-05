# Copa DeL Stream — Full Stack (Frontend + Admin + API + Database)

This is a real full-stack app now: a Node/Express **backend** with a **SQLite database**,
a set of **REST APIs**, and two **frontends** (the public site and the password-protected
admin panel) that both talk to those APIs. Everything runs from one server process.

```
copa-del-stream/
  server.js        <- Express app: all API routes + serves the two frontends
  db.js             <- SQLite schema + seed data (creates data/copa.db on first run)
  tiers.js           <- the grading system (rating -> tier), shared by API + both frontends
  package.json
  .env.example       <- copy to .env to change the admin password/port
  data/               <- SQLite database file lives here (created automatically)
  public/
    index.html       <- public frontend (fetches everything from the API)
    admin.html         <- admin frontend (login, then edit players/fixtures/standings/stats/text)
    assets/            <- card art + pitch photos, served at /assets/...
```

## The grading system

A player's card art is chosen automatically from their **rating** — this logic lives in
one place (`tiers.js`) and both the API responses and the two frontends use it, so it can
never drift out of sync:

| Rating | Tier | Card art |
|---|---|---|
| 96+ | **Black** | `assets/tier-black.png` |
| 86–95 | **Gold** | `assets/tier-gold.png` |
| 76–85 | **Red** | `assets/tier-red.png` |
| ≤75 | **White** | `assets/tier-white.png` |

Change a player's rating in the admin panel and their card automatically switches tier —
nothing else to configure. If you'd rather have different cutoffs, they're the four `if`
lines at the top of `tiers.js`.

## Running it locally

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd copa-del-stream
npm install
npm start
```

Then open:
- **http://localhost:3000** — the public site
- **http://localhost:3000/admin.html** — the admin panel

Login: password `firststreamprom`, passphrase `letmoiin` (change these in `.env`, see below).

The first time it starts, `db.js` creates `data/copa.db` and fills it with the same
default teams/players/fixtures you already had. After that, the file just persists —
restarting the server never re-seeds or wipes your edits.

## Changing the admin password

Copy `.env.example` to `.env` and edit it:

```
PORT=3000
ADMIN_PASSWORD=firststreamprom
ADMIN_PASSPHRASE=letmoiin
```

**Please change these before putting this anywhere public.** The check itself happens
server-side now (a real improvement over the old client-side-only version), but a login
session is just a random token held in the server's memory — good enough for a small
hobby league, not bank-grade auth. Restarting the server logs everyone out.

## The APIs

All under `/api`. Read endpoints (`GET`) are open; write endpoints (`POST`/`PUT`/`DELETE`)
require `Authorization: Bearer <token>` from `/api/auth/login`.

| Method & path | What it does |
|---|---|
| `POST /api/auth/login` | `{password, passphrase}` → `{token}` |
| `POST /api/auth/logout` | invalidates the current token |
| `GET /api/teams` | all teams with their players nested (tier included) |
| `POST/PUT/DELETE /api/teams(/:id)` | manage teams *(admin)* |
| `GET /api/players?team=slug` | players for one team, or all players |
| `POST/PUT/DELETE /api/players(/:id)` | manage players & ratings *(admin)* |
| `GET /api/fixtures` | `{upcoming:[], results:[]}` |
| `POST/PUT/DELETE /api/fixtures(/:id)` | manage fixtures *(admin)* |
| `GET /api/standings` | league table rows |
| `POST/PUT/DELETE /api/standings(/:id)` | manage standings *(admin)* |
| `GET /api/stats` | top-scorers table rows |
| `POST/PUT/DELETE /api/stats(/:id)` | manage stats *(admin)* |
| `GET /api/content` | home-page text as `{key: value}` |
| `PUT /api/content/:key` | update one piece of home-page text *(admin)* |

## The database

Plain SQLite (`better-sqlite3`), a real embedded SQL database — no external service to
sign up for. The file is at `data/copa.db`; open it with any SQLite browser (e.g. "DB
Browser for SQLite") if you want to poke at it directly, or just use the admin panel.

## Deploying for free

Because this now has a real backend (not just static files), it needs a host that runs
Node — plain GitHub Pages / Netlify Drop-style static hosting won't work anymore for the
API. These free options run Node for you:

### Option A — Render.com (recommended, genuinely free tier)
1. Push this folder to a GitHub repository (create a free GitHub account if needed).
2. On [render.com](https://render.com), "New +" → "Web Service" → connect that repo.
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add environment variables `ADMIN_PASSWORD` and `ADMIN_PASSPHRASE` in Render's dashboard
   (Settings → Environment) instead of shipping a `.env` file.
5. Deploy. You get a free `https://your-app.onrender.com` address.
6. **Note:** Render's free web services spin down after 15 minutes of inactivity and take
   ~30–60s to wake back up on the next visit — fine for a casual fan site, just know the
   first visitor after a quiet period waits a bit. Also, the free tier's disk isn't
   guaranteed to persist forever across redeploys — for a hobby project that's an
   acceptable tradeoff; if you want guaranteed persistence, Render also offers a free
   Postgres database you could point `db.js` at instead of the SQLite file (say the word
   if you want that swapped in).

### Option B — Glitch.com
1. Create a free Glitch account, "New Project" → "Import from GitHub" (or upload the
   folder directly).
2. Glitch auto-runs `npm start`. Free projects "sleep" after 5 minutes of inactivity and
   wake on the next request, similar tradeoff to Render.
3. You get a free `https://your-project-name.glitch.me` address.

### Option C — Fly.io free allowance
More setup (a `Dockerfile`/`fly.toml` and their CLI) but gives an always-on small free
instance rather than one that sleeps. Worth it if the spin-down delay on Render/Glitch
bothers your players — ask me and I'll generate the Fly config for this project.

## A custom domain name
All three options above give you a free subdomain (`*.onrender.com`, `*.glitch.me`,
`*.fly.dev`). A fully custom domain like `copadelstream.com` isn't free anywhere —
domains cost roughly $10–15/year minimum from any registrar. Be cautious of sites
advertising "free custom domains," since they're usually either giving you a subdomain
(same as above) or a trial that bills you later.
