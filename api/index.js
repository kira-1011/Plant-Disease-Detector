import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import analyzeRouter from "./analyze.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.static(join(__dirname, "..")));

app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api", analyzeRouter);

app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "..", "index.html"));
});

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌱 Server running at http://localhost:${PORT}`);
  });
}

export default app;
