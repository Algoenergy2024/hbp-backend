import { Router } from "express";
import { z } from "zod";
import { getMarketPrices } from "../data/marketData.js";
import { CLUSTER_ORDER, CLUSTERS, PATHWAY_ORDER, UNCERTAINTY_PCT, YEARS, type Year } from "../pricing/constants.js";
import { baseCapexFor, greyCarbonExposure, pathwayCost, type Pathway } from "../pricing/engine.js";

const router = Router();

const querySchema = z.object({
  year: z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y), {
    message: `year must be one of ${YEARS.join(", ")}`
  }),
  clusterId: z.enum(CLUSTER_ORDER).default("ROAD"),
  electrolyser: z.enum(["PEM", "AEL", "SOE"]).default("PEM"),
  // Only the "pink" pathway reads market.nuclearPPA — see getMarketPrices()
  // for what each scenario means. Harmless to accept on every route since
  // every other pathway's cost formula ignores it.
  nuclearScenario: z.enum(["smr", "hpc"]).default("smr")
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
  const { year, clusterId, electrolyser, nuclearScenario } = parsed.data;

  const { prices, sources } = await getMarketPrices(year, nuclearScenario);
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

interface SweepRow {
  name: string;
  low: number;
  high: number;
  baseline: number;
  exposure?: boolean;
}

function sweep(name: string, baseline: number, f: (mult: number) => number, lowMult: number, highMult: number): SweepRow {
  const a = f(lowMult);
  const b = f(highMult);
  return { name, low: Math.min(a, b), high: Math.max(a, b), baseline };
}

router.get("/:pathway/sensitivity", async (req, res) => {
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
  const { year, clusterId, electrolyser, nuclearScenario } = parsed.data;
  const { prices } = await getMarketPrices(year, nuclearScenario);
  const baseline = pathwayCost(pathway, prices, year, clusterId, electrolyser).total;
  const baseCapex = baseCapexFor(pathway, year, electrolyser);

  function withCapex(mult: number) {
    return pathwayCost(pathway, prices, year, clusterId, electrolyser, { capex: baseCapex * mult }).total;
  }

  const rows: SweepRow[] = [];
  if (pathway === "grey") {
    rows.push(sweep("Gas price", baseline, m => pathwayCost("grey", { ...prices, gasPrice: prices.gasPrice * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Capex + O&M", baseline, withCapex, 0.8, 1.2));
    const exposureBase = greyCarbonExposure(prices.carbonPrice);
    rows.push({
      ...sweep("Carbon policy exposure", exposureBase, m => greyCarbonExposure(prices.carbonPrice * m), 0.7, 1.3),
      exposure: true
    });
  } else if (pathway === "blue") {
    rows.push(sweep("Gas price", baseline, m => pathwayCost("blue", { ...prices, gasPrice: prices.gasPrice * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Carbon price", baseline, m => pathwayCost("blue", { ...prices, carbonPrice: prices.carbonPrice * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Capex", baseline, withCapex, 0.8, 1.2));
  } else if (pathway === "green") {
    rows.push(sweep("Electricity price", baseline, m => pathwayCost("green", { ...prices, gridElec: prices.gridElec * m }, year, clusterId, electrolyser).total, 0.7, 1.3));
    rows.push(sweep("Capex + O&M", baseline, withCapex, 0.8, 1.2));
  } else if (pathway === "pink") {
    rows.push(sweep("Nuclear PPA price", baseline, m => pathwayCost("pink", { ...prices, nuclearPPA: prices.nuclearPPA * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Capex + O&M", baseline, withCapex, 0.8, 1.2));
  } else {
    rows.push(sweep("Gas price", baseline, m => pathwayCost("turquoise", { ...prices, gasPrice: prices.gasPrice * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Electricity price", baseline, m => pathwayCost("turquoise", { ...prices, gridElec: prices.gridElec * m }, year, clusterId).total, 0.7, 1.3));
    rows.push(sweep("Capex + O&M", baseline, withCapex, 0.8, 1.2));
  }

  res.json({ pathway, year, clusterId, baseline, rows });
});

router.get("/compare/:year", async (req, res) => {
  const parsed = querySchema.pick({ year: true, clusterId: true, nuclearScenario: true }).safeParse({
    year: req.params.year,
    clusterId: req.query.clusterId,
    nuclearScenario: req.query.nuclearScenario
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" });
    return;
  }
  const { year, clusterId, nuclearScenario } = parsed.data;
  const { prices, sources } = await getMarketPrices(year, nuclearScenario);

  const results = PATHWAY_ORDER.map(pathway => {
    const breakdown = pathwayCost(pathway, prices, year, clusterId, "PEM");
    return { pathway, total: breakdown.total, breakdown };
  }).sort((a, b) => a.total - b.total);

  res.json({ year, clusterId, marketSources: sources, ranking: results });
});

export default router;
