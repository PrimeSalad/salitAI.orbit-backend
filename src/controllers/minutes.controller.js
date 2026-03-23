/**
 * Minutes Controller
 * Handles meeting minutes generation endpoints
 */
export class MinutesController {
    geminiService;
    preferredModel;
    constructor(geminiService, preferredModel) {
        this.geminiService = geminiService;
        this.preferredModel = preferredModel;
    }
    /**
     * POST /api/minutes
     * Generate meeting minutes from transcript
     */
    async generate(req, res) {
        try {
            const transcript = String(req.body?.transcript ?? "").trim();
            const documentType = String(req.body?.document_type ?? "Executive Meeting Minutes").trim();
            const responseStyle = String(req.body?.response_style ?? "").trim();
            const directives = String(req.body?.directives ?? "").trim();
            if (!transcript) {
                res.status(400).json({ message: "Transcript required" });
                return;
            }
            const result = await this.geminiService.generateMinutes(transcript, documentType, responseStyle, directives, this.preferredModel);
            res.json({
                minutes: result.minutes,
                meta: {
                    model: result.model,
                },
            });
        }
        catch (error) {
            console.error("MINUTES ERROR:", error);
            res.status(500).json({
                error: error instanceof Error ? error.message : "Minutes failed",
            });
        }
    }
}
