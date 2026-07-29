import { describe, expect, it } from "vitest";
import { _internal } from "./nationalgas.js";

const { parseCsvLine, parseUkDate, parseSapCsv } = _internal;

describe("nationalgas CSV parsing", () => {
  it("splits a CSV line while respecting a quoted field containing a comma", () => {
    const fields = parseCsvLine('28/07/2026 23:03:07,28/07/2026,"SAP, hourly actual",4.6749,29/07/2026 09:45:05,');
    expect(fields).toEqual([
      "28/07/2026 23:03:07",
      "28/07/2026",
      "SAP, hourly actual",
      "4.6749",
      "29/07/2026 09:45:05",
      ""
    ]);
  });

  it("parses UK-format DD/MM/YYYY dates, not US MM/DD/YYYY", () => {
    // 13th of the month can only be a day, not a month — a real MM/DD/YYYY
    // misparse would silently produce an invalid or wrong date here.
    const d = parseUkDate("13/07/2026");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(6); // 0-indexed: July
    expect(d!.getUTCDate()).toBe(13);
  });

  it("returns null for an unparseable date", () => {
    expect(parseUkDate("not-a-date")).toBeNull();
  });

  it("parses a realistic multi-row SAP CSV response and finds the most recent row", () => {
    const csv = [
      "Applicable At,Applicable For,Data Item,Value,Generated Time,Quality Indicator",
      '28/07/2026 23:03:07,28/07/2026,"SAP, hourly actual",4.6749,29/07/2026 09:45:05,',
      '27/07/2026 23:01:22,27/07/2026,"SAP, hourly actual",4.8678,28/07/2026 09:45:04,',
      '26/07/2026 23:01:42,26/07/2026,"SAP, hourly actual",4.9325,27/07/2026 09:45:05,'
    ].join("\n");

    const rows = parseSapCsv(csv);
    expect(rows).toHaveLength(3);
    const latest = rows.reduce((a, b) => (b.applicableForDate > a.applicableForDate ? b : a));
    expect(latest.applicableForStr).toBe("28/07/2026");
    expect(latest.value).toBeCloseTo(4.6749, 4);
  });

  it("skips malformed rows instead of throwing", () => {
    const csv = [
      "Applicable At,Applicable For,Data Item,Value,Generated Time,Quality Indicator",
      '28/07/2026 23:03:07,28/07/2026,"SAP, hourly actual",4.6749,29/07/2026 09:45:05,',
      "garbage,not-a-date,broken,NaN,,"
    ].join("\n");

    const rows = parseSapCsv(csv);
    expect(rows).toHaveLength(1);
  });
});
