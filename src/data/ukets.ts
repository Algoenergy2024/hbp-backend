import { config } from "../config.js";

/**
 * UK ETS has no free, structured public API for auction or secondary-market
 * carbon prices — auction results are published by the UK ETS Authority,
 * and continuous pricing sits behind licensed feeds (ICE's UK ETS auction
 * platform, or vendors like Argus/ICIS/Refinitiv).
 *
 * This connector is intentionally a stub: it only attempts a fetch if
 * UKETS_AUCTION_URL is configured (i.e. your org has a licensed feed to
 * point it at), and returns null otherwise. Without one, carbon price
 * resolution falls through to the most recent manually-recorded ICE
 * auction result instead (see uketsAuctions.ts and POST
 * /api/market/carbon-auction) — real clearing prices, hand-entered from
 * ICE's public bulletins roughly every fortnight, since that's the only
 * free path to genuine market data here. Only if neither a licensed feed
 * nor a manual entry exists does the price fall back to the curated table.
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
