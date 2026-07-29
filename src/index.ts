import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { startMarketDataScheduler } from "./data/scheduler.js";
import { loadActiveAssumptions, seedAssumptionsIfEmpty } from "./pricing/assumptionsStore.js";
import assumptionsRoutes from "./routes/assumptions.js";
import authRoutes from "./routes/auth.js";
import marketRoutes from "./routes/market.js";
import pathwaysRoutes from "./routes/pathways.js";
import projectsRoutes from "./routes/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (dev, via tsx) and dist/ (prod, after tsc) — both
// sit one directory below the repo root, where public/ lives.
const publicDir = path.join(__dirname, "..", "public");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/pathways", pathwaysRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/assumptions", assumptionsRoutes);

app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  const seeded = await seedAssumptionsIfEmpty();
  if (seeded > 0) console.log(`[assumptions] seeded ${seeded} rows from dashboard calibration defaults`);
  await loadActiveAssumptions();

  app.listen(config.port, () => {
    console.log(`HBP backend listening on :${config.port} (${config.nodeEnv})`);
    startMarketDataScheduler();
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
