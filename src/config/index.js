/**
 * Application Configuration
 */
import dotenv from "dotenv";
import path from "path";
import os from "os";
dotenv.config();
export const config = {
    // Server
    port: Number(process.env.PORT ?? 8082),
    nodeEnv: process.env.NODE_ENV || "development",
    // Gemini AI
    gemini: {
        apiKey: String(process.env.GEMINI_API_KEY ?? "").trim(),
        modelSTT: String(process.env.GEMINI_MODEL_STT ?? "").trim() || undefined,
        modelMinutes: String(process.env.GEMINI_MODEL_MINUTES ?? "").trim() || undefined,
    },
    // CORS
    cors: {
        allowedOrigins: String(process.env.ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
    },
    // Email
    email: {
        service: String(process.env.SMTP_SERVICE ?? "gmail").trim(),
        user: String(process.env.SMTP_USER ?? "").trim(),
        pass: String(process.env.SMTP_PASS ?? "").trim(),
        toEmail: String(process.env.CONTACT_TO_EMAIL ?? "").trim(),
    },
    // Upload
    upload: {
        maxSizeMB: Number(process.env.MAX_UPLOAD_MB ?? 200),
        tempDir: path.join(os.tmpdir(), "salitai_uploads"),
        cleanupIntervalHours: 24,
    },
    // API
    api: {
        jsonLimit: "10mb",
    },
};
/**
 * Validate required configuration
 */
export function validateConfig() {
    if (!config.gemini.apiKey) {
        throw new Error("GEMINI_API_KEY is required");
    }
    console.log("✓ Configuration validated");
}
