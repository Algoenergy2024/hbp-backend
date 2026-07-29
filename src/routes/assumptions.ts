import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { YEARS, type Year } from "../pricing/constants.js";
import { FIELD_LIST, loadActiveAssumptions, writeAssumption } from "../pricing/assumptionsStore.js";

const router = Router();

// Public and unauthenticated by design: anyone should be able to see exactly
// what assumption is driving the published price and when it last changed —
// that visibility is the whole credibility argument for a "neutral"
// reference price. Only *writing* a new value requires admin.

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT category, key, year, value, source, note, created_by, created_at
     FROM assumptions WHERE superseded_at IS NULL ORDER BY category, key, year`
  );
  res.json({ assumptions: rows, managedFields: FIELD_LIST });
});

router.get("/:category/:key/history", async (req, res) => {
  const { category, key } = req.params;
  const { rows } = await pool.query(
    `SELECT year, value, source, note, created_by, created_at, superseded_at
     FROM assumptions WHERE category = $1 AND key = $2 ORDER BY year, created_at`,
    [category, key]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: `No assumption history for "${category}.${key}"` });
    return;
  }
  res.json({ category, key, history: rows });
});

const writeSchema = z.object({
  year: z.coerce.number().refine((y): y is Year => (YEARS as readonly number[]).includes(y)),
  value: z.number(),
  note: z.string().min(1, "A note explaining the change is required for the audit trail")
});

router.put("/:category/:key", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { category, key } = req.params;
  const { year, value, note } = parsed.data;
  try {
    await writeAssumption(category, key, year, value, note, `user:${req.userId}`);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  res.json({ category, key, year, value, note, updatedBy: req.userId });
});

// Re-syncs the in-memory cache from the DB — mainly useful if multiple API
// instances are ever run and one needs to pick up another's change out of
// band from writeAssumption()'s own cache update.
router.post("/reload", requireAuth, requireAdmin, async (_req, res) => {
  await loadActiveAssumptions();
  res.json({ status: "reloaded" });
});

export default router;
