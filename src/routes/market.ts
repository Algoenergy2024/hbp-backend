import { Router } from "express";
import { z } from "zod";
import { getMarketPrices, LIVE_ELIGIBLE_YEAR, recordObservation } from "../data/marketData.js";
import { MANUAL_AUCTION_SOURCE } from "../data/uketsAuctions.js";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { YEARS, type Year } from "../pricing/constants.js";

const router = Router();

const yearSchema = z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y), {
  message: `year must be one of ${YEARS.join(", ")}`
});

const nuclearScenarioSchema = z.enum(["smr", "hpc"]).default("smr");

router.get("/", async (req, res) => {
  const parsed = yearSchema.safeParse(req.query.year ?? LIVE_ELIGIBLE_YEAR);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid year" });
    return;
  }
  const nuclearParsed = nuclearScenarioSchema.safeParse(req.query.nuclearScenario);
  const year = parsed.data;
  const nuclearScenario = nuclearParsed.success ? nuclearParsed.data : "smr";
  const { prices, sources } = await getMarketPrices(year, nuclearScenario);

  // Both nuclear scenarios alongside whichever one `prices`/`sources` used,
  // so a summary view (e.g. the Assumptions tab) can show "SMR vs HPC
  // actual" side by side without a second round trip.
  const [smr, hpc] = await Promise.all([
    getMarketPrices(year, "smr"),
    getMarketPrices(year, "hpc")
  ]);

  res.json({
    year,
    liveEligible: year === LIVE_ELIGIBLE_YEAR,
    prices,
    sources,
    nuclearScenarios: {
      smr: { value: smr.prices.nuclearPPA, source: smr.sources.nuclearPPA },
      hpc: { value: hpc.prices.nuclearPPA, source: hpc.sources.nuclearPPA }
    }
  });
});

// Raw recent observations, for transparency on exactly what's live vs curated.
router.get("/observations", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (series) series, value, source, observed_at, fetched_at
     FROM market_observations ORDER BY series, observed_at DESC`
  );
  res.json({ observations: rows });
});

const carbonAuctionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  clearingPrice: z.number().positive()
});

// UK ETS has no free structured API for auction/secondary-market prices —
// ICE Futures Europe's Report Centre sits behind a paid market-data
// subscription. Until that changes, this is how a real clearing price gets
// in: an admin records it by hand from ICE's published bulletin each time a
// new auction clears (roughly fortnightly), same audit-friendly spirit as
// the assumptions ledger. See uketsAuctions.ts for the historical backfill
// and why this source never expires under the usual freshness check.
router.post("/carbon-auction", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = carbonAuctionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { date, clearingPrice } = parsed.data;
  await recordObservation("carbon_gbp_t", clearingPrice, MANUAL_AUCTION_SOURCE, new Date(date));
  res.json({ date, clearingPrice, source: MANUAL_AUCTION_SOURCE, recordedBy: req.userId });
});

export default router;
