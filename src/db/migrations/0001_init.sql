-- HBP backend: initial schema
-- Users, persisted projects (replacing browser localStorage), a versioned
-- "assumptions" ledger for curated technology/cluster data, and a market
-- observations table that live connectors and curated fallbacks both write to.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pathway       TEXT NOT NULL CHECK (pathway IN ('grey','blue','green','pink','turquoise')),
  name          TEXT NOT NULL,
  electrolyser  TEXT CHECK (electrolyser IN ('PEM','AEL','SOE')),
  cluster_id    TEXT NOT NULL DEFAULT 'ROAD',
  sourced       BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT NOT NULL DEFAULT '',
  gas_price     NUMERIC NOT NULL DEFAULT 0,
  gas_kwh       NUMERIC NOT NULL DEFAULT 0,
  elec_price    NUMERIC NOT NULL DEFAULT 0,
  elec_kwh      NUMERIC NOT NULL DEFAULT 0,
  unabated_co2  NUMERIC NOT NULL DEFAULT 0,
  capture_rate  NUMERIC NOT NULL DEFAULT 0,
  carbon_price  NUMERIC NOT NULL DEFAULT 0,
  price_carbon  BOOLEAN NOT NULL DEFAULT false,
  capex         NUMERIC NOT NULL DEFAULT 0,
  ccs_fee       NUMERIC NOT NULL DEFAULT 0,
  credit        NUMERIC NOT NULL DEFAULT 0,
  other         NUMERIC NOT NULL DEFAULT 0,
  transport     NUMERIC NOT NULL DEFAULT 0,
  storage       NUMERIC NOT NULL DEFAULT 0,
  ref_price     NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- Versioned assumptions ledger: every technology/cluster constant the pricing
-- engine reads (capex curves, electrolyser efficiency, delivery-point adders,
-- etc.) lives here instead of in source code, with a full change history.
-- Only the row with superseded_at IS NULL for a given (category, key, year) is
-- "active" — updating a value inserts a new row and stamps the old one,
-- rather than overwriting it, so every published figure stays traceable.
CREATE TABLE IF NOT EXISTS assumptions (
  id            BIGSERIAL PRIMARY KEY,
  category      TEXT NOT NULL,      -- e.g. 'pathway', 'electrolyser_efficiency', 'delivery_point'
  key           TEXT NOT NULL,      -- e.g. 'grey', 'blue.capex', 'HYNET.transportPerKg'
  year          INT,                -- NULL for year-independent constants
  value         JSONB NOT NULL,
  source        TEXT NOT NULL DEFAULT 'curated', -- 'curated' | 'live_elexon' | 'live_ukets'
  note          TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assumptions_active
  ON assumptions(category, key, year) WHERE superseded_at IS NULL;

-- Market observations: both live-fetched (Elexon, UK ETS) and curated
-- fallback series land here, tagged by source, so the API can report
-- "this electricity price is live as of 14:32" vs "this gas price is the
-- curated 2026 assumption" from the same table.
CREATE TABLE IF NOT EXISTS market_observations (
  id          BIGSERIAL PRIMARY KEY,
  series      TEXT NOT NULL, -- 'power_gbp_mwh' | 'gas_gbp_mwh' | 'carbon_gbp_t' | 'nuclear_ppa_gbp_mwh'
  value       NUMERIC NOT NULL,
  source      TEXT NOT NULL, -- 'live_elexon' | 'live_ukets' | 'curated'
  observed_at TIMESTAMPTZ NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_observations_series_time
  ON market_observations(series, observed_at DESC);
