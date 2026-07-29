import { config } from "../config.js";

/**
 * UK ETS has no free, structured public API for auction or secondary-market
 * carbon prices at the time of writing — auction results are published by
 * the UK ETS Authority, and continuous pricing sits behind licensed feeds
 * (ICE's UK ETS auction platform, or vendors like Argus/ICIS/Refinitiv).
 *
 * This connector is intentionally a stub: it only attempts a fetch if
 * UKETS_AUCTION_URL is configured (i.e. your org has a licensed feed to
 * point it at), and returns null otherwise so the market-data service falls
 * back to the curated carbon-price table. This is a deliberate design
 * choice, not a placeholder to "finish later" — see the briefing doc,
 * Section 7, for why this series stays curated rather than faking a
 * live connection.
 */
export async function fetchUkEtsCarbonPrice(): Promise<{ value: number; observedDate: string } | null> {
  if (!config.ukEtsAuctionUrl) return null;

  try {
    const res = await fetch(config.ukEtsAuctionUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { price?: number; date?: string };
    if (typeof body.price !== "number") {
      console.warn("[ukets] configured feed did not return a numeric price — check UKETS_AUCTION_URL response shape");
      return null;
    }
    return { value: body.price, observedDate: body.date ?? new Date().toISOString().slice(0, 10) };
  } catch (err) {
    console.warn("[ukets] fetch failed:", (err as Error).message);
    return null;
  }
}
