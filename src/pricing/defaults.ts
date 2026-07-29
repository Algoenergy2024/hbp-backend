import { BLUE, GREEN, GREY, HHV_PER_KG, PINK, TURQ, type Electrolyser, type Year } from "./constants.js";
import { assumptions } from "./assumptionsStore.js";
import { computeProjectCosts, defaultDeliveryFor, type ProjectInput } from "./engine.js";
import type { MarketPrices } from "./engine.js";
import type { Pathway } from "./engine.js";

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Builds a new project's starting field values from the canonical pricing
 * tables and resolved (live-or-curated) market prices for the given year —
 * the server-side port of the dashboard's defaultProjectFor().
 */
export function defaultProjectFor(
  pathway: Pathway,
  year: Year,
  electrolyser: Electrolyser,
  clusterId: string,
  market: MarketPrices
): ProjectInput & { pathway: Pathway; electrolyser: Electrolyser; clusterId: string } {
  const delivery = defaultDeliveryFor(clusterId, year);
  const base: ProjectInput & { pathway: Pathway; electrolyser: Electrolyser; clusterId: string } = {
    pathway,
    electrolyser,
    clusterId,
    gasPrice: 0,
    gasKwh: 0,
    elecPrice: 0,
    elecKwh: 0,
    unabatedCO2: 0,
    captureRate: 0,
    carbonPrice: 0,
    priceCarbon: false,
    capex: 0,
    ccsFee: 0,
    credit: 0,
    other: 0,
    transport: delivery.transport,
    storage: delivery.storage,
    refPrice: 0
  };

  if (pathway === "grey") {
    base.gasPrice = market.gasPrice;
    base.gasKwh = round2(GREY.ngKwh);
    base.elecPrice = market.gridElec;
    base.elecKwh = GREY.elecKwh;
    base.unabatedCO2 = GREY.unabatedCO2PerKg;
    base.carbonPrice = market.carbonPrice;
    base.priceCarbon = false;
    base.capex = assumptions.greyCapexOpex(year);
  } else if (pathway === "blue") {
    base.gasPrice = market.gasPrice;
    base.gasKwh = round2(BLUE.ngKwh);
    base.elecPrice = market.gridElec;
    base.elecKwh = BLUE.elecKwh;
    base.unabatedCO2 = BLUE.unabatedCO2PerKg;
    base.captureRate = round2(assumptions.blueCaptureRate(year) * 100);
    base.carbonPrice = market.carbonPrice;
    base.priceCarbon = true;
    base.capex = assumptions.blueCapex(year);
    base.ccsFee = assumptions.blueCcsFee(year);
  } else if (pathway === "green") {
    const eff = assumptions.electrolyserEfficiency(electrolyser, year);
    base.elecPrice = market.gridElec;
    base.elecKwh = round2(HHV_PER_KG / (eff / 100));
    base.capex = assumptions.greenCapexOpex(year);
    base.other = GREEN.otherPerKg;
  } else if (pathway === "pink") {
    const eff = assumptions.electrolyserEfficiency("PEM", year);
    base.elecPrice = market.nuclearPPA;
    base.elecKwh = round2(HHV_PER_KG / (eff / 100));
    base.capex = assumptions.pinkCapexOpex(year);
    base.other = PINK.otherPerKg;
  } else if (pathway === "turquoise") {
    base.gasPrice = market.gasPrice;
    base.gasKwh = TURQ.ngKwh;
    base.elecPrice = market.gridElec;
    base.elecKwh = assumptions.turqElecKwh(year);
    base.capex = assumptions.turqCapexOpex(year);
    base.credit = Math.abs(TURQ.carbonBlackCredit);
  }

  base.refPrice = round2(computeProjectCosts(base).total);
  return base;
}
