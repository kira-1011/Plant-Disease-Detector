import express from "express";
import cors from "cors";
import analyzeRouter from "./analyze.js";

const app = express();

// Enable CORS for all routes
app.use(cors());

// Health check endpoints
app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ ok: true });
});

// Mount the analyze router
app.use("/api", analyzeRouter);

// Only listen when running locally (not on Vercel)
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌱 Server running at http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
export default app;