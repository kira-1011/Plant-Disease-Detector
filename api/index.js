import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const config = {
  api: {
    bodyParser: false, // required for multer
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const analysisSchema = z.object({
  disease: z.string(),
  symptoms: z.string(),
  treatment: z.string(),
  prevention: z.string(),
  confidence: z.enum(['High', 'Medium', 'Low']),
});

function buildPrompt() {
  return `
You are an expert botanist and plant pathologist.
Analyze the uploaded image and return ONLY valid JSON.
`.trim();
}

export default function handler(req, res) {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) throw err;

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const imagePart = {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype,
        },
      };

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildPrompt() }, imagePart] }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: zodToJsonSchema(analysisSchema),
        },
      });

      const structured = analysisSchema.parse(JSON.parse(response.text));

      res.status(200).json({ success: true, structured });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Analysis failed', details: error.message });
    }
  });
}
