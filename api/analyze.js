import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const analysisSchema = z.object({
  disease: z.string(),
  symptoms: z.string(),
  treatment: z.string(),
  prevention: z.string(),
  confidence: z.enum(["High", "Medium", "Low"]),
});

function buildPrompt() {
  return `
You are an expert botanist and plant pathologist.

Analyze the uploaded image and produce a response that conforms EXACTLY to the provided JSON schema.
Return ONLY valid JSON. No markdown, no extra text.

Decision rules:
- If the image is not a plant leaf OR is too unclear to assess (blurry, dark, far away, obstructed):
  - Set disease = "Unclear"
  - symptoms = "Unable to analyze - please upload a clear image of a single plant leaf (sharp focus, good lighting, close-up)."
  - treatment = "N/A"
  - prevention = "N/A"
  - confidence = "Low"
- If no abnormal patterns are clearly visible:
  - Set disease = "Healthy"
  - confidence:
    - High = clear image + classic visual pattern
    - Medium = some evidence but could be multiple causes
    - Low = unclear image or many plausible causes
- Otherwise:
  - Prefer common diagnostic categories (leaf spot, powdery mildew, rust, blight, nutrient deficiency, pest damage, environmental stress).
  - Only name a specific disease when strongly supported by visible evidence.

Content guidelines:
- symptoms: describe only visible signs (color/shape/distribution).
- treatment & prevention: provide safe, practical, generally applicable steps.
- confidence: High (clear + classic), Medium (some evidence), Low (unclear or many plausible causes).

Do not guess plant species unless visually obvious. Do not imply lab confirmation.
`.trim();
}

router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    if (!req.file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ error: "File must be an image" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: buildPrompt() }, imagePart] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(analysisSchema),
      },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      return res.status(500).json({
        error: "Gemini returned invalid JSON",
        raw: response.text,
      });
    }

    const validated = analysisSchema.parse(parsed);

    return res.status(200).json({
      success: true,
      structured: validated,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Analysis failed",
      details: error?.message || String(error),
    });
  }
});

export default router;
