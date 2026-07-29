# HBP Backend

Backend API for Hydrogen Balancing Point (HBP): the pricing engine, live
market data connectors, and project/scenario persistence behind the HBP
dashboard. This is Phase 1 of the platform's build-out — see
[Architecture & current state](#architecture--current-state) for exactly
what is and isn't live yet.

## Quick start (local, no Docker)

Requires Node 20+ and a local Postgres.

```bash
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npm run migrate              # creates tables
npm run dev                  # starts the API on :4000
```

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

**Curated data today** lives in `src/pricing/constants.ts` as the same
plain constants the dashboard used. The `assumptions` table
(migration `0001_init.sql`) exists so those constants can move to a
versioned, audited ledger — every technology/delivery-point figure gets a
row per change instead of being overwritten, which is what a "neutral
reference price" needs to be defensible. **That table is not wired up
yet** — the engine still reads `constants.ts` directly. Wiring assumptions
lookups through the DB (with `constants.ts` as the seed/fallback) is the
natural next piece of work, not a placeholder left by accident.

**Auth** is deliberately minimal: email/password, one permission level, JWT.
No organisations, no roles, no fine-grained sharing — those are blocked on
a decision about who HBP is actually for (see the platform briefing doc,
Section 9), and building permissioning before that's answered would mean
guessing at a shape that's likely wrong.

## What's genuinely next

1. Wire `assumptions` table reads into the pricing engine (with change
   history), replacing the direct `constants.ts` reads.
2. Decide the gas/carbon licensed-data question, if/when budget allows —
   the connector shape for either is already there in `src/data/`.
3. Point the dashboard frontend at this API instead of computing locally
   and using `localStorage` — a frontend change, not a backend one.
4. Revisit auth/permissioning once there's a real answer to "who uses this
   and what should they each be able to see."
