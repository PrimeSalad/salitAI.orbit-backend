/**
 * Error Handling Middleware
 */
import multer from "multer";
export function errorHandler(error, _req, res, _next) {
    // Multer errors
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({
                message: `Uploaded file is too large. Maximum size allowed.`,
            });
            return;
        }
        res.status(400).json({
            message: error.message,
        });
        return;
    }
    // CORS errors
    if (error instanceof Error && error.message.startsWith("CORS blocked:")) {
        res.status(403).json({
            message: error.message,
        });
        return;
    }
    // Generic errors
    console.error("UNHANDLED ERROR:", error);
    res.status(500).json({
        message: "Internal server error",
    });
}
