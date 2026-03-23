/**
 * Audio Service
 * Handles all audio processing operations
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface AudioFile {
  path: string;
  filename: string;
  size: number;
  mimeType: string;
}

export class AudioService {
  private uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = uploadDir;
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDirectory(): Promise<void> {
    await fsp.mkdir(this.uploadDir, { recursive: true });
  }

  /**
   * Save uploaded audio file locally
   */
  async saveAudioFile(
    file: Express.Multer.File
  ): Promise<AudioFile> {
    const audioFile: AudioFile = {
      path: file.path,
      filename: file.filename,
      size: file.size,
      mimeType: this.resolveMimeType(file),
    };

    return audioFile;
  }

  /**
   * Delete audio file from local storage
   */
  async deleteAudioFile(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      // File might already be deleted, ignore error
      console.warn(`Failed to delete file: ${filePath}`, error);
    }
  }

  /**
   * Resolve audio MIME type
   */
  private resolveMimeType(file: Express.Multer.File): string {
    if (file.mimetype) {
      return file.mimetype;
    }

    const extension = path.extname(file.originalname || "").toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".ogg": "audio/ogg",
      ".webm": "audio/webm",
      ".flac": "audio/flac",
      ".opus": "audio/opus",
    };

    return mimeTypes[extension] || "application/octet-stream";
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<{
    size: number;
    exists: boolean;
  }> {
    try {
      const stats = await fsp.stat(filePath);
      return {
        size: stats.size,
        exists: true,
      };
    } catch {
      return {
        size: 0,
        exists: false,
      };
    }
  }

  /**
   * Clean up old files (older than specified hours)
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await fsp.readdir(this.uploadDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        try {
          const stats = await fsp.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > maxAge) {
            await fsp.unlink(filePath);
            deletedCount++;
          }
        } catch {
          // Skip files that can't be accessed
          continue;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error("Cleanup error:", error);
      return 0;
    }
  }
}
