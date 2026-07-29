import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  // Off by default for local Postgres / Docker Compose's internal network,
  // neither of which run with SSL enabled. Hosted providers over a public
  // endpoint often need this on — see README's deployment section.
  databaseSsl: (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiry: process.env.JWT_EXPIRY ?? "7d",
  elexonBaseUrl: process.env.ELEXON_BMRS_BASE_URL ?? "https://data.elexon.co.uk/bmrs/api/v1",
  ukEtsAuctionUrl: process.env.UKETS_AUCTION_URL ?? "",
  marketRefreshCron: process.env.MARKET_REFRESH_CRON ?? "*/30 * * * *"
};
