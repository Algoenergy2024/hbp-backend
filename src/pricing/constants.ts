// Default (curated) values for the pricing engine's constants. These are the
// seed data loaded into the `assumptions` table by the migration/seed script —
// this file is the fallback if the DB has no override for a given key, and the
// canonical record of "what the dashboard's original calibration was", not the
// live source of truth once the assumptions ledger is seeded.
//
// Ported 1:1 from the HBP dashboard artifact's pricing engine — see
// hydrogen-pricing-dashboard.html for the browser-side original.

export const YEARS = [2026, 2030, 2035, 2040, 2046] as const;
export type Year = (typeof YEARS)[number];

export const HHV_PER_KG = 39.4; // kWh HHV per kg H2

export const PATHWAY_ORDER = ["grey", "blue", "green", "pink", "turquoise"] as const;
export type Pathway = (typeof PATHWAY_ORDER)[number];

export const UNCERTAINTY_PCT: Record<Pathway, number> = {
  grey: 0.19,
  blue: 0.17,
  green: 0.23,
  pink: 0.21,
  turquoise: 0.25
};

export type YearRecord = Record<Year, number>;

export interface DeliveryPoint {
  name: string;
  short: string;
  mode: "road" | "pipeline";
  transportPerKg: YearRecord;
  storagePerKg: YearRecord;
  caveat: string;
}

export const CLUSTER_ORDER = ["ROAD", "HYNET", "HUMBER", "TEESSIDE"] as const;
export type ClusterId = (typeof CLUSTER_ORDER)[number];

export const CLUSTERS: Record<ClusterId, DeliveryPoint> = {
  ROAD: {
    name: "Off-cluster — Road delivery (default)",
    short: "Off-cluster",
    mode: "road",
    transportPerKg: { 2026: 1.0, 2030: 0.9, 2035: 0.8, 2040: 0.7, 2046: 0.65 },
    storagePerKg: { 2026: 1.0, 2030: 0.9, 2035: 0.8, 2040: 0.7, 2046: 0.65 },
    caveat:
      "Baseline case: no dedicated hydrogen pipeline. Compressed-gas tube-trailer delivery (~150km average haul). Logistics adder £2.00/kg (2026) declining to £1.30/kg (2046) as trailer fleets and utilisation improve."
  },
  HYNET: {
    name: "HyNet (North West)",
    short: "HyNet",
    mode: "pipeline",
    transportPerKg: { 2026: 0.25, 2030: 0.25, 2035: 0.25, 2040: 0.25, 2046: 0.25 },
    storagePerKg: { 2026: 0.55, 2030: 0.55, 2035: 0.55, 2040: 0.55, 2046: 0.55 },
    caveat:
      "Pipeline-connected industrial cluster spanning Cheshire, Merseyside and North Wales, anchored by CCUS and saline-aquifer CO2 storage. Logistics adder £0.80/kg, per the source document's dedicated/repurposed pipeline case."
  },
  HUMBER: {
    name: "Humber",
    short: "Humber",
    mode: "pipeline",
    transportPerKg: { 2026: 0.25, 2030: 0.25, 2035: 0.25, 2040: 0.25, 2046: 0.25 },
    storagePerKg: { 2026: 0.55, 2030: 0.55, 2035: 0.55, 2040: 0.55, 2046: 0.55 },
    caveat:
      "The UK's largest industrial emissions cluster, spanning blue and green hydrogen projects across the estuary. Logistics adder £0.80/kg, assuming pipeline delivery to connected offtakers."
  },
  TEESSIDE: {
    name: "Teesside (East Coast Cluster)",
    short: "Teesside",
    mode: "pipeline",
    transportPerKg: { 2026: 0.25, 2030: 0.25, 2035: 0.25, 2040: 0.25, 2046: 0.25 },
    storagePerKg: { 2026: 0.55, 2030: 0.55, 2035: 0.55, 2040: 0.55, 2046: 0.55 },
    caveat:
      "CCUS-anchored cluster with offshore CO2 storage in the Southern North Sea; East Coast Cluster ambitions span blue hydrogen and wider industrial decarbonisation. Logistics adder £0.80/kg, assuming pipeline delivery."
  }
};

export function clusterAdd(clusterId: string, year: Year): number {
  const c = CLUSTERS[clusterId as ClusterId] ?? CLUSTERS.ROAD;
  return (c.transportPerKg[year] ?? 0) + (c.storagePerKg[year] ?? 0);
}

// Curated market series defaults (used when no live observation is available).
export const MARKET_DEFAULTS = {
  gasAvg: { 2026: 28, 2030: 29, 2035: 31, 2040: 34, 2046: 36 } as YearRecord,
  gridElecAvg: { 2026: 95, 2030: 68, 2035: 58, 2040: 50, 2046: 42 } as YearRecord,
  nuclearPPA: { 2026: 60, 2030: 52, 2035: 46, 2040: 42, 2046: 38 } as YearRecord,
  carbon: { 2026: 45, 2030: 70, 2035: 110, 2040: 180, 2046: 230 } as YearRecord
};

export const GREY = {
  ngKwh: HHV_PER_KG / 0.74,
  elecKwh: 2,
  capexOpex: { 2026: 0.5, 2030: 0.47, 2035: 0.44, 2040: 0.4, 2046: 0.36 } as YearRecord,
  unabatedCO2PerKg: 9.3
};

export const BLUE = {
  ngKwh: HHV_PER_KG / 0.84,
  elecKwh: 6,
  unabatedCO2PerKg: 9.3,
  captureRate: { 2026: 0.95, 2030: 0.955, 2035: 0.96, 2040: 0.965, 2046: 0.97 } as YearRecord,
  capex: { 2026: 0.45, 2030: 0.42, 2035: 0.39, 2040: 0.32, 2046: 0.28 } as YearRecord,
  ccsFee: { 2026: 0.25, 2030: 0.23, 2035: 0.21, 2040: 0.16, 2046: 0.14 } as YearRecord
};

export const GREEN = {
  otherPerKg: 0.08,
  capexOpex: { 2026: 2.2, 2030: 1.15, 2035: 0.44, 2040: 0.42, 2046: 0.35 } as YearRecord
};

export const PINK = {
  otherPerKg: 0.05,
  capexOpex: { 2026: 1.6, 2030: 0.95, 2035: 0.55, 2040: 0.4, 2046: 0.3 } as YearRecord
};

export const TURQ = {
  ngKwh: 47.5,
  elecKwh: { 2026: 15, 2030: 14, 2035: 13, 2040: 12, 2046: 11 } as YearRecord,
  capexOpex: { 2026: 1.8, 2030: 1.2, 2035: 0.8, 2040: 0.55, 2046: 0.4 } as YearRecord,
  carbonBlackCredit: -0.35
};

export type Electrolyser = "PEM" | "AEL" | "SOE";

export const ELECTROLYSER_EFF: Record<Electrolyser, YearRecord> = {
  PEM: { 2026: 72, 2030: 75, 2035: 78, 2040: 80, 2046: 82 },
  AEL: { 2026: 77, 2030: 78, 2035: 79, 2040: 80, 2046: 82 },
  SOE: { 2026: 74, 2030: 77, 2035: 80, 2040: 83, 2046: 86 }
};

export const ELECTROLYSER_LABEL: Record<Electrolyser, string> = {
  PEM: "PEM",
  AEL: "Alkaline (AEL)",
  SOE: "Solid oxide (SOE)"
};
