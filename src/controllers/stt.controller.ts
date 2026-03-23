/**
 * STT Controller
 * Handles speech-to-text endpoints
 */

import type { Request, Response } from "express";
import { AudioService } from "../services/audio.service";
import { GeminiService } from "../services/gemini.service";

export class STTController {
  constructor(
    private audioService: AudioService,
    private geminiService: GeminiService,
    private preferredModel?: string
  ) {}

  /**
   * POST /api/stt
   * Transcribe audio file
   */
  async transcribe(req: Request, res: Response): Promise<void> {
    let uploadedGeminiFile: { name?: string; uri?: string; mimeType?: string } | null = null;
    let localFilePath: string | undefined;

    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({
          message: "No audio uploaded. Field name must be 'audio'.",
        });
        return;
      }

      // Save audio file locally (already done by multer)
      const audioFile = await this.audioService.saveAudioFile(file);
      localFilePath = audioFile.path;

      // Upload to Gemini Files API
      uploadedGeminiFile = await this.geminiService.uploadAudioFile(
        audioFile.path,
        audioFile.mimeType
      );

      // Transcribe audio
      const result = await this.geminiService.transcribeAudio(
        String(uploadedGeminiFile.uri),
        String(uploadedGeminiFile.mimeType),
        this.preferredModel
      );

      res.json({
        text: result.text,
        meta: {
          model: result.model,
          mimeType: audioFile.mimeType,
          originalName: file.originalname,
          size: audioFile.size,
        },
      });
    } catch (error) {
      console.error("STT ERROR:", error);

      res.status(500).json({
        error: error instanceof Error ? error.message : "STT failed",
        hint: [
          "Use compressed audio when possible for faster processing.",
          "For very large uploads, increase MAX_UPLOAD_MB and confirm your hosting platform upload limits.",
          "Check /api/models to inspect currently available models.",
        ].join(" "),
      });
    } finally {
      // Cleanup: Delete Gemini file
      if (uploadedGeminiFile?.name) {
        await this.geminiService.deleteUploadedFile(uploadedGeminiFile.name);
      }

      // Cleanup: Delete local file
      if (localFilePath) {
        await this.audioService.deleteAudioFile(localFilePath);
      }
    }
  }
}
