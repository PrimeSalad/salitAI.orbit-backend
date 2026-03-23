/**
 * Upload Middleware
 */
import multer from "multer";
import path from "path";
import crypto from "crypto";
export function createUploadMiddleware(uploadDir, maxSizeMB) {
    const storage = multer.diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, uploadDir);
        },
        filename: (_req, file, callback) => {
            const extension = path.extname(file.originalname || "");
            const safeExtension = extension.slice(0, 10);
            const uniqueId = crypto.randomUUID();
            const filename = `${Date.now()}_${uniqueId}${safeExtension}`;
            callback(null, filename);
        },
    });
    return multer({
        storage,
        limits: {
            fileSize: maxSizeMB * 1024 * 1024,
        },
    });
}
