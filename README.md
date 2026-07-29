# HBP Backend

Backend API — and now the live web console — for Hydrogen Balancing Point
(HBP): the pricing engine, live market data connectors, and project/scenario
persistence. This is Phase 1 of the platform's build-out — see
[Architecture & current state](#architecture--current-state) for exactly
what is and isn't live yet.

## Quick start (local, no Docker)

Requires Node 20+ and a local Postgres.

```bash
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npm run dev                  # starts the API + web console on :4000
```

The server creates and migrates its own tables on startup (`runMigrations()`
in `src/index.ts`) — there's no separate setup step to remember. `npm run
migrate` still exists if you want to apply migrations without booting the
server (e.g. in a script), but it's optional, not required.

Open `http://localhost:4000` — that's the actual console now, not the
standalone artifact. Register an account, and you're in.

## Quick start (Docker)

```bash
docker compose up --build
```

That's it — no second command. The API container migrates and seeds its
own database on boot before it starts listening, same as local dev.

## Deploying (Railway)

Railway reads the `Dockerfile` directly — no extra config file needed.

1. **New Project → Deploy from GitHub repo** → pick `Algoenergy2024/hbp-backend`.
2. **Add a database**: in the same project, "+ New" → "Database" → "Add PostgreSQL". Railway provisions it and exposes its connection details as reference variables automatically.
3. On the **API service** (not the Postgres one), open its **Variables** tab and add:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (references the Postgres service you just added — pick it from Railway's variable-reference picker rather than typing it) |
   | `JWT_SECRET` | a long random string — generate one with `openssl rand -hex 32` (or any password generator), don't reuse the placeholder from `.env.example` |
   | `NODE_ENV` | `production` |
   | `DATABASE_SSL` | `false` to start with — only set to `true` if the deploy logs show a Postgres SSL connection error |
   | `MARKET_REFRESH_CRON` | `*/30 * * * *` (or leave unset — that's the default) |

   Leave `PORT` alone — Railway injects it automatically and the app already reads `process.env.PORT`.
4. Deploy. Watch the build logs, then the runtime logs — you're looking for the same sequence you saw locally: `apply ...`, `Migrations complete.`, `[assumptions] seeded ...`, `HBP backend listening on :<port>`.
5. Railway gives you a `*.up.railway.app` URL immediately (Settings → Networking → "Generate Domain" if one isn't there yet). That's a real, shareable HTTPS link. A custom domain can be attached from that same screen once you're ready.

Every `git push` to `main` triggers a new Railway build automatically — that's the one place in this whole setup where "push to GitHub" *does* directly update the live thing, unlike your local Docker copy, which still needs its own `git pull` + rebuild.

## Testing

```bash
npm test
```

The pricing engine's test suite (`src/pricing/engine.test.ts`) checks every
pathway, at every scenario year, against two things simultaneously: (a) the
exact figures the original dashboard artifact was calibrated to produce, and
(b) the published UK LCOH ranges those figures were calibrated against in the
first place. This is what catches a transcription error in the TypeScript
port before it reaches an API response.

## API overview

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/pathways` | none | Pathway/delivery-point/year enum |
| `GET /api/pathways/delivery-points` | none | Full delivery-point detail (mode, adders, caveat) |
| `GET /api/pathways/:pathway/cost?year=&clusterId=&electrolyser=` | none | Cost breakdown, uncertainty band, market sources for one pathway |
| `GET /api/pathways/compare/:year?clusterId=` | none | All five pathways ranked, same year/delivery point |
| `GET /api/pathways/:pathway/sensitivity?year=&clusterId=&electrolyser=` | none | One-variable tornado sweep (gas/elec/carbon/nuclear-PPA/capex), computed server-side |
| `GET /api/market?year=` | none | Resolved market prices for a scenario year, tagged live vs curated per series |
| `GET /api/market/observations` | none | Most recent raw observation per live series, for transparency |
| `POST /api/auth/register`, `/login` | none | Email/password auth, returns a JWT |
| `GET /api/auth/me` | JWT | The logged-in user's id/email/`isAdmin` — what the console uses to decide whether to show assumption-editing controls |
| `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id` | JWT | Per-user saved projects (the workspace scenarios) |
| `POST /api/projects/compute-batch` | JWT | Stateless `computeProjectCosts()` over a base project plus N field-overridden variations — what the workspace tornado/heatmap sweep through, in one round trip |
| `GET /api/assumptions` | none | Every currently-active curated assumption (capex curves, efficiency curves, delivery-point adders) |
| `GET /api/assumptions/:category/:key/history` | none | Full change history for one assumption, including superseded values |
| `PUT /api/assumptions/:category/:key` | JWT + admin | Revise one assumption for one year; supersedes the old value, never overwrites it |

## Architecture & current state

**Pricing engine** (`src/pricing/`): a direct port of the dashboard
artifact's cost functions — same formulas, same constants, verified against
the same published LCOH ranges. The one deliberate change from the browser
version: market prices are passed in as an argument instead of being read
from a global, which is what lets a live feed sit behind the same functions
without touching them.

**Live vs curated data** — this is the most important thing to understand
before extending this codebase:

- **Grid electricity** is live for the 2026 scenario year only, pulled from
  Elexon's public Insights Solution API (`src/data/elexon.ts`, GB settlement
  system prices, averaged across the day). Refreshed on a schedule
  (`MARKET_REFRESH_CRON`, default every 30 minutes) and cached in
  `market_observations`.
- **Carbon price** has a connector stub (`src/data/ukets.ts`) that only
  activates if `UKETS_AUCTION_URL` is configured, because UK ETS auction/
  secondary-market pricing has no free structured API — it sits behind
  licensed feeds (ICE's UK ETS auction platform, or vendors like
  Argus/ICIS). Until your org has one of those, carbon stays curated. This
  is intentional, not unfinished.
- **Gas price and nuclear PPA price** are always curated — NBP gas pricing
  at this granularity is also a licensed-data question, and nuclear PPA
  has no market feed at all, live or otherwise.
- **2030/2035/2040/2046 are always curated**, regardless of any of the
  above — they're forward scenarios by definition, not something a live
  feed could ever populate. Only `LIVE_ELIGIBLE_YEAR` (2026) in
  `src/data/marketData.ts` can ever resolve to a live value.

**Versioned, audited assumptions** (`src/pricing/assumptionsStore.ts`):
every capex curve, efficiency curve, and delivery-point adder — the numbers
a methodology committee would actually want to revise and sign off on — now
lives in the `assumptions` table, not just as constants in source code.
On first boot the table is seeded from `src/pricing/constants.ts` (the
dashboard's original calibration); after that, `constants.ts` is only the
fallback if a lookup is somehow missing, not the live source of truth. The
pricing engine reads through an in-memory cache (`assumptions.*` getters in
`assumptionsStore.ts`) that's loaded from the DB at startup, so nothing in
`engine.ts` needed to become async. Every write **supersedes** the previous
active row rather than overwriting it — `GET /api/assumptions/:category/:key/history`
shows the full chain, including who changed it, when, and why (a `note` is
required on every write). This is what actually earns the "neutral
reference price" claim; a live power feed does not.

Only admins can write an assumption (`src/middleware/admin.ts`) — reads stay
fully public, because visibility into what's driving the number is the
point. There's deliberately no self-serve way to become an admin yet
(`is_admin` is a plain boolean, flipped by hand in the DB for a pilot's
handful of users) — see Auth below for why. The console's Assumptions tab
is this ledger's actual UI: all 19 managed figures (every capex/efficiency
curve and delivery-point adder) shown as a pivoted table (field × year),
publicly readable by anyone; a value is clickable to edit only if
`GET /api/auth/me` says the logged-in user is an admin, and every "History"
button pulls the full supersede chain for that field — seed value, every
edit, who made it, and why. Editing is two native `prompt()` dialogs (new
value, then a required note), not a custom modal — deliberately the
simplest thing that keeps the interaction accessible, given this is an
admin-only power-tool control, not a public-facing flow.

**Auth** is deliberately minimal: email/password, one permission level plus
a single `is_admin` boolean, JWT. No organisations, no roles, no
fine-grained sharing — those are blocked on a decision about who HBP is
actually for (see the platform briefing doc, Section 9), and building
permissioning before that's answered would mean guessing at a shape that's
likely wrong.

**The web console** (`public/`) is a plain HTML/CSS/JS frontend served
directly by this same Express app (`express.static`), calling the API with
relative `/api/...` paths — deliberately not the original dashboard
artifact wired up as-is. That artifact runs inside Claude's Artifact
sandbox under a strict CSP that blocks calls to any external host, so it
was never going to be able to call a real backend from there; the frontend
had to move to be served by the backend itself instead. It carries over the
brand (tokens, type pairing, the diurnal cost-curve texture) but is a
smaller rewrite, not a line-for-line port — see below for exactly what
didn't come across yet.

**What's in the console today:** sign in/register; Price Explorer (cost
breakdown, uncertainty band, carbon policy exposure, live/curated market
badge, an illustrative 24-hour price curve, PNG export); Pathway Comparison
(ranked, plus the static GeoPura spot-price reference card); Sensitivity
(one-variable tornado per pathway, server-computed); Portfolio Blend
(weight any saved projects into one blended delivered price); and Project
Workspace (add/edit/delete a project per pathway, CfD gap, CSV export, a
per-project stress test with both a tornado sweep and a two-variable
heatmap) — all persisted server-side, no more `localStorage` for app data.

Every sweep (tornado or heatmap, canonical-pathway or per-project) is
computed by the backend, not duplicated as a formula in the browser: the
canonical ones call `/api/pathways/:pathway/sensitivity`, the per-project
ones call `/api/projects/compute-batch`. The frontend only ever renders
numbers the API returned.

One bug worth knowing about, since it's the kind that hides well: project
ids come back from Postgres (BIGSERIAL) as strings, and an early version of
the stress-test and portfolio-blend code ran them through `parseInt` before
comparing with `===` against the string ids already in `state.projects`.
That comparison silently fails a strict-equality check without throwing,
so the symptom was stale UI, not an error — caught by deliberately
instrumenting the DOM mid-test rather than trusting a clean console. Fixed
by comparing ids as strings everywhere; worth a second look if a similar
"nothing happens, no error either" symptom shows up elsewhere.

## What's genuinely next

1. Decide the gas/carbon licensed-data question, if/when budget allows —
   the connector shape for either is already there in `src/data/`.
2. Revisit auth/permissioning once there's a real answer to "who uses this
   and what should they each be able to see" — likely the point at which
   `is_admin` becomes a proper roles table instead of one boolean, and the
   Assumptions tab's edit prompts become a real form with per-category
   permissions.
