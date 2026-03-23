/**
 * Email Service
 * Handles all email operations
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailConfig {
  service: string;
  user: string;
  pass: string;
  toEmail: string;
}

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter(): void {
    if (!this.config.user || !this.config.pass || !this.config.toEmail) {
      console.warn("Email service not configured properly");
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: this.config.service,
      auth: {
        user: this.config.user,
        pass: this.config.pass,
      },
    });
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Send contact form email
   */
  async sendContactEmail(contact: ContactMessage): Promise<void> {
    if (!this.transporter) {
      throw new Error("Email service not configured");
    }

    await this.transporter.sendMail({
      from: `"SalitAI Contact" <${this.config.user}>`,
      to: this.config.toEmail,
      replyTo: contact.email,
      subject: `New Message from ${contact.name}`,
      text: this.formatTextEmail(contact),
      html: this.formatHtmlEmail(contact),
    });
  }

  /**
   * Format plain text email
   */
  private formatTextEmail(contact: ContactMessage): string {
    return `
Name: ${contact.name}
Email: ${contact.email}

Message:
${contact.message}
    `.trim();
  }

  /**
   * Format HTML email
   */
  private formatHtmlEmail(contact: ContactMessage): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #667eea; }
    .value { margin-top: 5px; }
    .message-box { background: white; padding: 15px; border-left: 4px solid #667eea; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>New Contact Submission</h2>
      <p>SalitAI.orbit Contact Form</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Name:</div>
        <div class="value">${this.escapeHtml(contact.name)}</div>
      </div>
      <div class="field">
        <div class="label">Email:</div>
        <div class="value">${this.escapeHtml(contact.email)}</div>
      </div>
      <div class="field">
        <div class="label">Message:</div>
        <div class="message-box">${this.escapeHtml(contact.message).replace(/\n/g, "<br/>")}</div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
  }
}
