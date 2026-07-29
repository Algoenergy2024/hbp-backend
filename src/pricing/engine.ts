import {
  BLUE,
  CLUSTERS,
  ELECTROLYSER_EFF,
  GREEN,
  GREY,
  HHV_PER_KG,
  PINK,
  TURQ,
  type ClusterId,
  type Electrolyser,
  type Year,
  clusterAdd
} from "./constants.js";

// The engine takes market prices as an explicit input rather than reaching
// into a global — this is the one deliberate change from the dashboard's
// original design, and it's what lets a live Elexon/UK-ETS feed (or the
// curated fallback) sit behind the same formulas without touching them.
export interface MarketPrices {
  gasPrice: number; // £/MWh
  gridElec: number; // £/MWh
  nuclearPPA: number; // £/MWh
  carbonPrice: number; // £/t
}

export interface CostBreakdown {
  total: number;
  [line: string]: number;
}

export function greyCost(market: MarketPrices, year: Year, clusterId: string): CostBreakdown {
  const gas = market.gasPrice * (GREY.ngKwh / 1000);
  const elec = market.gridElec * (GREY.elecKwh / 1000);
  const capex = GREY.capexOpex[year];
  const cluster = clusterAdd(clusterId, year);
  return { gas, elec, capex, cluster, total: gas + elec + capex + cluster };
}

export function greyCarbonExposure(carbonPrice: number): number {
  return (GREY.unabatedCO2PerKg * carbonPrice) / 1000;
}

export function blueCost(market: MarketPrices, year: Year, clusterId: string): CostBreakdown {
  const gas = market.gasPrice * (BLUE.ngKwh / 1000);
  const elec = market.gridElec * (BLUE.elecKwh / 1000);
  const captureRate = BLUE.captureRate[year];
  const residual = BLUE.unabatedCO2PerKg * (1 - captureRate);
  const carbon = (residual * market.carbonPrice) / 1000;
  const capex = BLUE.capex[year];
  const ccsFee = BLUE.ccsFee[year];
  const cluster = clusterAdd(clusterId, year);
  return {
    gas,
    elec,
    carbon,
    capex,
    ccsFee,
    cluster,
    total: gas + elec + carbon + capex + ccsFee + cluster,
    captureRate
  };
}

export function greenCost(
  market: MarketPrices,
  year: Year,
  electrolyser: Electrolyser,
  clusterId: string
): CostBreakdown {
  const effPct = ELECTROLYSER_EFF[electrolyser][year];
  const kwhPerKg = HHV_PER_KG / (effPct / 100);
  const energy = market.gridElec * (kwhPerKg / 1000);
  const capex = GREEN.capexOpex[year];
  const other = GREEN.otherPerKg;
  const cluster = clusterAdd(clusterId, year);
  return { energy, capex, other, cluster, total: energy + capex + other + cluster, kwhPerKg, effPct };
}

export function pinkCost(market: MarketPrices, year: Year, clusterId: string): CostBreakdown {
  const effPct = ELECTROLYSER_EFF.PEM[year];
  const kwhPerKg = HHV_PER_KG / (effPct / 100);
  const energy = market.nuclearPPA * (kwhPerKg / 1000);
  const capex = PINK.capexOpex[year];
  const other = PINK.otherPerKg;
  const cluster = clusterAdd(clusterId, year);
  return { energy, capex, other, cluster, total: energy + capex + other + cluster, kwhPerKg, effPct };
}

export function turquoiseCost(market: MarketPrices, year: Year, clusterId: string): CostBreakdown {
  const gas = market.gasPrice * (TURQ.ngKwh / 1000);
  const elec = market.gridElec * (TURQ.elecKwh[year] / 1000);
  const capex = TURQ.capexOpex[year];
  const credit = TURQ.carbonBlackCredit;
  const cluster = clusterAdd(clusterId, year);
  return { gas, elec, capex, credit, cluster, total: gas + elec + capex + credit + cluster };
}

export type Pathway = "grey" | "blue" | "green" | "pink" | "turquoise";

export function pathwayCost(
  pathway: Pathway,
  market: MarketPrices,
  year: Year,
  clusterId: string,
  electrolyser: Electrolyser = "PEM"
): CostBreakdown {
  switch (pathway) {
    case "grey":
      return greyCost(market, year, clusterId);
    case "blue":
      return blueCost(market, year, clusterId);
    case "green":
      return greenCost(market, year, electrolyser, clusterId);
    case "pink":
      return pinkCost(market, year, clusterId);
    case "turquoise":
      return turquoiseCost(market, year, clusterId);
  }
}

// ---------------- Project costs (user-defined, fully overridable) ----------------

export interface ProjectInput {
  gasPrice: number;
  gasKwh: number;
  elecPrice: number;
  elecKwh: number;
  unabatedCO2: number;
  captureRate: number; // percent, 0-100
  carbonPrice: number;
  priceCarbon: boolean;
  capex: number;
  ccsFee: number;
  credit: number;
  other: number;
  transport: number;
  storage: number;
  refPrice: number;
}

export interface ProjectCosts {
  gasCost: number;
  elecCost: number;
  carbonInPrice: number;
  exposure: number;
  total: number;
  cfdGap: number;
}

export function computeProjectCosts(proj: ProjectInput): ProjectCosts {
  const gasCost = (proj.gasPrice || 0) * ((proj.gasKwh || 0) / 1000);
  const elecCost = (proj.elecPrice || 0) * ((proj.elecKwh || 0) / 1000);
  const residualFrac = Math.max(0, 1 - (proj.captureRate || 0) / 100);
  const fullCarbon = ((proj.unabatedCO2 || 0) * residualFrac * (proj.carbonPrice || 0)) / 1000;
  const carbonInPrice = proj.priceCarbon ? fullCarbon : 0;
  const exposure = proj.priceCarbon ? 0 : fullCarbon;
  const creditVal = -(proj.credit || 0);
  const total =
    gasCost +
    elecCost +
    carbonInPrice +
    (proj.capex || 0) +
    (proj.ccsFee || 0) +
    creditVal +
    (proj.other || 0) +
    (proj.transport || 0) +
    (proj.storage || 0);
  const cfdGap = total - (proj.refPrice || 0);
  return { gasCost, elecCost, carbonInPrice, exposure, total, cfdGap };
}

export function defaultDeliveryFor(clusterId: string, year: Year) {
  const c = CLUSTERS[clusterId as ClusterId] ?? CLUSTERS.ROAD;
  return { transport: c.transportPerKg[year] ?? 0, storage: c.storagePerKg[year] ?? 0 };
}
