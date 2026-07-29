import cron from "node-cron";
import { config } from "../config.js";
import { refreshLiveMarketData } from "./marketData.js";

export function startMarketDataScheduler(): void {
  if (!cron.validate(config.marketRefreshCron)) {
    console.warn(`[scheduler] invalid MARKET_REFRESH_CRON "${config.marketRefreshCron}" — live data refresh disabled`);
    return;
  }

  console.log(`[scheduler] live market data will refresh on schedule: ${config.marketRefreshCron}`);
  cron.schedule(config.marketRefreshCron, () => {
    refreshLiveMarketData().catch(err => console.error("[scheduler] refresh failed:", err));
  });

  // Kick off an initial fetch on boot so the API has live data immediately
  // rather than waiting for the first scheduled tick.
  refreshLiveMarketData().catch(err => console.error("[scheduler] initial refresh failed:", err));
}
