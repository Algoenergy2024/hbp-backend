import { Router } from "express";
import { z } from "zod";
import { getMarketPrices } from "../data/marketData.js";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { CLUSTER_ORDER, PATHWAY_ORDER, YEARS, type Year } from "../pricing/constants.js";
import { defaultProjectFor } from "../pricing/defaults.js";
import { computeProjectCosts, type ProjectInput } from "../pricing/engine.js";

const router = Router();
router.use(requireAuth);

interface ProjectRow extends ProjectInput {
  id: number;
  user_id: number;
  pathway: string;
  name: string;
  electrolyser: string | null;
  cluster_id: string;
  sourced: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toApi(row: ProjectRow) {
  const input: ProjectInput = {
    gasPrice: Number(row.gasPrice ?? (row as any).gas_price),
    gasKwh: Number((row as any).gas_kwh),
    elecPrice: Number((row as any).elec_price),
    elecKwh: Number((row as any).elec_kwh),
    unabatedCO2: Number((row as any).unabated_co2),
    captureRate: Number((row as any).capture_rate),
    carbonPrice: Number((row as any).carbon_price),
    priceCarbon: (row as any).price_carbon,
    capex: Number(row.capex),
    ccsFee: Number((row as any).ccs_fee),
    credit: Number(row.credit),
    other: Number(row.other),
    transport: Number(row.transport),
    storage: Number(row.storage),
    refPrice: Number((row as any).ref_price)
  };
  return {
    id: row.id,
    name: row.name,
    pathway: row.pathway,
    electrolyser: row.electrolyser,
    clusterId: (row as any).cluster_id,
    sourced: row.sourced,
    notes: row.notes,
    ...input,
    costs: computeProjectCosts(input),
    createdAt: (row as any).created_at,
    updatedAt: (row as any).updated_at
  };
}

router.get("/", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at ASC",
    [req.userId]
  );
  res.json({ projects: rows.map(toApi) });
});

const createSchema = z.object({
  pathway: z.enum(PATHWAY_ORDER),
  year: z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y)),
  electrolyser: z.enum(["PEM", "AEL", "SOE"]).default("PEM"),
  clusterId: z.enum(CLUSTER_ORDER).default("ROAD"),
  name: z.string().min(1).optional(),
  // Only matters for pathway "pink" — see getMarketPrices() for what each
  // scenario means. The chosen value is snapshotted into elecPrice below;
  // the project doesn't stay linked to the scenario after creation, same as
  // every other market price a project captures at creation time.
  nuclearScenario: z.enum(["smr", "hpc"]).default("smr")
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { pathway, year, electrolyser, clusterId, name, nuclearScenario } = parsed.data;
  const { prices } = await getMarketPrices(year, nuclearScenario);
  const defaults = defaultProjectFor(pathway, year, electrolyser, clusterId, prices);
  const projectName = name ?? `${pathway[0]!.toUpperCase()}${pathway.slice(1)} — ${year}`;

  const { rows } = await pool.query(
    `INSERT INTO projects
      (user_id, pathway, name, electrolyser, cluster_id, gas_price, gas_kwh, elec_price, elec_kwh,
       unabated_co2, capture_rate, carbon_price, price_carbon, capex, ccs_fee, credit, other,
       transport, storage, ref_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      req.userId,
      pathway,
      projectName,
      pathway === "green" ? electrolyser : null,
      clusterId,
      defaults.gasPrice,
      defaults.gasKwh,
      defaults.elecPrice,
      defaults.elecKwh,
      defaults.unabatedCO2,
      defaults.captureRate,
      defaults.carbonPrice,
      defaults.priceCarbon,
      defaults.capex,
      defaults.ccsFee,
      defaults.credit,
      defaults.other,
      defaults.transport,
      defaults.storage,
      defaults.refPrice
    ]
  );
  res.status(201).json(toApi(rows[0]));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  clusterId: z.enum(CLUSTER_ORDER).optional(),
  sourced: z.boolean().optional(),
  notes: z.string().optional(),
  gasPrice: z.number().optional(),
  gasKwh: z.number().optional(),
  elecPrice: z.number().optional(),
  elecKwh: z.number().optional(),
  unabatedCO2: z.number().optional(),
  captureRate: z.number().optional(),
  carbonPrice: z.number().optional(),
  priceCarbon: z.boolean().optional(),
  capex: z.number().optional(),
  ccsFee: z.number().optional(),
  credit: z.number().optional(),
  other: z.number().optional(),
  transport: z.number().optional(),
  storage: z.number().optional(),
  refPrice: z.number().optional()
});

const columnMap: Record<string, string> = {
  name: "name",
  clusterId: "cluster_id",
  sourced: "sourced",
  notes: "notes",
  gasPrice: "gas_price",
  gasKwh: "gas_kwh",
  elecPrice: "elec_price",
  elecKwh: "elec_kwh",
  unabatedCO2: "unabated_co2",
  captureRate: "capture_rate",
  carbonPrice: "carbon_price",
  priceCarbon: "price_carbon",
  capex: "capex",
  ccsFee: "ccs_fee",
  credit: "credit",
  other: "other",
  transport: "transport",
  storage: "storage",
  refPrice: "ref_price"
};

router.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const entries = Object.entries(parsed.data);
  if (entries.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const setClauses = entries.map(([key], i) => `${columnMap[key]} = $${i + 3}`);
  const values = entries.map(([, value]) => value);

  const { rows } = await pool.query(
    `UPDATE projects SET ${setClauses.join(", ")}, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.userId, ...values]
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(toApi(row));
});

const projectInputSchema = z.object({
  gasPrice: z.number().default(0),
  gasKwh: z.number().default(0),
  elecPrice: z.number().default(0),
  elecKwh: z.number().default(0),
  unabatedCO2: z.number().default(0),
  captureRate: z.number().default(0),
  carbonPrice: z.number().default(0),
  priceCarbon: z.boolean().default(false),
  capex: z.number().default(0),
  ccsFee: z.number().default(0),
  credit: z.number().default(0),
  other: z.number().default(0),
  transport: z.number().default(0),
  storage: z.number().default(0),
  refPrice: z.number().default(0)
});

const computeBatchSchema = z.object({
  base: projectInputSchema,
  variations: z
    .array(z.object({ label: z.string(), overrides: projectInputSchema.partial() }))
    .max(200, "Too many variations in one batch (max 200)")
});

// Stateless — computes computeProjectCosts() for a base project plus any
// number of field-overridden variations in one round trip. This is what the
// sensitivity tornado and two-variable heatmap in a project workspace sweep
// through, so the cost formula stays defined in exactly one place
// (pricing/engine.ts) instead of being re-implemented in the browser.
router.post("/compute-batch", (req: AuthedRequest, res) => {
  const parsed = computeBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { base, variations } = parsed.data;
  const results = variations.map(v => {
    const merged: ProjectInput = { ...base, ...v.overrides };
    return { label: v.label, costs: computeProjectCosts(merged) };
  });
  res.json({ base: computeProjectCosts(base), results });
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM projects WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (!rowCount) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.status(204).send();
});

export default router;
