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
npm run migrate              # creates tables
npm run dev                  # starts the API + web console on :4000
```

Open `http://localhost:4000` — that's the actual console now, not the
standalone artifact. Register an account, and you're in.

## Quick start (Docker)

```bash
docker compose up --build
```

Runs Postgres + the API together. Run migrations once the containers are up:

```bash
docker compose exec api npm run migrate
```

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
| `GET /api/market?year=` | none | Resolved market prices for a scenario year, tagged live vs curated per series |
| `GET /api/market/observations` | none | Most recent raw observation per live series, for transparency |
| `POST /api/auth/register`, `/login` | none | Email/password auth, returns a JWT |
| `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id` | JWT | Per-user saved projects (the workspace scenarios) |
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
handful of users) — see Auth below for why.

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

**What's in the console today:** sign in/register, Price Explorer (cost
breakdown, uncertainty band, carbon policy exposure, live/curated market
badge), Pathway Comparison (ranked, plus the static GeoPura spot-price
reference card), and Project Workspace (add/edit/delete a project per
pathway, CfD gap, all persisted server-side — no more `localStorage`).

**What didn't come across in this pass**, and is genuinely still open:
sensitivity tornado charts, the two-variable heatmap, Portfolio Blend, and
CSV/PNG export. None of these need new backend capability to add — the
sensitivity/heatmap views specifically would want a small "cost with
market-price overrides" endpoint (so a swept gas/carbon/capex value is
still computed server-side, not duplicated as a formula in the browser)
rather than reusing `/api/pathways/:pathway/cost` as-is.

## What's genuinely next

1. Decide the gas/carbon licensed-data question, if/when budget allows —
   the connector shape for either is already there in `src/data/`.
2. Bring over sensitivity, the heatmap, Portfolio Blend, and CSV/PNG export
   from the original dashboard artifact into the web console.
3. Revisit auth/permissioning once there's a real answer to "who uses this
   and what should they each be able to see" — likely the point at which
   `is_admin` becomes a proper roles table instead of one boolean.
