import { describe, expect, it } from "vitest";
import { _internal } from "./uketsAuctions.js";

const { HISTORICAL_AUCTIONS } = _internal;

describe("UK ETS historical auction data", () => {
  it("has no duplicate auction dates", () => {
    const dates = HISTORICAL_AUCTIONS.map(a => a.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("is sorted chronologically", () => {
    const dates = HISTORICAL_AUCTIONS.map(a => a.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("every row has a valid ISO date and a positive price", () => {
    for (const row of HISTORICAL_AUCTIONS) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.price).toBeGreaterThan(0);
    }
  });
});
