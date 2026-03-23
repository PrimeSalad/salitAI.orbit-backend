/**
 * Gemini AI Service
 * Handles all Gemini API interactions
 */

import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";

export interface TranscriptionResult {
  text: string;
  model: string;
}

export interface MinutesResult {
  minutes: string;
  model: string;
}

export interface GeminiModelInfo {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

export class GeminiService {
  private ai: GoogleGenAI;
  private apiKey: string;
  private modelCache: {
    models: string[];
    expiresAt: number;
  } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Upload audio file to Gemini Files API
   */
  async uploadAudioFile(
    filePath: string,
    mimeType: string
  ): Promise<{ name?: string; uri?: string; mimeType?: string }> {
    const uploadedFile = await this.ai.files.upload({
      file: filePath,
      config: { mimeType },
    });

    return uploadedFile;
  }

  /**
   * Delete uploaded file from Gemini
   */
  async deleteUploadedFile(fileName: string): Promise<void> {
    try {
      await this.ai.files.delete({ name: fileName });
    } catch (error) {
      console.warn(`Failed to delete Gemini file: ${fileName}`, error);
    }
  }

  /**
   * Transcribe audio using Gemini STT
   */
  async transcribeAudio(
    fileUri: string,
    fileMimeType: string,
    preferredModel?: string
  ): Promise<TranscriptionResult> {
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

    const result = await this.runWithModelFallback(
      preferredModel,
      async (modelName) => {
        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: createUserContent(prompt),
        });

        return String(response.text ?? "").trim();
      }
    );

    return {
      text: result.data,
      model: result.model,
    };
  }

  /**
   * Generate meeting minutes from transcript
   */
  async generateMinutes(
    transcript: string,
    documentType: string,
    responseStyle: string,
    directives: string,
    preferredModel?: string
  ): Promise<MinutesResult> {
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

    const result = await this.runWithModelFallback(
      preferredModel,
      async (modelName) => {
        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        return String(response.text ?? "").trim();
      }
    );

    return {
      minutes: result.data,
      model: result.model,
    };
  }

  /**
   * List available Gemini models
   */
  async listModels(): Promise<GeminiModelInfo[]> {
    // Always use REST API for reliability
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`ListModels API error (${response.status}):`, errorText);
        throw new Error(
          `ListModels failed (${response.status}): ${errorText || response.statusText}`
        );
      }

      const json = (await response.json().catch(() => ({}))) as {
        models?: GeminiModelInfo[];
      };

      const models = Array.isArray(json.models) ? json.models : [];
      
      console.log(`✓ Successfully fetched ${models.length} models from API`);
      
      return models;
    } catch (error) {
      console.error("Failed to list models:", error);
      throw error;
    }
  }

  /**
   * Get model pool with fallback options
   */
  private async getModelPool(preferredModel?: string): Promise<string[]> {
    const now = Date.now();

    // Use cache if available and not expired
    if (
      this.modelCache &&
      now < this.modelCache.expiresAt &&
      !preferredModel
    ) {
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
  private buildModelPool(
    availableModels: GeminiModelInfo[],
    preferredModel?: string
  ): string[] {
    console.log(`📋 Building model pool from ${availableModels.length} available models`);
    
    // Get all models that support generateContent
    const supportedModels = availableModels
      .filter(
        (model) =>
          model.supportedGenerationMethods?.includes("generateContent") &&
          model.name
      )
      .map((model) => this.normalizeModelName(model.name as string));

    console.log(`✓ ${supportedModels.length} models support generateContent`);

    if (supportedModels.length === 0) {
      console.error("⚠️  No models found that support generateContent!");
      console.error("Available models:", availableModels.map(m => m.name).join(", "));
      return [];
    }

    // If preferred model is specified and exists, put it first
    if (preferredModel) {
      const normalizedPreferred = this.normalizeModelName(preferredModel);
      console.log(`🎯 Preferred model: ${normalizedPreferred}`);
      
      if (supportedModels.includes(normalizedPreferred)) {
        console.log(`✓ Preferred model is available`);
        return [
          normalizedPreferred,
          ...supportedModels.filter((m) => m !== normalizedPreferred),
        ];
      } else {
        console.warn(`⚠️  Preferred model not available, using fallbacks`);
      }
    }

    // Return all supported models (no hardcoded fallbacks)
    console.log(`📝 Model pool: ${supportedModels.slice(0, 5).join(", ")}${supportedModels.length > 5 ? "..." : ""}`);
    
    return supportedModels;
  }

  /**
   * Normalize model name
   */
  private normalizeModelName(name: string): string {
    return String(name).replace(/^models\//, "").trim();
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const message = String(
      error instanceof Error ? error.message : error ?? ""
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
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("does not support") ||
      message.includes("failed precondition")
    );
  }

  /**
   * Run operation with model fallback
   */
  private async runWithModelFallback<T>(
    preferredModel: string | undefined,
    operation: (modelName: string) => Promise<T>
  ): Promise<{ model: string; data: T }> {
    const modelPool = await this.getModelPool(preferredModel);
    const failures: string[] = [];

    if (modelPool.length === 0) {
      throw new Error(
        "No available models found. Please check your API key and try again."
      );
    }

    for (const modelName of modelPool) {
      try {
        console.log(`Trying model: ${modelName}`);
        const data = await operation(modelName);
        console.log(`✓ Success with model: ${modelName}`);
        return { model: modelName, data };
      } catch (error) {
        const errorMessage = String(
          error instanceof Error ? error.message : error ?? "Unknown error"
        );

        failures.push(`${modelName}: ${errorMessage}`);
        console.warn(`✗ Failed with ${modelName}: ${errorMessage}`);

        if (!this.isRetryableError(error)) {
          throw new Error(
            `Model ${modelName} failed with non-retryable error: ${errorMessage}`
          );
        }
      }
    }

    throw new Error(
      `All ${modelPool.length} candidate models failed. ` +
      `Tried: ${modelPool.slice(0, 3).join(", ")}... ` +
      `Last error: ${failures[failures.length - 1]}`
    );
  }
}
