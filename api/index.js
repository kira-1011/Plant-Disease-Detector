import express from "express";
import cors from "cors";
import analyzeRouter from "./analyze.js";

const app = express();

app.use(cors());

app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api", analyzeRouter);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌱 Server running at http://localhost:${PORT}`);
  });
}

export default app;
