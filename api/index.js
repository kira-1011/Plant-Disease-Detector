// api/index.js
import express from "express";
import analyzeRouter from "./analyze.js";

const app = express();

// Optional: basic health check
app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ ok: true });
});

// Mount router in BOTH places so it works with your rewrite:
// - if request path is /api/analyze
// - if request path is /analyze (depending on rewrite behavior)
app.use("/", analyzeRouter);
app.use("/api", analyzeRouter);

export default app;

