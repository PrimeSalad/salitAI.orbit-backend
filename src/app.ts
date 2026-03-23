/**
 * SalitAI.orbit Backend - Clean Architecture
 * Main Application Setup
 */

import express from "express";
import { config, validateConfig } from "./config";
import { createCorsMiddleware } from "./middleware/cors.middleware";
import { createUploadMiddleware } from "./middleware/upload.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { AudioService } from "./services/audio.service";
import { GeminiService } from "./services/gemini.service";
import { EmailService } from "./services/email.service";
import { STTController } from "./controllers/stt.controller";
import { MinutesController } from "./controllers/minutes.controller";
import { ContactController } from "./controllers/contact.controller";
import { createRoutes } from "./routes";

/**
 * Create and configure Express application
 */
export async function createApp() {
  // Validate configuration
  validateConfig();

  // Initialize Express
  const app = express();

  // Initialize services
  const audioService = new AudioService(config.upload.tempDir);
  const geminiService = new GeminiService(config.gemini.apiKey);
  const emailService = new EmailService(config.email);

  // Ensure upload directory exists
  await audioService.ensureUploadDirectory();

  // Initialize controllers
  const sttController = new STTController(
    audioService,
    geminiService,
    config.gemini.modelSTT
  );
  const minutesController = new MinutesController(
    geminiService,
    config.gemini.modelMinutes
  );
  const contactController = new ContactController(emailService);

  // Middleware
  app.use(createCorsMiddleware(config.cors.allowedOrigins));
  app.options("*", createCorsMiddleware(config.cors.allowedOrigins));
  app.use(express.json({ limit: config.api.jsonLimit }));

  // Upload middleware
  const upload = createUploadMiddleware(
    config.upload.tempDir,
    config.upload.maxSizeMB
  );

  // Routes
  const routes = createRoutes(
    upload,
    sttController,
    minutesController,
    contactController,
    geminiService
  );
  app.use(routes);

  // Error handling
  app.use(errorHandler);

  // Cleanup scheduler (run every hour)
  setInterval(
    () => {
      audioService
        .cleanupOldFiles(config.upload.cleanupIntervalHours)
        .then((count) => {
          if (count > 0) {
            console.log(`Cleaned up ${count} old files`);
          }
        })
        .catch((error) => {
          console.error("Cleanup error:", error);
        });
    },
    60 * 60 * 1000
  ); // Every hour

  return app;
}
