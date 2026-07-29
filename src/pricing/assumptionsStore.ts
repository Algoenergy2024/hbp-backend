import { pool } from "../db/pool.js";
import {
  BLUE,
  CLUSTER_ORDER,
  CLUSTERS,
  ELECTROLYSER_EFF,
  GREEN,
  GREY,
  PINK,
  TURQ,
  YEARS,
  type ClusterId,
  type Electrolyser,
  type Year
} from "./constants.js";

// In-memory cache of the currently-active curated assumptions, mirroring the
// shape of the static defaults in constants.ts. It starts as a deep clone of
// those defaults, so if the DB has never been seeded (or this process
// hasn't loaded it yet — e.g. in unit tests, which never call
// loadActiveAssumptions()), every getter below returns exactly what the
// dashboard's original calibration produced. loadActiveAssumptions()
// overlays whatever the assumptions table actually holds on top of that.
type YearMap = Record<Year, number>;

interface Cache {
  grey: { capexOpex: YearMap };
  blue: { capex: YearMap; ccsFee: YearMap; captureRate: YearMap };
  green: { capexOpex: YearMap };
  pink: { capexOpex: YearMap };
  turquoise: { capexOpex: YearMap; elecKwh: YearMap };
  electrolyserEfficiency: Record<Electrolyser, YearMap>;
  deliveryPoint: Record<ClusterId, { transportPerKg: YearMap; storagePerKg: YearMap }>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function defaultCache(): Cache {
  return {
    grey: { capexOpex: clone(GREY.capexOpex) },
    blue: { capex: clone(BLUE.capex), ccsFee: clone(BLUE.ccsFee), captureRate: clone(BLUE.captureRate) },
    green: { capexOpex: clone(GREEN.capexOpex) },
    pink: { capexOpex: clone(PINK.capexOpex) },
    turquoise: { capexOpex: clone(TURQ.capexOpex), elecKwh: clone(TURQ.elecKwh) },
    electrolyserEfficiency: clone(ELECTROLYSER_EFF),
    deliveryPoint: Object.fromEntries(
      CLUSTER_ORDER.map(id => [
        id,
        { transportPerKg: clone(CLUSTERS[id].transportPerKg), storagePerKg: clone(CLUSTERS[id].storagePerKg) }
      ])
    ) as Cache["deliveryPoint"]
  };
}

let cache: Cache = defaultCache();

// The full set of (category, key) pairs this store manages, and how to read/
// write each one against the in-memory cache. This table is what both the
// seed script and the load/write paths iterate over, so adding a new
// versioned assumption is a one-line addition here, not a scattered change.
const FIELD_MAP: { category: string; key: string; get: (y: Year) => number; set: (y: Year, v: number) => void }[] = [
  { category: "grey", key: "capexOpex", get: y => cache.grey.capexOpex[y], set: (y, v) => (cache.grey.capexOpex[y] = v) },
  { category: "blue", key: "capex", get: y => cache.blue.capex[y], set: (y, v) => (cache.blue.capex[y] = v) },
  { category: "blue", key: "ccsFee", get: y => cache.blue.ccsFee[y], set: (y, v) => (cache.blue.ccsFee[y] = v) },
  { category: "blue", key: "captureRate", get: y => cache.blue.captureRate[y], set: (y, v) => (cache.blue.captureRate[y] = v) },
  { category: "green", key: "capexOpex", get: y => cache.green.capexOpex[y], set: (y, v) => (cache.green.capexOpex[y] = v) },
  { category: "pink", key: "capexOpex", get: y => cache.pink.capexOpex[y], set: (y, v) => (cache.pink.capexOpex[y] = v) },
  { category: "turquoise", key: "capexOpex", get: y => cache.turquoise.capexOpex[y], set: (y, v) => (cache.turquoise.capexOpex[y] = v) },
  { category: "turquoise", key: "elecKwh", get: y => cache.turquoise.elecKwh[y], set: (y, v) => (cache.turquoise.elecKwh[y] = v) },
  ...(["PEM", "AEL", "SOE"] as Electrolyser[]).map(tech => ({
    category: "electrolyser_efficiency",
    key: tech,
    get: (y: Year) => cache.electrolyserEfficiency[tech][y],
    set: (y: Year, v: number) => (cache.electrolyserEfficiency[tech][y] = v)
  })),
  ...CLUSTER_ORDER.flatMap(id => [
    {
      category: "delivery_point",
      key: `${id}.transportPerKg`,
      get: (y: Year) => cache.deliveryPoint[id].transportPerKg[y],
      set: (y: Year, v: number) => (cache.deliveryPoint[id].transportPerKg[y] = v)
    },
    {
      category: "delivery_point",
      key: `${id}.storagePerKg`,
      get: (y: Year) => cache.deliveryPoint[id].storagePerKg[y],
      set: (y: Year, v: number) => (cache.deliveryPoint[id].storagePerKg[y] = v)
    }
  ])
];

/** Idempotent: inserts one active row per (category, key, year) that doesn't already have one. */
export async function seedAssumptionsIfEmpty(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>("SELECT count(*)::text FROM assumptions");
  if (Number(rows[0]!.count) > 0) return 0;

  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const field of FIELD_MAP) {
      for (const year of YEARS) {
        await client.query(
          `INSERT INTO assumptions (category, key, year, value, source, note, created_by)
           VALUES ($1, $2, $3, $4, 'curated', 'Initial seed from dashboard calibration', 'system')`,
          [field.category, field.key, year, JSON.stringify(field.get(year))]
        );
        inserted++;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return inserted;
}

/** Loads every active assumption row from the DB and overlays it onto the in-memory cache. */
export async function loadActiveAssumptions(): Promise<void> {
  const fresh = defaultCache();
  const { rows } = await pool.query<{ category: string; key: string; year: number; value: unknown }>(
    "SELECT category, key, year, value FROM assumptions WHERE superseded_at IS NULL AND year IS NOT NULL"
  );
  cache = fresh;
  for (const row of rows) {
    const field = FIELD_MAP.find(f => f.category === row.category && f.key === row.key);
    if (!field) continue;
    field.set(row.year as Year, Number(row.value));
  }
  console.log(`[assumptions] loaded ${rows.length} active assumption rows into cache`);
}

export function currentAssumptionsSnapshot(): Cache {
  return clone(cache);
}

/**
 * Writes a new value for (category, key, year): supersedes the current
 * active row (if any) and inserts a new one, then refreshes the in-memory
 * cache. Nothing is ever overwritten in place — the full history stays
 * queryable via the `assumptions` table's superseded_at chain.
 */
export async function writeAssumption(
  category: string,
  key: string,
  year: Year,
  value: number,
  note: string,
  createdBy: string
): Promise<void> {
  const field = FIELD_MAP.find(f => f.category === category && f.key === key);
  if (!field) {
    throw new Error(`Unknown assumption "${category}.${key}" — not managed by this store`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE assumptions SET superseded_at = now()
       WHERE category = $1 AND key = $2 AND year = $3 AND superseded_at IS NULL`,
      [category, key, year]
    );
    await client.query(
      `INSERT INTO assumptions (category, key, year, value, source, note, created_by)
       VALUES ($1, $2, $3, $4, 'curated', $5, $6)`,
      [category, key, year, JSON.stringify(value), note, createdBy]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  field.set(year, value);
}

// ---------------- Getters used by the pricing engine ----------------
// These are what engine.ts and defaults.ts read through instead of the
// static constants directly, so a DB-driven override (once loaded) applies
// everywhere the number is used without either module knowing the
// difference.

export const assumptions = {
  greyCapexOpex: (year: Year) => cache.grey.capexOpex[year],
  blueCapex: (year: Year) => cache.blue.capex[year],
  blueCcsFee: (year: Year) => cache.blue.ccsFee[year],
  blueCaptureRate: (year: Year) => cache.blue.captureRate[year],
  greenCapexOpex: (year: Year) => cache.green.capexOpex[year],
  pinkCapexOpex: (year: Year) => cache.pink.capexOpex[year],
  turqCapexOpex: (year: Year) => cache.turquoise.capexOpex[year],
  turqElecKwh: (year: Year) => cache.turquoise.elecKwh[year],
  electrolyserEfficiency: (tech: Electrolyser, year: Year) => cache.electrolyserEfficiency[tech][year],
  deliveryTransport: (clusterId: string, year: Year) =>
    cache.deliveryPoint[(clusterId as ClusterId) in cache.deliveryPoint ? (clusterId as ClusterId) : "ROAD"]
      .transportPerKg[year],
  deliveryStorage: (clusterId: string, year: Year) =>
    cache.deliveryPoint[(clusterId as ClusterId) in cache.deliveryPoint ? (clusterId as ClusterId) : "ROAD"]
      .storagePerKg[year]
};

export const FIELD_LIST = FIELD_MAP.map(f => ({ category: f.category, key: f.key }));
