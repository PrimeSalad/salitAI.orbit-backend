/**
 * Gemini AI Service
 * Handles all Gemini API interactions
 */
import { GoogleGenAI, createPartFromUri, createUserContent, } from "@google/genai";
export class GeminiService {
    ai;
    apiKey;
    modelCache = null;
    CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.ai = new GoogleGenAI({ apiKey });
    }
    /**
     * Upload audio file to Gemini Files API
     */
    async uploadAudioFile(filePath, mimeType) {
        const uploadedFile = await this.ai.files.upload({
            file: filePath,
            config: { mimeType },
        });
        return uploadedFile;
    }
    /**
     * Delete uploaded file from Gemini
     */
    async deleteUploadedFile(fileName) {
        try {
            await this.ai.files.delete({ name: fileName });
        }
        catch (error) {
            console.warn(`Failed to delete Gemini file: ${fileName}`, error);
        }
    }
    /**
     * Transcribe audio using Gemini STT
     */
    async transcribeAudio(fileUri, fileMimeType, preferredModel) {
        const prompt = [
            createPartFromUri(fileUri, fileMimeType),
            [
                "Transcribe this audio accurately.",
                "Output plain text only.",
                "Do not add timestamps unless they are explicitly spoken.",
                "Preserve the original language and wording as much as possible.",
                "If there are multiple speakers, separate them naturally when obvious.",
            ].join(" "),
        ];
        const result = await this.runWithModelFallback(preferredModel, async (modelName) => {
            const response = await this.ai.models.generateContent({
                model: modelName,
                contents: createUserContent(prompt),
            });
            return String(response.text ?? "").trim();
        });
        return {
            text: result.data,
            model: result.model,
        };
    }
    /**
     * Generate meeting minutes from transcript
     */
    async generateMinutes(transcript, documentType, responseStyle, directives, preferredModel) {
        const prompt = `
You are a professional meeting secretary.
Convert the transcript into high-quality "${documentType}" in Markdown.

Rules:
- Do NOT invent facts.
- If information is missing, write "Not specified".
- Keep wording professional, clean, and readable.
- Prefer concise bullets where appropriate.
- Use clear section headings.
- Output Markdown only.
${responseStyle ? `- Style: ${responseStyle}` : ""}
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
        const result = await this.runWithModelFallback(preferredModel, async (modelName) => {
            const response = await this.ai.models.generateContent({
                model: modelName,
                contents: prompt,
            });
            return String(response.text ?? "").trim();
        });
        return {
            minutes: result.data,
            model: result.model,
        };
    }
    /**
     * List available Gemini models
     */
    async listModels() {
        try {
            // Use the SDK's built-in method to list models
            const modelsPager = await this.ai.models.list();
            const modelsList = [];
            for await (const model of modelsPager) {
                modelsList.push(model);
            }
            return modelsList;
        }
        catch (error) {
            console.warn("Failed to list models via SDK, trying REST API:", error);
            // Fallback to REST API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(`ListModels failed (${response.status}): ${errorText || response.statusText}`);
            }
            const json = (await response.json().catch(() => ({})));
            return Array.isArray(json.models) ? json.models : [];
        }
    }
    /**
     * Get model pool with fallback options
     */
    async getModelPool(preferredModel) {
        const now = Date.now();
        // Use cache if available and not expired
        if (this.modelCache &&
            now < this.modelCache.expiresAt &&
            !preferredModel) {
            return this.modelCache.models;
        }
        const models = await this.listModels();
        const pool = this.buildModelPool(models, preferredModel);
        // Cache the result
        if (!preferredModel) {
            this.modelCache = {
                models: pool,
                expiresAt: now + this.CACHE_TTL_MS,
            };
        }
        return pool;
    }
    /**
     * Build model pool with fallbacks
     */
    buildModelPool(availableModels, preferredModel) {
        const supportedModels = availableModels
            .filter((model) => model.supportedGenerationMethods?.includes("generateContent") &&
            model.name)
            .map((model) => this.normalizeModelName(model.name));
        // Common model name patterns to try
        const popularFallbacks = [
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro-latest",
            "gemini-1.5-flash",
            "gemini-1.5-flash-8b",
            "gemini-1.5-pro",
            "gemini-pro",
            "gemini-flash",
        ];
        const ordered = [
            preferredModel ? this.normalizeModelName(preferredModel) : "",
            ...popularFallbacks,
            ...supportedModels,
        ].filter(Boolean);
        // Remove duplicates and return
        const uniqueModels = Array.from(new Set(ordered));
        console.log(`Available models for fallback: ${uniqueModels.slice(0, 5).join(", ")}...`);
        return uniqueModels;
    }
    /**
     * Normalize model name
     */
    normalizeModelName(name) {
        return String(name).replace(/^models\//, "").trim();
    }
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const message = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
        return (message.includes("429") ||
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
            message.includes("failed precondition"));
    }
    /**
     * Run operation with model fallback
     */
    async runWithModelFallback(preferredModel, operation) {
        const modelPool = await this.getModelPool(preferredModel);
        const failures = [];
        if (modelPool.length === 0) {
            throw new Error("No available models found. Please check your API key and try again.");
        }
        for (const modelName of modelPool) {
            try {
                console.log(`Trying model: ${modelName}`);
                const data = await operation(modelName);
                console.log(`✓ Success with model: ${modelName}`);
                return { model: modelName, data };
            }
            catch (error) {
                const errorMessage = String(error instanceof Error ? error.message : error ?? "Unknown error");
                failures.push(`${modelName}: ${errorMessage}`);
                console.warn(`✗ Failed with ${modelName}: ${errorMessage}`);
                if (!this.isRetryableError(error)) {
                    throw new Error(`Model ${modelName} failed with non-retryable error: ${errorMessage}`);
                }
            }
        }
        throw new Error(`All ${modelPool.length} candidate models failed. ` +
            `Tried: ${modelPool.slice(0, 3).join(", ")}... ` +
            `Last error: ${failures[failures.length - 1]}`);
    }
}
