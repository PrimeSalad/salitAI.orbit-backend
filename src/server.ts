/**
 * SalitAI.orbit Backend
 * File: server.ts
 * Version: 3.0.0
 * Purpose: Gemini Audio Transcription (STT) + Gemini Minutes + Contact Email API
 *
 * Improvements:
 * - Uses Google GenAI SDK (@google/genai)
 * - Uses Gemini Files API for large audio uploads
 * - Supports model fallback rotation on quota/rate/unavailable errors
 * - Uses disk-based uploads instead of memory to reduce RAM pressure
 * - Cleans up temp files and uploaded Gemini files
 * - Free-tier friendly with cached model discovery
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import nodemailer from "nodemailer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";

dotenv.config();

/* ============================= */
/* CONSTANTS                     */
/* ============================= */

const DEFAULT_PORT = 8082;
const DEFAULT_JSON_LIMIT = "10mb";
const DEFAULT_UPLOAD_LIMIT_MB = 200;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const TEMP_DIR_NAME = "salitai_uploads";

/* ============================= */
/* ENV                           */
/* ============================= */

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY ?? "").trim();

const GEMINI_MODEL_STT = String(process.env.GEMINI_MODEL_STT ?? "").trim();
const GEMINI_MODEL_MINUTES = String(
  process.env.GEMINI_MODEL_MINUTES ?? "",
).trim();

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SMTP_SERVICE = String(process.env.SMTP_SERVICE ?? "gmail").trim();
const SMTP_USER = String(process.env.SMTP_USER ?? "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS ?? "").trim();
const CONTACT_TO_EMAIL = String(process.env.CONTACT_TO_EMAIL ?? "").trim();

const MAX_UPLOAD_MB = Number(
  process.env.MAX_UPLOAD_MB ?? DEFAULT_UPLOAD_LIMIT_MB,
);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

/* ============================= */
/* APP INIT                      */
/* ============================= */

const app = express();
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (/^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: false,
  }),
);

app.options("*", cors());
app.use(express.json({ limit: DEFAULT_JSON_LIMIT }));

/* ============================= */
/* TEMP DIRECTORY                */
/* ============================= */

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), TEMP_DIR_NAME);

async function ensure_temp_directory(): Promise<void> {
  await fsp.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
}

function build_temp_filename(original_name: string): string {
  const extension = path.extname(original_name || "");
  const safe_extension = extension.slice(0, 10);
  const unique_id = crypto.randomUUID();
  return `${Date.now()}_${unique_id}${safe_extension}`;
}

/* ============================= */
/* MULTER                        */
/* ============================= */

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, TEMP_UPLOAD_DIR);
  },
  filename: (_req, file, callback) => {
    callback(null, build_temp_filename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
});

/* ============================= */
/* TYPES                         */
/* ============================= */

type GeminiModelInfo = {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

type RetryableOperationResult<T> = {
  model: string;
  data: T;
};

type FileLikeUpload = {
  name?: string;
  uri?: string;
  mimeType?: string;
};

/* ============================= */
/* MODEL CACHE                   */
/* ============================= */

let cached_model_names: string[] = [];
let cached_model_names_expires_at = 0;

/* ============================= */
/* MODEL HELPERS                 */
/* ============================= */

function normalize_model_name(name: string): string {
  return String(name).replace(/^models\//, "").trim();
}

function supports_generate_content(model: GeminiModelInfo): boolean {
  return (
    Array.isArray(model?.supportedGenerationMethods) &&
    model.supportedGenerationMethods.includes("generateContent")
  );
}

async function list_models(api_key: string): Promise<GeminiModelInfo[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`,
  );

  if (!response.ok) {
    const error_text = await response.text().catch(() => "");
    throw new Error(
      `ListModels failed (${response.status}): ${error_text || response.statusText}`,
    );
  }

  const json = (await response.json().catch(() => ({}))) as {
    models?: GeminiModelInfo[];
  };

  return Array.isArray(json.models) ? json.models : [];
}

function build_candidate_model_pool(
  available_models: GeminiModelInfo[],
  preferred_model?: string,
): string[] {
  const supported_models = available_models
    .filter((model) => supports_generate_content(model) && model.name)
    .map((model) => normalize_model_name(model.name as string));

  const popular_fallbacks = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  const ordered = [
    preferred_model ? normalize_model_name(preferred_model) : "",
    ...popular_fallbacks,
    ...supported_models,
  ].filter(Boolean);

  return Array.from(new Set(ordered));
}

async function get_model_pool(preferred_model?: string): Promise<string[]> {
  const now = Date.now();

  if (
    cached_model_names.length > 0 &&
    now < cached_model_names_expires_at &&
    !preferred_model
  ) {
    return cached_model_names;
  }

  const models = await list_models(GEMINI_API_KEY);
  const pool = build_candidate_model_pool(models, preferred_model);

  if (!pool.length) {
    throw new Error(
      "No available Gemini model supports generateContent for this API key.",
    );
  }

  if (!preferred_model) {
    cached_model_names = pool;
    cached_model_names_expires_at = now + MODEL_CACHE_TTL_MS;
  }

  return pool;
}

function is_retryable_model_error(error: unknown): boolean {
  const message = String(
    error instanceof Error ? error.message : error ?? "",
  ).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("503") ||
    message.includes("500") ||
    message.includes("timeout") ||
    message.includes("model not found") ||
    message.includes("does not support") ||
    message.includes("failed precondition")
  );
}

async function run_with_model_fallback<T>(
  preferred_model: string | undefined,
  operation: (model_name: string) => Promise<T>,
): Promise<RetryableOperationResult<T>> {
  const model_pool = await get_model_pool(preferred_model);
  const failures: string[] = [];

  for (const model_name of model_pool) {
    try {
      const data = await operation(model_name);
      return { model: model_name, data };
    } catch (error) {
      const error_message = String(
        error instanceof Error ? error.message : error ?? "Unknown error",
      );

      failures.push(`${model_name}: ${error_message}`);

      if (!is_retryable_model_error(error)) {
        throw new Error(
          `Model ${model_name} failed with non-retryable error: ${error_message}`,
        );
      }
    }
  }

  throw new Error(
    `All candidate models failed. Attempts: ${failures.join(" | ")}`,
  );
}

/* ============================= */
/* FILE HELPERS                  */
/* ============================= */

async function safe_unlink(file_path?: string): Promise<void> {
  if (!file_path) {
    return;
  }

  try {
    await fsp.unlink(file_path);
  } catch {
    // no-op
  }
}

async function safe_delete_uploaded_file(file_name?: string): Promise<void> {
  if (!file_name) {
    return;
  }

  try {
    await ai.files.delete({ name: file_name });
  } catch {
    // no-op
  }
}

function resolve_audio_mime_type(file: Express.Multer.File): string {
  const mime_type = String(file.mimetype || "").trim();
  if (mime_type) {
    return mime_type;
  }

  const extension = path.extname(file.originalname || "").toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

async function upload_audio_file_to_gemini(
  file: Express.Multer.File,
): Promise<FileLikeUpload> {
  const mime_type = resolve_audio_mime_type(file);

  const uploaded_file = await ai.files.upload({
    file: file.path,
    config: {
      mimeType: mime_type,
    },
  });

  return uploaded_file;
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

    return res.json(
      models.map((model) => ({
        name: model.name,
        displayName: model.displayName,
        supportedGenerationMethods: model.supportedGenerationMethods,
      })),
    );
  } catch (error) {
    console.error("LIST MODELS ERROR:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list models",
    });
  }
});

/* ============================= */
/* CONTACT EMAIL                 */
/* ============================= */

const mailer =
  SMTP_USER && SMTP_PASS && CONTACT_TO_EMAIL
    ? nodemailer.createTransport({
        service: SMTP_SERVICE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
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
  } catch (error) {
    console.error("CONTACT ERROR:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Contact failed",
    });
  }
});

/* ============================= */
/* GEMINI AUDIO -> TEXT (STT)    */
/* ============================= */

app.post(
  "/api/stt",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    let uploaded_gemini_file: FileLikeUpload | null = null;

    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          message: "No audio uploaded. Field name must be 'audio'.",
        });
      }

      uploaded_gemini_file = await upload_audio_file_to_gemini(file);

      const transcription_prompt = [
        createPartFromUri(
          String(uploaded_gemini_file.uri),
          String(uploaded_gemini_file.mimeType),
        ),
        [
          "Transcribe this audio accurately.",
          "Output plain text only.",
          "Do not add timestamps unless they are explicitly spoken.",
          "Preserve the original language and wording as much as possible.",
          "If there are multiple speakers, separate them naturally when obvious.",
        ].join(" "),
      ];

      const result = await run_with_model_fallback(
        GEMINI_MODEL_STT || undefined,
        async (model_name) => {
          const response = await ai.models.generateContent({
            model: model_name,
            contents: createUserContent(transcription_prompt),
          });

          return String(response.text ?? "").trim();
        },
      );

      return res.json({
        text: result.data,
        meta: {
          model: result.model,
          mimeType: uploaded_gemini_file.mimeType ?? resolve_audio_mime_type(file),
          originalName: file.originalname,
          size: file.size,
        },
      });
    } catch (error) {
      console.error("GEMINI STT ERROR:", error);

      return res.status(500).json({
        error: error instanceof Error ? error.message : "STT failed",
        hint: [
          "Use compressed audio when possible for faster processing.",
          "For very large uploads, increase MAX_UPLOAD_MB and confirm your hosting platform upload limits.",
          "Check /api/models to inspect currently available models.",
        ].join(" "),
      });
    } finally {
      await safe_delete_uploaded_file(uploaded_gemini_file?.name);
      await safe_unlink(req.file?.path);
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

    const prompt = `
You are a professional meeting secretary.
Convert the transcript into high-quality "${document_type}" in Markdown.

Rules:
- Do NOT invent facts.
- If information is missing, write "Not specified".
- Keep wording professional, clean, and readable.
- Prefer concise bullets where appropriate.
- Use clear section headings.
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
## Action Items
| Action | Owner | Due Date | Notes |
|---|---|---|---|
## Risks / Blockers
## Next Meeting
## Summary

TRANSCRIPT:
${transcript}
    `.trim();

    const result = await run_with_model_fallback(
      GEMINI_MODEL_MINUTES || undefined,
      async (model_name) => {
        const response = await ai.models.generateContent({
          model: model_name,
          contents: prompt,
        });

        return String(response.text ?? "").trim();
      },
    );

    return res.json({
      minutes: result.data,
      meta: {
        model: result.model,
      },
    });
  } catch (error) {
    console.error("GEMINI MINUTES ERROR:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Minutes failed",
    });
  }
});

/* ============================= */
/* ERROR HANDLERS                */
/* ============================= */

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: `Uploaded file is too large. Current limit is ${MAX_UPLOAD_MB} MB.`,
        });
      }

      return res.status(400).json({
        message: error.message,
      });
    }

    if (error instanceof Error && error.message.startsWith("CORS blocked:")) {
      return res.status(403).json({
        message: error.message,
      });
    }

    console.error("UNHANDLED ERROR:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  },
);

/* ============================= */
/* START                         */
/* ============================= */

async function bootstrap(): Promise<void> {
  await ensure_temp_directory();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Temp upload dir: ${TEMP_UPLOAD_DIR}`);
    console.log(`Max upload limit: ${MAX_UPLOAD_MB} MB`);
  });
}

void bootstrap().catch((error) => {
  console.error("BOOTSTRAP ERROR:", error);
  process.exit(1);
});