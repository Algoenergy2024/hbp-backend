import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { startMarketDataScheduler } from "./data/scheduler.js";
import authRoutes from "./routes/auth.js";
import marketRoutes from "./routes/market.js";
import pathwaysRoutes from "./routes/pathways.js";
import projectsRoutes from "./routes/projects.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/pathways", pathwaysRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/projects", projectsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`HBP backend listening on :${config.port} (${config.nodeEnv})`);
  startMarketDataScheduler();
});
