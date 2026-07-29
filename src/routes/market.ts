import { Router } from "express";
import { z } from "zod";
import { getMarketPrices, LIVE_ELIGIBLE_YEAR } from "../data/marketData.js";
import { pool } from "../db/pool.js";
import { YEARS, type Year } from "../pricing/constants.js";

const router = Router();

const yearSchema = z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y), {
  message: `year must be one of ${YEARS.join(", ")}`
});

router.get("/", async (req, res) => {
  const parsed = yearSchema.safeParse(req.query.year ?? LIVE_ELIGIBLE_YEAR);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid year" });
    return;
  }
  const year = parsed.data;
  const { prices, sources } = await getMarketPrices(year);
  res.json({ year, liveEligible: year === LIVE_ELIGIBLE_YEAR, prices, sources });
});

// Raw recent observations, for transparency on exactly what's live vs curated.
router.get("/observations", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (series) series, value, source, observed_at, fetched_at
     FROM market_observations ORDER BY series, observed_at DESC`
  );
  res.json({ observations: rows });
});

export default router;
