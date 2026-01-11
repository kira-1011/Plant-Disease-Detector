import express from "express";
import analyzeRouter from "./analyze.js";

const app = express();

app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api", analyzeRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌱 Server running at http://localhost:${PORT}`);
});

export default app;
