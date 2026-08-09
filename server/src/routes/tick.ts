import { Router } from "express";
import { runTick } from "../agent/tick";

export const tickRouter = Router();

tickRouter.post("/", async (_req, res) => {
  try {
    await runTick();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
