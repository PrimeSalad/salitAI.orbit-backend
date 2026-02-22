/**
 * SalitAI.orbit Backend
 * File: index.d.ts
 * Version: 1.0.0
 * Purpose: Extend Express Request typings for multer.
 */

import "express";

declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
    }
  }
}

export {};
