import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * 🔴 Required for Multer to work on Vercel serverless
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

// Multer setup for serverless (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Zod schema for AI response
const analysisSchema = z.object({
  disease: z.string(),
  symptoms: z.string(),
  treatment: z.string(),
  prevention: z.string(),
  confidence: z.enum(['High', 'Medium', 'Low']),
});

// Build AI prompt
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

// Wrap Multer in a Promise for async/await
const multerPromise = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

// Main API handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle file upload
    await multerPromise(req, res);

    // Check environment variable
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    // Validate uploaded file
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'File must be an image' });
    }

    // Initialize Gemini AI
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Prepare image data
    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    // Call Gemini AI
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt() }, imagePart],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: zodToJsonSchema(analysisSchema),
      },
    });

    // Parse and validate JSON
    let parsed;
    try {
      parsed = JSON.parse(response.text);
    } catch (err) {
      console.error('Invalid JSON from Gemini:', response.text);
      return res.status(500).json({
        error: 'Gemini returned invalid JSON',
        raw: response.text,
      });
    }

    const validated = analysisSchema.parse(parsed);

    // Return successful response
    return res.status(200).json({
      success: true,
      structured: validated,
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      details: error.message,
    });
  }
}
