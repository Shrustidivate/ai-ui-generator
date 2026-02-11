import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});