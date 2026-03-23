/**
 * API Routes
 */

import express from "express";
import type { Router } from "express";
import { STTController } from "../controllers/stt.controller";
import { MinutesController } from "../controllers/minutes.controller";
import { ContactController } from "../controllers/contact.controller";
import { GeminiService } from "../services/gemini.service";

export function createRoutes(
  upload: any,
  sttController: STTController,
  minutesController: MinutesController,
  contactController: ContactController,
  geminiService: GeminiService
): Router {
  const router = express.Router();

  // Health check
  router.get("/health", (_req, res) => {
    res.json({ status: 200, message: "ok" });
  });

  router.get("/api/health", (_req, res) => {
    res.json({ status: 200, message: "ok" });
  });

  // List available models (debug endpoint)
  router.get("/api/models", async (_req, res) => {
    try {
      const models = await geminiService.listModels();
      res.json(
        models.map((model) => ({
          name: model.name,
          displayName: model.displayName,
          supportedGenerationMethods: model.supportedGenerationMethods,
        }))
      );
    } catch (error) {
      console.error("LIST MODELS ERROR:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to list models",
      });
    }
  });

  // STT endpoint
  router.post(
    "/api/stt",
    upload.single("audio"),
    (req: express.Request, res: express.Response) =>
      sttController.transcribe(req, res)
  );

  // Minutes endpoint
  router.post("/api/minutes", (req: express.Request, res: express.Response) =>
    minutesController.generate(req, res)
  );

  // Contact endpoint
  router.post("/api/contact", (req: express.Request, res: express.Response) =>
    contactController.send(req, res)
  );

  return router;
}
