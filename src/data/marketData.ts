import { pool } from "../db/pool.js";
import { MARKET_DEFAULTS, type Year } from "../pricing/constants.js";
import type { MarketPrices } from "../pricing/engine.js";
import { fetchElexonDailyAveragePrice } from "./elexon.js";
import { fetchUkEtsCarbonPrice } from "./ukets.js";

// Only the "current" scenario year can ever be live — 2030/2035/2040/2046 are
// forward scenarios by definition and always come from the curated
// assumptions table, no matter what today's real-world date is.
export const LIVE_ELIGIBLE_YEAR: Year = 2026;

const FRESHNESS_HOURS = 36;

export type Series = "power_gbp_mwh" | "gas_gbp_mwh" | "carbon_gbp_t" | "nuclear_ppa_gbp_mwh";

export async function recordObservation(series: Series, value: number, source: string, observedAt: Date) {
  await pool.query(
    `INSERT INTO market_observations (series, value, source, observed_at) VALUES ($1, $2, $3, $4)`,
    [series, value, source, observedAt]
  );
}

async function getLatestObservation(series: Series): Promise<{ value: number; source: string } | null> {
  const { rows } = await pool.query<{ value: string; source: string; observed_at: Date }>(
    `SELECT value, source, observed_at FROM market_observations
     WHERE series = $1 AND observed_at > now() - interval '${FRESHNESS_HOURS} hours'
     ORDER BY observed_at DESC LIMIT 1`,
    [series]
  );
  const row = rows[0];
  if (!row) return null;
  return { value: Number(row.value), source: row.source };
}

export interface MarketPriceSources {
  gasPrice: string;
  gridElec: string;
  nuclearPPA: string;
  carbonPrice: string;
}

/**
 * Resolves the market prices the pricing engine needs for a given scenario
 * year, preferring a fresh live observation (electricity, carbon — only for
 * the current scenario year) and falling back to the curated table for
 * everything else, including every forward year by design.
 */
export async function getMarketPrices(
  year: Year
): Promise<{ prices: MarketPrices; sources: MarketPriceSources }> {
  let gridElec = MARKET_DEFAULTS.gridElecAvg[year];
  let gridElecSource = "curated";
  let carbonPrice = MARKET_DEFAULTS.carbon[year];
  let carbonSource = "curated";

  if (year === LIVE_ELIGIBLE_YEAR) {
    const liveElec = await getLatestObservation("power_gbp_mwh");
    if (liveElec) {
      gridElec = liveElec.value;
      gridElecSource = liveElec.source;
    }
    const liveCarbon = await getLatestObservation("carbon_gbp_t");
    if (liveCarbon) {
      carbonPrice = liveCarbon.value;
      carbonSource = liveCarbon.source;
    }
  }

  return {
    prices: {
      gasPrice: MARKET_DEFAULTS.gasAvg[year],
      gridElec,
      nuclearPPA: MARKET_DEFAULTS.nuclearPPA[year],
      carbonPrice
    },
    sources: {
      gasPrice: "curated",
      gridElec: gridElecSource,
      nuclearPPA: "curated",
      carbonPrice: carbonSource
    }
  };
}

/** Pulls fresh data from every configured live connector and records it. */
export async function refreshLiveMarketData(): Promise<void> {
  const elexon = await fetchElexonDailyAveragePrice();
  if (elexon) {
    await recordObservation("power_gbp_mwh", elexon.value, "live_elexon", new Date(elexon.observedDate));
    console.log(`[market] recorded live power price: £${elexon.value}/MWh (${elexon.observedDate})`);
  } else {
    console.warn("[market] elexon fetch returned no data — grid electricity stays on curated value for now");
  }

  const ukets = await fetchUkEtsCarbonPrice();
  if (ukets) {
    await recordObservation("carbon_gbp_t", ukets.value, "live_ukets", new Date(ukets.observedDate));
    console.log(`[market] recorded live carbon price: £${ukets.value}/t (${ukets.observedDate})`);
  }
  // No warning if UK ETS isn't configured — that's the expected default state, not an error.
}
