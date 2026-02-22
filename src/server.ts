/**
 * SalitAI.orbit Backend
 * File: server.ts
 * Version: 2.5.1
 * Purpose: Gemini Audio Transcription (STT) + Gemini Minutes + Contact Email API
 * Notes:
 * - Render-ready: uses process.env
 * - CORS: allows localhost + ALLOWED_ORIGINS (comma-separated) for Vercel
 * - Binds to 0.0.0.0 for hosting platforms
 * - Free-tier friendly: auto-picks an available model that supports generateContent
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

/* ============================= */
/* ENV                           */
/* ============================= */

const PORT = Number(process.env.PORT ?? 8082);

// Gemini
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY ?? "").trim();

// Optional preferred model names (may be unavailable on free tier => auto fallback)
const GEMINI_MODEL_STT = String(process.env.GEMINI_MODEL_STT ?? "").trim();
const GEMINI_MODEL_MINUTES = String(
  process.env.GEMINI_MODEL_MINUTES ?? "",
).trim();

// CORS
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Email
const SMTP_SERVICE = String(process.env.SMTP_SERVICE ?? "gmail").trim();
const SMTP_USER = String(process.env.SMTP_USER ?? "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS ?? "").trim();
const CONTACT_TO_EMAIL = String(process.env.CONTACT_TO_EMAIL ?? "").trim();

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

/* ============================= */
/* APP INIT                      */
/* ============================= */

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl / Postman
      if (!origin) return cb(null, true);

      // allow localhost dev
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);

      // IMPORTANT: allowed origins must be exact, no trailing slash
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: false,
  }),
);

app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/* ============================= */
/* GEMINI MODEL HELPERS          */
/* ============================= */

type GeminiModelInfo = {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

async function list_models(api_key: string): Promise<GeminiModelInfo[]> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`,
  );

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ListModels failed (${r.status}): ${txt || r.statusText}`);
  }

  const json: any = await r.json().catch(() => ({}));
  const models: any[] = Array.isArray(json?.models) ? json.models : [];
  return models as GeminiModelInfo[];
}

function supports_generate_content(m: GeminiModelInfo): boolean {
  return (
    Array.isArray(m?.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes("generateContent")
  );
}

function normalize_model_name(name: string): string {
  // API may return "models/xxx"
  return String(name)
    .replace(/^models\//, "")
    .trim();
}

function pick_first_generate_content_model(models: GeminiModelInfo[]): string {
  const candidate = models.find((m) => supports_generate_content(m) && m?.name);
  if (!candidate?.name) {
    throw new Error(
      "No available Gemini model supports generateContent for this API key.",
    );
  }
  return normalize_model_name(candidate.name);
}

/**
 * Pick a working model:
 * - If preferred is provided, try it
 * - Otherwise fallback to first model that supports generateContent
 */
async function resolve_model_name(
  preferred: string | undefined,
): Promise<string> {
  const models = await list_models(GEMINI_API_KEY);

  if (preferred) {
    const preferred_norm = normalize_model_name(preferred);
    const found = models.find(
      (m) => normalize_model_name(m?.name ?? "") === preferred_norm,
    );
    if (found && supports_generate_content(found)) {
      return preferred_norm;
    }
  }

  return pick_first_generate_content_model(models);
}

/* ============================= */
/* HEALTH                        */
/* ============================= */

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: 200, message: "ok" });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: 200, message: "ok" });
});

/* ============================= */
/* DEBUG: LIST AVAILABLE MODELS  */
/* ============================= */

app.get("/api/models", async (_req: Request, res: Response) => {
  try {
    const models = await list_models(GEMINI_API_KEY);
    res.json(
      models.map((m) => ({
        name: m.name,
        displayName: m.displayName,
        supportedGenerationMethods: m.supportedGenerationMethods,
      })),
    );
  } catch (err: any) {
    console.error("LIST MODELS ERROR:", err);
    res.status(500).json({ error: err?.message ?? "Failed to list models" });
  }
});

/* ============================= */
/* CONTACT EMAIL                 */
/* ============================= */

const mailer =
  SMTP_USER && SMTP_PASS && CONTACT_TO_EMAIL
    ? nodemailer.createTransport({
        service: SMTP_SERVICE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

app.post("/api/contact", async (req: Request, res: Response) => {
  try {
    if (!mailer) {
      return res.status(500).json({ message: "Email not configured" });
    }

    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const message = String(req.body?.message ?? "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Missing fields" });
    }

    await mailer.sendMail({
      from: `"SalitAI Contact" <${SMTP_USER}>`,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `New Message from ${name}`,
      text: message,
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("CONTACT ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "Contact failed" });
  }
});

/* ============================= */
/* GEMINI AUDIO -> TEXT (STT)     */
/* ============================= */

app.post(
  "/api/stt",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "No audio uploaded. Field name must be 'audio'.",
        });
      }

      const audioBase64 = req.file.buffer.toString("base64");
      const mimeType = String(req.file.mimetype || "application/octet-stream");

      const model_name = await resolve_model_name(
        GEMINI_MODEL_STT || undefined,
      );
      const model = genAI.getGenerativeModel({ model: model_name });

      const result = await model.generateContent([
        {
          inlineData: {
            data: audioBase64,
            mimeType,
          },
        },
        {
          text: "Transcribe this audio accurately. Output plain text only. Do not add timestamps unless spoken.",
        },
      ]);

      const text = result.response.text().trim();

      return res.json({
        text,
        meta: {
          mimeType,
          model: model_name,
        },
      });
    } catch (err: any) {
      console.error("GEMINI STT ERROR:", err);
      return res.status(500).json({
        error: err?.message ?? "STT failed",
        hint: "Try shorter audio clips if the file is large. Also check /api/models for available models.",
      });
    }
  },
);

/* ============================= */
/* GEMINI MINUTES                */
/* ============================= */

app.post("/api/minutes", async (req: Request, res: Response) => {
  try {
    const transcript = String(req.body?.transcript ?? "").trim();
    const document_type = String(
      req.body?.document_type ?? "Executive Meeting Minutes",
    ).trim();
    const response_style = String(req.body?.response_style ?? "").trim();
    const directives = String(req.body?.directives ?? "").trim();

    if (!transcript) {
      return res.status(400).json({ message: "Transcript required" });
    }

    const model_name = await resolve_model_name(
      GEMINI_MODEL_MINUTES || undefined,
    );
    const model = genAI.getGenerativeModel({ model: model_name });

    const prompt = `
You are a professional meeting secretary.
Convert the transcript into high-quality "${document_type}" in Markdown.

Rules:
- Do NOT invent facts. If missing, write "Not specified".
- Prefer concise bullets.
- Use clear headings.
- Output Markdown only.
${response_style ? `- Style: ${response_style}` : ""}
${directives ? `- Special directives: ${directives}` : ""}

Structure:
# Title
## Date
## Attendees
## Agenda
## Key Discussion Points
## Decisions
## Action Items (Markdown table: Action | Owner | Due Date | Notes)
## Risks / Blockers
## Next Meeting
## Summary (3–6 bullets)

TRANSCRIPT:
${transcript}
`.trim();

    const result = await model.generateContent(prompt);
    const minutes = result.response.text();

    return res.json({
      minutes,
      meta: { model: model_name },
    });
  } catch (err: any) {
    console.error("GEMINI MINUTES ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "Minutes failed" });
  }
});

/* ============================= */
/* START                         */
/* ============================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
