import { Router } from "express";
import { z } from "zod";
import { getMarketPrices } from "../data/marketData.js";
import { CLUSTER_ORDER, CLUSTERS, PATHWAY_ORDER, UNCERTAINTY_PCT, YEARS, type Year } from "../pricing/constants.js";
import { greyCarbonExposure, pathwayCost, type Pathway } from "../pricing/engine.js";

const router = Router();

const querySchema = z.object({
  year: z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y), {
    message: `year must be one of ${YEARS.join(", ")}`
  }),
  clusterId: z.enum(CLUSTER_ORDER).default("ROAD"),
  electrolyser: z.enum(["PEM", "AEL", "SOE"]).default("PEM")
});

router.get("/", (_req, res) => {
  res.json({ pathways: PATHWAY_ORDER, deliveryPoints: CLUSTER_ORDER, years: YEARS });
});

router.get("/delivery-points", (_req, res) => {
  res.json(
    CLUSTER_ORDER.map(id => ({
      id,
      ...CLUSTERS[id]
    }))
  );
});

router.get("/:pathway/cost", async (req, res) => {
  const pathway = req.params.pathway as Pathway;
  if (!(PATHWAY_ORDER as readonly string[]).includes(pathway)) {
    res.status(404).json({ error: `Unknown pathway "${pathway}". Expected one of: ${PATHWAY_ORDER.join(", ")}` });
    return;
  }
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query parameters" });
    return;
  }
  const { year, clusterId, electrolyser } = parsed.data;

  const { prices, sources } = await getMarketPrices(year);
  const breakdown = pathwayCost(pathway, prices, year, clusterId, electrolyser);
  const uncertainty = UNCERTAINTY_PCT[pathway];

  const response: Record<string, unknown> = {
    pathway,
    year,
    clusterId,
    breakdown,
    uncertainty: {
      pct: uncertainty,
      low: breakdown.total * (1 - uncertainty),
      high: breakdown.total * (1 + uncertainty)
    },
    marketSources: sources
  };
  if (pathway === "grey" || pathway === "blue") {
    response.carbonPolicyExposure =
      pathway === "grey" ? greyCarbonExposure(prices.carbonPrice) : breakdown.carbon;
  }
  res.json(response);
});

router.get("/compare/:year", async (req, res) => {
  const parsed = querySchema.pick({ year: true, clusterId: true }).safeParse({
    year: req.params.year,
    clusterId: req.query.clusterId
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" });
    return;
  }
  const { year, clusterId } = parsed.data;
  const { prices, sources } = await getMarketPrices(year);

  const results = PATHWAY_ORDER.map(pathway => {
    const breakdown = pathwayCost(pathway, prices, year, clusterId, "PEM");
    return { pathway, total: breakdown.total, breakdown };
  }).sort((a, b) => a.total - b.total);

  res.json({ year, clusterId, marketSources: sources, ranking: results });
});

export default router;
