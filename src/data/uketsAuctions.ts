import { pool } from "../db/pool.js";
import { recordObservation } from "./marketData.js";

/**
 * Historical UK ETS primary auction clearing prices (£ per allowance,
 * i.e. £ per tCO2e). There is no free structured API for this data (ICE
 * Futures Europe runs the auctions and secondary market under a paid
 * market-data subscription) - these were sourced directly from ICE's
 * public auction result bulletins by hand. Auctions run roughly
 * fortnightly, so this backfills the known history once on first boot;
 * new results are added going forward via the admin "record auction
 * result" action (POST /api/market/carbon-auction), not by polling.
 */
const HISTORICAL_AUCTIONS: Array<{ date: string; price: number }> = [
  { date: "2022-01-26", price: 81.0 },
  { date: "2022-02-09", price: 81.81 },
  { date: "2022-02-23", price: 82.0 },
  { date: "2022-03-09", price: 62.21 },
  { date: "2022-03-23", price: 72.6 },
  { date: "2022-04-06", price: 69.37 },
  { date: "2022-04-20", price: 74.5 },
  { date: "2022-05-04", price: 78.0 },
  { date: "2022-05-18", price: 82.2 },
  { date: "2022-06-01", price: 79.0 },
  { date: "2022-06-15", price: 79.25 },
  { date: "2022-06-29", price: 81.21 },
  { date: "2022-07-13", price: 80.67 },
  { date: "2022-07-27", price: 75.5 },
  { date: "2022-08-10", price: 79.75 },
  { date: "2022-08-24", price: 90.0 },
  { date: "2022-09-07", price: 80.0 },
  { date: "2022-09-21", price: 73.0 },
  { date: "2022-10-05", price: 72.37 },
  { date: "2022-10-19", price: 67.0 },
  { date: "2022-11-02", price: 71.65 },
  { date: "2022-11-16", price: 67.74 },
  { date: "2022-11-30", price: 69.5 },
  { date: "2022-12-14", price: 68.0 },
  { date: "2023-01-11", price: 62.5 },
  { date: "2023-01-25", price: 61.56 },
  { date: "2023-02-08", price: 78.0 },
  { date: "2023-02-22", price: 78.24 },
  { date: "2023-03-08", price: 79.55 },
  { date: "2023-03-22", price: 70.7 },
  { date: "2023-04-05", price: 69.51 },
  { date: "2023-04-19", price: 64.5 },
  { date: "2023-05-03", price: 55.22 },
  { date: "2023-05-17", price: 57.5 },
  { date: "2023-05-31", price: 50.05 },
  { date: "2023-06-14", price: 55.25 },
  { date: "2023-06-28", price: 51.12 },
  { date: "2023-07-12", price: 48.61 },
  { date: "2023-07-26", price: 46.62 },
  { date: "2023-08-09", price: 39.22 },
  { date: "2023-08-23", price: 48.03 },
  { date: "2023-09-06", price: 42.75 },
  { date: "2023-09-20", price: 35.0 },
  { date: "2023-10-04", price: 40.0 },
  { date: "2023-10-18", price: 46.12 },
  { date: "2023-11-01", price: 38.11 },
  { date: "2023-11-15", price: 41.52 },
  { date: "2023-11-29", price: 41.12 },
  { date: "2023-12-13", price: 33.1 },
  { date: "2024-01-10", price: 37.02 },
  { date: "2024-01-24", price: 32.61 },
  { date: "2024-02-07", price: 32.75 },
  { date: "2024-02-21", price: 32.1 },
  { date: "2024-03-06", price: 34.7 },
  { date: "2024-03-20", price: 34.65 },
  { date: "2024-04-03", price: 32.7 },
  { date: "2024-04-17", price: 33.5 },
  { date: "2024-05-01", price: 35.15 },
  { date: "2024-05-15", price: 37.0 },
  { date: "2024-05-29", price: 43.75 },
  { date: "2024-06-12", price: 46.92 },
  { date: "2024-06-26", price: 45.0 },
  { date: "2024-07-10", price: 40.35 },
  { date: "2024-07-24", price: 38.62 },
  { date: "2024-08-07", price: 36.1 },
  { date: "2024-08-21", price: 39.25 },
  { date: "2024-09-04", price: 40.9 },
  { date: "2024-09-18", price: 39.2 },
  { date: "2024-10-02", price: 34.91 },
  { date: "2024-10-16", price: 38.25 },
  { date: "2024-10-30", price: 36.72 },
  { date: "2024-11-13", price: 37.3 },
  { date: "2024-11-27", price: 35.5 },
  { date: "2024-12-11", price: 34.55 },
  { date: "2025-01-08", price: 32.8 },
  { date: "2025-01-22", price: 31.2 },
  { date: "2025-02-05", price: 44.5 },
  { date: "2025-02-19", price: 41.25 },
  { date: "2025-03-05", price: 38.03 },
  { date: "2025-03-19", price: 44.55 },
  { date: "2025-04-02", price: 43.25 },
  { date: "2025-04-16", price: 46.01 },
  { date: "2025-04-30", price: 45.0 },
  { date: "2025-05-14", price: 47.44 },
  { date: "2025-05-28", price: 50.37 },
  { date: "2025-06-11", price: 51.63 },
  { date: "2025-06-25", price: 48.11 },
  { date: "2025-07-09", price: 45.6 },
  { date: "2025-07-23", price: 48.5 },
  { date: "2025-08-06", price: 49.75 },
  { date: "2025-08-20", price: 49.95 },
  { date: "2025-09-03", price: 53.55 },
  { date: "2025-09-17", price: 57.25 },
  { date: "2025-10-01", price: 53.5 },
  { date: "2025-10-15", price: 54.4 },
  { date: "2025-10-29", price: 55.5 },
  { date: "2025-11-12", price: 57.1 },
  { date: "2025-11-26", price: 57.03 },
  { date: "2025-12-10", price: 55.11 },
  { date: "2026-01-14", price: 67.55 },
  { date: "2026-01-28", price: 64.75 },
  { date: "2026-02-11", price: 45.24 },
  { date: "2026-02-25", price: 44.41 },
  { date: "2026-03-11", price: 39.39 },
  { date: "2026-03-25", price: 36.38 },
  { date: "2026-04-08", price: 40.49 },
  { date: "2026-04-22", price: 45.0 },
  { date: "2026-05-06", price: 49.05 },
  { date: "2026-05-20", price: 49.0 },
  { date: "2026-06-03", price: 54.72 },
  { date: "2026-06-17", price: 57.23 },
  { date: "2026-07-01", price: 54.44 },
  { date: "2026-07-15", price: 57.33 },
  { date: "2026-07-29", price: 59.26 }
];

export const MANUAL_AUCTION_SOURCE = "live_ice_auction";

/** Idempotent: only backfills if no manual auction observations exist yet. */
export async function seedCarbonAuctionsIfEmpty(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM market_observations WHERE series = 'carbon_gbp_t' AND source = $1`,
    [MANUAL_AUCTION_SOURCE]
  );
  if (Number(rows[0]?.count ?? 0) > 0) return 0;

  for (const { date, price } of HISTORICAL_AUCTIONS) {
    await recordObservation("carbon_gbp_t", price, MANUAL_AUCTION_SOURCE, new Date(date));
  }
  return HISTORICAL_AUCTIONS.length;
}

export const _internal = { HISTORICAL_AUCTIONS };
