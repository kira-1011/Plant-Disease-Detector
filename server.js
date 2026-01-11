require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const app = express();
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json());

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'plant.html'));
});
const analysisSchema = z.object({
  disease: z
    .string()
    .describe('Name of the disease, or "Healthy", or "Unclear".'),
  symptoms: z
    .string()
    .describe('Visible symptoms (can include bullet-like text).'),
  treatment: z.string().describe('Practical treatment steps.'),
  prevention: z.string().describe('Prevention tips.'),
  confidence: z.enum(['High', 'Medium', 'Low']).describe('Confidence level.'),
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
    -  High = clear image + classic visual pattern
    - Medium = some evidence but could be multiple causes
    - Low = unclear image or many plausible causes
- Otherwise:
  - Prefer common diagnostic categories (e.g., leaf spot, powdery mildew, rust, blight, nutrient deficiency, pest damage, environmental stress).
  - Only name a specific disease when strongly supported by visible evidence.

Content guidelines:
- symptoms: describe only visible signs (color/shape/distribution).
- treatment & prevention: provide safe, practical, generally applicable steps. If mentioning products, keep it generic and advise following label instructions.
- confidence: High (clear + classic), Medium (some evidence), Low (unclear or many plausible causes).

Do not guess plant species unless visually obvious. Do not imply lab confirmation.
`.trim();
}

app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'File must be an image' });
    }

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };
    const response = await ai.models.generateContent({
     model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: buildPrompt() }, imagePart] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: zodToJsonSchema(analysisSchema),
      },
    });

    const structured = JSON.parse(response.text);
    const validated = analysisSchema.parse(structured);

    res.json({
      success: true,
      analysis: JSON.stringify(validated, null, 2), // keep "analysis" field if your UI expects it
      structured: validated,
    });
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      details: error.message,
    });
  }
});

app.get('/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📸 Test endpoint: http://localhost:${PORT}/test`);
});

