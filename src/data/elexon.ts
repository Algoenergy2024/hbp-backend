import { config } from "../config.js";

interface ElexonSystemPricePeriod {
  settlementDate: string;
  settlementPeriod: number;
  systemSellPrice: number;
  systemBuyPrice: number;
}

interface ElexonSystemPriceResponse {
  data: ElexonSystemPricePeriod[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches GB settlement (imbalance) system prices for a given date from the
 * Elexon Insights Solution API (the modern, public successor to BMRS) and
 * returns the day's average system sell price in £/MWh — used as the live
 * proxy for "grid electricity price" in the pricing engine.
 *
 * Settlement data is finalised roughly a day after the fact, so this tries
 * today first and falls back to yesterday if today has no periods yet.
 */
export async function fetchElexonDailyAveragePrice(
  date: Date = new Date()
): Promise<{ value: number; observedDate: string } | null> {
  for (const d of [date, new Date(date.getTime() - 24 * 60 * 60 * 1000)]) {
    const dateStr = isoDate(d);
    const url = `${config.elexonBaseUrl}/balancing/settlement/system-prices/${dateStr}?format=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const body = (await res.json()) as ElexonSystemPriceResponse;
      const periods = body.data ?? [];
      if (periods.length === 0) continue;
      const avg = periods.reduce((sum, p) => sum + p.systemSellPrice, 0) / periods.length;
      return { value: Math.round(avg * 100) / 100, observedDate: dateStr };
    } catch (err) {
      console.warn(`[elexon] fetch failed for ${dateStr}:`, (err as Error).message);
    }
  }
  return null;
}
