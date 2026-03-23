/**
 * SalitAI.orbit Backend
 * Server Entry Point
 * Version: 2.0.0 - Clean Architecture
 */
import { createApp } from "./app";
import { config } from "./config";
async function bootstrap() {
    try {
        const app = await createApp();
        app.listen(config.port, "0.0.0.0", () => {
            console.log("╔════════════════════════════════════════════╗");
            console.log("║   SalitAI.orbit Backend - v2.0.0          ║");
            console.log("╠════════════════════════════════════════════╣");
            console.log(`║   Server: http://localhost:${config.port}        ║`);
            console.log(`║   Environment: ${config.nodeEnv.padEnd(24)}║`);
            console.log(`║   Upload Dir: ${config.upload.tempDir.slice(0, 20).padEnd(24)}║`);
            console.log(`║   Max Upload: ${config.upload.maxSizeMB}MB${" ".repeat(24 - String(config.upload.maxSizeMB).length - 2)}║`);
            console.log("╠════════════════════════════════════════════╣");
            console.log("║   Status: READY ✓                          ║");
            console.log("╚════════════════════════════════════════════╝");
        });
    }
    catch (error) {
        console.error("╔════════════════════════════════════════════╗");
        console.error("║   BOOTSTRAP ERROR                          ║");
        console.error("╚════════════════════════════════════════════╝");
        console.error(error);
        process.exit(1);
    }
}
// Handle uncaught errors
process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);
    process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("UNHANDLED REJECTION at:", promise, "reason:", reason);
    process.exit(1);
});
// Start server
void bootstrap();
