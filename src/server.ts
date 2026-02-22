/**
 * SalitAI.orbit Backend
 * File: server.ts
 * Version: 2.1.0
 * Purpose: ElevenLabs STT + Gemini Minutes + Contact Email API (Gmail App Password).
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "../.env" });

/* ============================= */
/* ENV                           */
/* ============================= */

const PORT = Number(process.env.PORT ?? 8082);

const ELEVENLABS_API_KEY = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY ?? "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL ?? "auto").trim();

const SMTP_SERVICE = String(process.env.SMTP_SERVICE ?? "gmail").trim();
const SMTP_USER = String(process.env.SMTP_USER ?? "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS ?? "").trim();
const CONTACT_TO_EMAIL = String(process.env.CONTACT_TO_EMAIL ?? "").trim();

if (!ELEVENLABS_API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY in root .env");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in root .env");
  process.exit(1);
}

/* ============================= */
/* APP INIT                      */
/* ============================= */

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
  }),
);

app.use(express.json({ limit: "10mb" }));

const upload = multer({ storage: multer.memoryStorage() });

/* ============================= */
/* HEALTH                        */
/* ============================= */

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: 200, message: "ok" }),
);
app.get("/api/health", (_req: Request, res: Response) =>
  res.json({ status: 200, message: "ok" }),
);

/* ============================= */
/* EMAIL TRANSPORTER             */
/* ============================= */

function create_mailer() {
  if (!SMTP_USER || !SMTP_PASS || !CONTACT_TO_EMAIL) {
    return null;
  }

  // Using "service: gmail" avoids TS typing issues and is simpler.
  return nodemailer.createTransport({
    service: SMTP_SERVICE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

const mailer = create_mailer();

/* ============================= */
/* CONTACT ROUTE                 */
/* ============================= */

app.post("/api/contact", async (req: Request, res: Response) => {
  try {
    if (!mailer) {
      return res.status(500).json({
        message:
          "Email is not configured. Please set SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL in ROOT .env.",
      });
    }

    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const message = String(req.body?.message ?? "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await mailer.sendMail({
      from: `"SalitAI.orbit Contact" <${SMTP_USER}>`,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `New Contact Message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n`,
      html: `
        <h2>New Contact Submission</h2>
        <p><strong>Name:</strong> ${escape_html(name)}</p>
        <p><strong>Email:</strong> ${escape_html(email)}</p>
        <p>${escape_html(message).replace(/\n/g, "<br/>")}</p>
      `,
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("EMAIL ERROR:", e);
    return res.status(500).json({ message: e?.message ?? "Email failed" });
  }
});

function escape_html(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ============================= */
/* ELEVENLABS STT                */
/* ============================= */

app.post(
  "/api/stt",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          message: "No audio file uploaded. Field name must be 'audio'.",
        });
      }

      const form = new FormData();
      const mime = file.mimetype || "application/octet-stream";
      const bytes = new Uint8Array(file.buffer);

      form.append(
        "file",
        new Blob([bytes], { type: mime }),
        file.originalname || "audio",
      );
      form.append("model_id", "scribe_v1");

      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: form as any,
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return res.status(500).json({
          error: `ElevenLabs STT failed (${r.status}): ${txt || r.statusText}`,
        });
      }

      const data: any = await r.json().catch(() => ({}));
      return res.json({ text: String(data?.text || "") });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message ?? "STT failed" });
    }
  },
);

/* ============================= */
/* GEMINI MINUTES                */
/* ============================= */

async function auto_pick_model(api_key: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`;
  const r = await fetch(url);

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ListModels failed (${r.status}): ${txt || r.statusText}`);
  }

  const json: any = await r.json().catch(() => ({}));
  const models: any[] = Array.isArray(json?.models) ? json.models : [];
  const candidate = models.find(
    (m) =>
      Array.isArray(m?.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes("generateContent"),
  );

  if (!candidate?.name) {
    throw new Error(
      "No available Gemini models support generateContent for this API key.",
    );
  }

  return String(candidate.name).replace(/^models\//, "");
}

app.post("/api/minutes", async (req: Request, res: Response) => {
  try {
    const transcript = String(req.body?.transcript ?? "").trim();
    const document_type = String(
      req.body?.document_type ?? "Executive Meeting Minutes",
    ).trim();
    const response_style = String(req.body?.response_style ?? "").trim();
    const directives = String(req.body?.directives ?? "").trim();

    if (!transcript)
      return res.status(400).json({ message: "Transcript required" });

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    let modelName = GEMINI_MODEL;
    if (modelName === "auto") modelName = await auto_pick_model(GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({ model: modelName });

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
    return res.json({ minutes: result.response.text(), model_used: modelName });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Minutes failed" });
  }
});

/* ============================= */
/* START                         */
/* ============================= */

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
