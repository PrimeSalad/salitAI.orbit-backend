#!/usr/bin/env node

/**
 * Check Available Gemini Models
 * Run this script to see what models are available with your API key
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: join(__dirname, "..", ".env") });

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY not found in .env file");
  console.error("Please set your API key in backend/.env");
  process.exit(1);
}

console.log("🔍 Checking available Gemini models...\n");

async function checkModels() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const models = data.models || [];

    console.log(`✓ Found ${models.length} total models\n`);

    // Filter models that support generateContent
    const contentModels = models.filter((model) =>
      model.supportedGenerationMethods?.includes("generateContent")
    );

    console.log(`✓ ${contentModels.length} models support generateContent:\n`);

    contentModels.forEach((model, index) => {
      const name = model.name.replace("models/", "");
      const displayName = model.displayName || name;
      console.log(`${index + 1}. ${name}`);
      console.log(`   Display Name: ${displayName}`);
      console.log(
        `   Methods: ${model.supportedGenerationMethods?.join(", ")}`
      );
      console.log("");
    });

    // Recommendations
    console.log("📋 Recommended models for SalitAI.orbit:\n");

    const recommended = [
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro-latest",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ];

    const available = recommended.filter((rec) =>
      contentModels.some((m) => m.name.includes(rec))
    );

    if (available.length > 0) {
      console.log("✓ Available recommended models:");
      available.forEach((model) => {
        console.log(`  - ${model}`);
      });
    } else {
      console.log("⚠️  None of the recommended models are available");
      console.log("   Using first available model:");
      if (contentModels.length > 0) {
        console.log(`  - ${contentModels[0].name.replace("models/", "")}`);
      }
    }

    console.log("\n💡 To use a specific model, set in your .env:");
    console.log(`   GEMINI_MODEL_STT=${available[0] || contentModels[0]?.name.replace("models/", "") || "gemini-1.5-flash-latest"}`);
    console.log(`   GEMINI_MODEL_MINUTES=${available[0] || contentModels[0]?.name.replace("models/", "") || "gemini-1.5-flash-latest"}`);

    console.log("\n✓ Or leave empty to use automatic fallback (recommended)");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkModels();
