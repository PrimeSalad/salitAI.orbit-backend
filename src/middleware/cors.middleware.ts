/**
 * CORS Middleware
 */

import cors from "cors";

export function createCorsMiddleware(allowedOrigins: string[]) {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Allow localhost with any port
      if (/^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }

      // Allow configured origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Block all other origins
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: false,
  });
}
