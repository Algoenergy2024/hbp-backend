import {
  BLUE,
  GREEN,
  GREY,
  HHV_PER_KG,
  PINK,
  TURQ,
  type Electrolyser,
  type Year
} from "./constants.js";
import { assumptions } from "./assumptionsStore.js";

// Delivery-point adder now reads through the assumptions store (DB-backed,
// falling back to the constants.ts defaults) rather than indexing CLUSTERS
// directly, so an audited change to a logistics adder applies here too.
function clusterAdd(clusterId: string, year: Year): number {
  return assumptions.deliveryTransport(clusterId, year) + assumptions.deliveryStorage(clusterId, year);
}

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

// Optional override for the pathway's primary capex/O&M figure, used by the
// sensitivity endpoint to sweep capex without duplicating any pricing
// formula in the browser — every sweep is still computed here, just with
// one resolved value swapped for a caller-supplied one.
export interface CostOverrides {
  capex?: number;
}

export function greyCost(market: MarketPrices, year: Year, clusterId: string, overrides?: CostOverrides): CostBreakdown {
  const gas = market.gasPrice * (GREY.ngKwh / 1000);
  const elec = market.gridElec * (GREY.elecKwh / 1000);
  const capex = overrides?.capex ?? assumptions.greyCapexOpex(year);
  const cluster = clusterAdd(clusterId, year);
  return { gas, elec, capex, cluster, total: gas + elec + capex + cluster };
}

export function greyCarbonExposure(carbonPrice: number): number {
  return (GREY.unabatedCO2PerKg * carbonPrice) / 1000;
}

export function blueCost(market: MarketPrices, year: Year, clusterId: string, overrides?: CostOverrides): CostBreakdown {
  const gas = market.gasPrice * (BLUE.ngKwh / 1000);
  const elec = market.gridElec * (BLUE.elecKwh / 1000);
  const captureRate = assumptions.blueCaptureRate(year);
  const residual = BLUE.unabatedCO2PerKg * (1 - captureRate);
  const carbon = (residual * market.carbonPrice) / 1000;
  const capex = overrides?.capex ?? assumptions.blueCapex(year);
  const ccsFee = assumptions.blueCcsFee(year);
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
  clusterId: string,
  overrides?: CostOverrides
): CostBreakdown {
  const effPct = assumptions.electrolyserEfficiency(electrolyser, year);
  const kwhPerKg = HHV_PER_KG / (effPct / 100);
  const energy = market.gridElec * (kwhPerKg / 1000);
  const capex = overrides?.capex ?? assumptions.greenCapexOpex(year);
  const other = GREEN.otherPerKg;
  const cluster = clusterAdd(clusterId, year);
  return { energy, capex, other, cluster, total: energy + capex + other + cluster, kwhPerKg, effPct };
}

export function pinkCost(market: MarketPrices, year: Year, clusterId: string, overrides?: CostOverrides): CostBreakdown {
  const effPct = assumptions.electrolyserEfficiency("PEM", year);
  const kwhPerKg = HHV_PER_KG / (effPct / 100);
  const energy = market.nuclearPPA * (kwhPerKg / 1000);
  const capex = overrides?.capex ?? assumptions.pinkCapexOpex(year);
  const other = PINK.otherPerKg;
  const cluster = clusterAdd(clusterId, year);
  return { energy, capex, other, cluster, total: energy + capex + other + cluster, kwhPerKg, effPct };
}

export function turquoiseCost(market: MarketPrices, year: Year, clusterId: string, overrides?: CostOverrides): CostBreakdown {
  const gas = market.gasPrice * (TURQ.ngKwh / 1000);
  const elec = market.gridElec * (assumptions.turqElecKwh(year) / 1000);
  const capex = overrides?.capex ?? assumptions.turqCapexOpex(year);
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
  electrolyser: Electrolyser = "PEM",
  overrides?: CostOverrides
): CostBreakdown {
  switch (pathway) {
    case "grey":
      return greyCost(market, year, clusterId, overrides);
    case "blue":
      return blueCost(market, year, clusterId, overrides);
    case "green":
      return greenCost(market, year, electrolyser, clusterId, overrides);
    case "pink":
      return pinkCost(market, year, clusterId, overrides);
    case "turquoise":
      return turquoiseCost(market, year, clusterId, overrides);
  }
}

/** The resolved capex/O&M figure the sensitivity endpoint sweeps around for a given pathway/year. */
export function baseCapexFor(pathway: Pathway, year: Year, electrolyser: Electrolyser = "PEM"): number {
  switch (pathway) {
    case "grey":
      return assumptions.greyCapexOpex(year);
    case "blue":
      return assumptions.blueCapex(year);
    case "green":
      return assumptions.greenCapexOpex(year);
    case "pink":
      return assumptions.pinkCapexOpex(year);
    case "turquoise":
      return assumptions.turqCapexOpex(year);
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
  return { transport: assumptions.deliveryTransport(clusterId, year), storage: assumptions.deliveryStorage(clusterId, year) };
}
