import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { runAgent } from "./agent.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/agent", async (req, res) => {
  const { mode, userIntent, currentCode, lastPlan } = req.body || {};

  if (!userIntent || typeof userIntent !== "string") {
    res.status(400).json({ error: "userIntent is required." });
    return;
  }

  const result = await runAgent({ mode, userIntent, currentCode, lastPlan });

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result);
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
