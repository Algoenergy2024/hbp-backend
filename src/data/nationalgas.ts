import { config } from "../config.js";

// "SAP, hourly actual" — National Gas Transmission's System Average Price,
// the volume-weighted price of gas traded for next-day delivery on the
// On-the-Day Commodity Market (OCM). This is the gas equivalent of what
// Elexon's settlement system prices give us for electricity: a genuine,
// publicly published, system-operator-sourced daily price — not a
// commercial trading feed. No API key required; this is the same public
// CSV download endpoint the data portal's own UI uses.
const SAP_HOURLY_ACTUAL_ID = "PUBOB47";

// Values come back in pence per kWh; the pricing engine works in £/MWh
// throughout, same convention as the Elexon connector.
const P_PER_KWH_TO_GBP_PER_MWH = 10;

interface ParsedRow {
  applicableForDate: Date;
  applicableForStr: string;
  value: number;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// UK-format "DD/MM/YYYY" — deliberately not handed to `new Date(...)`,
// which would misinterpret it as MM/DD/YYYY.
function parseUkDate(dateStr: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dateStr.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function parseSapCsv(csv: string): ParsedRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const applicableForStr = fields[1]?.trim();
    const value = Number(fields[3]);
    if (!applicableForStr || Number.isNaN(value)) continue;
    const applicableForDate = parseUkDate(applicableForStr);
    if (!applicableForDate) continue;
    rows.push({ applicableForDate, applicableForStr, value });
  }
  return rows;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches National Gas Transmission's daily SAP (System Average Price) —
 * the day-ahead gas price equivalent to Elexon's system prices for
 * electricity — and returns the most recently published day's value,
 * converted to £/MWh. Publication lags by roughly a day (the portal
 * generates each day's final figure the following morning), so this looks
 * back a short window rather than assuming "today" has a value yet.
 */
export async function fetchNationalGasDailyPrice(
  now: Date = new Date()
): Promise<{ value: number; observedDate: string } | null> {
  const dateTo = now;
  const dateFrom = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    applicableFor: "N",
    dateFrom: `${isoDate(dateFrom)}T00:00:00`,
    dateTo: `${isoDate(dateTo)}T23:59:59`,
    dateType: "NORMALDAY",
    latestFlag: "Y",
    ids: SAP_HOURLY_ACTUAL_ID,
    type: "CSV"
  });
  const url = `${config.nationalGasBaseUrl}/api/find-gas-data-download?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[nationalgas] fetch failed: HTTP ${res.status}`);
      return null;
    }
    const csv = await res.text();
    const rows = parseSapCsv(csv);
    if (rows.length === 0) return null;

    const latest = rows.reduce((a, b) => (b.applicableForDate > a.applicableForDate ? b : a));
    const gbpPerMwh = Math.round(latest.value * P_PER_KWH_TO_GBP_PER_MWH * 100) / 100;
    return { value: gbpPerMwh, observedDate: isoDate(latest.applicableForDate) };
  } catch (err) {
    console.warn("[nationalgas] fetch failed:", (err as Error).message);
    return null;
  }
}

// Exported for testing the parser/date-handling in isolation from the
// network call.
export const _internal = { parseCsvLine, parseUkDate, parseSapCsv };
