/**
 * API Routes
 */
import express from "express";
export function createRoutes(upload, sttController, minutesController, contactController, geminiService) {
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
            res.json(models.map((model) => ({
                name: model.name,
                displayName: model.displayName,
                supportedGenerationMethods: model.supportedGenerationMethods,
            })));
        }
        catch (error) {
            console.error("LIST MODELS ERROR:", error);
            res.status(500).json({
                error: error instanceof Error ? error.message : "Failed to list models",
            });
        }
    });
    // STT endpoint
    router.post("/api/stt", upload.single("audio"), (req, res) => sttController.transcribe(req, res));
    // Minutes endpoint
    router.post("/api/minutes", (req, res) => minutesController.generate(req, res));
    // Contact endpoint
    router.post("/api/contact", (req, res) => contactController.send(req, res));
    return router;
}
