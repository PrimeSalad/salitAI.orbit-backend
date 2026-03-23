/**
 * Contact Controller
 * Handles contact form endpoints
 */
export class ContactController {
    emailService;
    constructor(emailService) {
        this.emailService = emailService;
    }
    /**
     * POST /api/contact
     * Send contact form email
     */
    async send(req, res) {
        try {
            if (!this.emailService.isConfigured()) {
                res.status(500).json({ message: "Email not configured" });
                return;
            }
            const name = String(req.body?.name ?? "").trim();
            const email = String(req.body?.email ?? "").trim();
            const message = String(req.body?.message ?? "").trim();
            if (!name || !email || !message) {
                res.status(400).json({ message: "Missing fields" });
                return;
            }
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.status(400).json({ message: "Invalid email address" });
                return;
            }
            await this.emailService.sendContactEmail({ name, email, message });
            res.json({ success: true });
        }
        catch (error) {
            console.error("CONTACT ERROR:", error);
            res.status(500).json({
                error: error instanceof Error ? error.message : "Contact failed",
            });
        }
    }
}
