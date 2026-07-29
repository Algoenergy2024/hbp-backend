import { describe, expect, it } from "vitest";
import { MARKET_DEFAULTS, YEARS, type Year } from "./constants.js";
import {
  blueCost,
  greenCost,
  greyCost,
  pinkCost,
  turquoiseCost,
  type MarketPrices
} from "./engine.js";

// Reference ex-works totals (gas/electricity/capex/carbon — no delivery-point
// adder) verified independently against the source document's Section 5.2
// LCOH ranges before this backend existed. This test exists to catch
// transcription drift in the TypeScript port, not to re-derive the numbers.
const EXPECTED_EXWORKS: Record<string, Record<Year, number>> = {
  grey: { 2026: 2.181, 2030: 2.15, 2035: 2.207, 2040: 2.31, 2046: 2.361 },
  blue: { 2026: 2.604, 2030: 2.448, 2035: 2.443, 2040: 2.433, 2046: 2.425 },
  green_PEM: { 2026: 7.48, 2030: 4.8, 2035: 3.45, 2040: 2.96, 2046: 2.45 },
  green_AEL: { 2026: 7.14, 2030: 4.66, 2035: 3.41, 2040: 2.96, 2046: 2.45 },
  green_SOE: { 2026: 7.34, 2030: 4.71, 2035: 3.38, 2040: 2.87, 2046: 2.35 },
  pink: { 2026: 4.93, 2030: 3.73, 2035: 2.92, 2040: 2.52, 2046: 2.18 },
  turquoise: { 2026: 4.21, 2030: 3.18, 2035: 2.68, 2040: 2.41, 2046: 2.22 }
};

// Published UK LCOH ranges (ex-works), 2026-2046 — the ground truth every
// pathway/year is checked against, independent of this codebase's own math.
const DOC_RANGES: Record<string, Record<Year, [number, number]>> = {
  grey: { 2026: [1.8, 2.2], 2030: [1.7, 2.3], 2035: [1.6, 2.4], 2040: [1.5, 2.5], 2046: [1.5, 2.6] },
  blue: { 2026: [2.5, 3.5], 2030: [2.2, 3.0], 2035: [2.0, 2.8], 2040: [1.9, 2.7], 2046: [1.8, 2.6] },
  green: { 2026: [5.5, 7.5], 2030: [3.0, 5.0], 2035: [2.2, 3.5], 2040: [1.8, 3.0], 2046: [1.5, 2.5] },
  pink: { 2026: [3.5, 5.0], 2030: [2.5, 4.0], 2035: [2.0, 3.0], 2040: [1.8, 2.8], 2046: [1.6, 2.5] },
  turquoise: { 2026: [3.0, 4.5], 2030: [2.5, 4.0], 2035: [2.0, 3.5], 2040: [1.8, 3.0], 2046: [1.6, 2.8] }
};

function marketFor(year: Year): MarketPrices {
  return {
    gasPrice: MARKET_DEFAULTS.gasAvg[year],
    gridElec: MARKET_DEFAULTS.gridElecAvg[year],
    nuclearPPA: MARKET_DEFAULTS.nuclearPPA[year],
    carbonPrice: MARKET_DEFAULTS.carbon[year]
  };
}

function exWorks(total: number, cluster: number) {
  return total - cluster;
}

describe("pricing engine parity with dashboard calibration", () => {
  for (const year of YEARS) {
    it(`grey ${year} matches reference and sits inside published range`, () => {
      const r = greyCost(marketFor(year), year, "ROAD");
      const ex = exWorks(r.total, r.cluster);
      expect(ex).toBeCloseTo(EXPECTED_EXWORKS.grey[year], 2);
      expect(ex).toBeGreaterThanOrEqual(DOC_RANGES.grey[year][0]);
      expect(ex).toBeLessThanOrEqual(DOC_RANGES.grey[year][1]);
    });

    it(`blue ${year} matches reference and sits inside published range`, () => {
      const r = blueCost(marketFor(year), year, "ROAD");
      const ex = exWorks(r.total, r.cluster);
      expect(ex).toBeCloseTo(EXPECTED_EXWORKS.blue[year], 2);
      expect(ex).toBeGreaterThanOrEqual(DOC_RANGES.blue[year][0]);
      expect(ex).toBeLessThanOrEqual(DOC_RANGES.blue[year][1]);
    });

    for (const tech of ["PEM", "AEL", "SOE"] as const) {
      it(`green (${tech}) ${year} matches reference and sits inside published range`, () => {
        const r = greenCost(marketFor(year), year, tech, "ROAD");
        const ex = exWorks(r.total, r.cluster);
        expect(ex).toBeCloseTo(EXPECTED_EXWORKS[`green_${tech}`][year], 2);
        expect(ex).toBeGreaterThanOrEqual(DOC_RANGES.green[year][0]);
        expect(ex).toBeLessThanOrEqual(DOC_RANGES.green[year][1]);
      });
    }

    it(`pink ${year} matches reference and sits inside published range`, () => {
      const r = pinkCost(marketFor(year), year, "ROAD");
      const ex = exWorks(r.total, r.cluster);
      expect(ex).toBeCloseTo(EXPECTED_EXWORKS.pink[year], 2);
      expect(ex).toBeGreaterThanOrEqual(DOC_RANGES.pink[year][0]);
      expect(ex).toBeLessThanOrEqual(DOC_RANGES.pink[year][1]);
    });

    it(`turquoise ${year} matches reference and sits inside published range`, () => {
      const r = turquoiseCost(marketFor(year), year, "ROAD");
      const ex = exWorks(r.total, r.cluster);
      expect(ex).toBeCloseTo(EXPECTED_EXWORKS.turquoise[year], 2);
      expect(ex).toBeGreaterThanOrEqual(DOC_RANGES.turquoise[year][0]);
      expect(ex).toBeLessThanOrEqual(DOC_RANGES.turquoise[year][1]);
    });
  }

  it("delivery-point adder differs correctly between road and pipeline", () => {
    const r2026Road = greyCost(marketFor(2026), 2026, "ROAD");
    const r2026Pipe = greyCost(marketFor(2026), 2026, "HYNET");
    expect(r2026Road.cluster).toBeCloseTo(2.0, 5);
    expect(r2026Pipe.cluster).toBeCloseTo(0.8, 5);
    expect(r2026Road.total - r2026Pipe.total).toBeCloseTo(1.2, 5);
  });
});
