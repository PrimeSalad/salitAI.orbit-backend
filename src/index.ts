/**
 * SalitAI.orbit Backend
 * File: index.ts
 * Version: 1.0.0
 * Purpose: Express server with contact email endpoint.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const PORT = Number(process.env.PORT ?? 8081);
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "";

if (!CONTACT_TO_EMAIL) {
  console.error("CONTACT_TO_EMAIL missing in .env");
  process.exit(1);
}

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173", // Vite default
    methods: ["GET", "POST"],
    credentials: false,
  }),
);
app.use(express.json({ limit: "1mb" }));

/**
 * Create mail transporter
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Health check
 */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * POST /api/contact
 */
app.post("/api/contact", async (req: Request, res: Response) => {
  try {
    const { name, email, message } = req.body as {
      name?: string;
      email?: string;
      message?: string;
    };

    if (!name || !email || !message) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields",
      });
    }

    await transporter.sendMail({
      from: `"SalitAI.orbit Contact" <${process.env.SMTP_USER}>`,
      to: CONTACT_TO_EMAIL,
      subject: `New Contact Message from ${name}`,
      replyTo: email,
      text: `
Name: ${name}
Email: ${email}

Message:
${message}
      `,
      html: `
<h2>New Contact Submission</h2>
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Message:</strong></p>
<p>${message.replace(/\n/g, "<br/>")}</p>
      `,
    });

    return res.json({
      status: 200,
      message: "Email sent successfully",
    });
  } catch (error: any) {
    console.error("FULL EMAIL ERROR:", error);

    return res.status(500).json({
      status: 500,
      message: error?.message || "Failed to send email",
      raw: error,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
