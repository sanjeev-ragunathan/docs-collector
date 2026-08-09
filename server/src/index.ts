import "./db"; // ensure schema is created on boot
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { config } from "./lib/config";
import { employeesRouter } from "./routes/employees";
import { tickRouter } from "./routes/tick";
import { runTick } from "./agent/tick";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/employees", employeesRouter);
app.use("/tick", tickRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

cron.schedule(config.pollCron, () => {
  runTick().catch((err) => console.error("Cron tick failed:", err));
});
console.log(`Agent cron scheduled: "${config.pollCron}"`);
