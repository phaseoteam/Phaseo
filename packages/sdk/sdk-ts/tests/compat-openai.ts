/**
 * OpenAI Compatibility Layer Smoke Test
 * Tests that the OpenAI compatibility layer works as a drop-in replacement
 */

import { OpenAI } from "../src/compat/openai.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test configuration
const manifestPath = join(__dirname, "../../smoke-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const apiKey = process.env.AI_STATS_API_KEY;
const baseURL = process.env.AI_STATS_BASE_URL || manifest.defaultBaseUrl;

if (!apiKey) {
  console.error("❌ AI_STATS_API_KEY environment variable is required");
  process.exit(1);
}

async function testOpenAICompat() {
  console.log("🧪 Testing OpenAI Compatibility Layer\n");

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 30000
  });

  try {
    // Test 1: Non-streaming chat completion
    console.log("Test 1: Non-streaming chat completion");
    const chatPayload = manifest.operations.chat.body;

    const completion = await client.chat.completions.create({
      model: chatPayload.model,
      messages: chatPayload.messages
    });

    console.log("✅ Response received:");
    console.log("  - ID:", completion.id);
    console.log("  - Model:", completion.model);
    console.log("  - Choices:", completion.choices?.length);
    console.log("  - Content:", completion.choices?.[0]?.message?.content?.substring(0, 100));
    console.log();

    // Test 2: Streaming chat completion
    console.log("Test 2: Streaming chat completion");
    const stream = await client.chat.completions.create({
      model: chatPayload.model,
      messages: chatPayload.messages,
      stream: true
    });

    let chunks = 0;
    for await (const chunk of stream) {
      chunks++;
      if (chunks === 1) {
        process.stdout.write("  - Streaming: ");
      }
      process.stdout.write(chunk);
    }
    console.log(`\n  - Received ${chunks} chunks\n`);

    // Test 3: Access native features
    console.log("Test 3: Access native features via .native");
    const nativeResponse = await client.native.generateResponse({
      model: chatPayload.model,
      input: "Native compat check"
    } as any);
    console.log("[OK] Native response received:");
    console.log("  - ID:", (nativeResponse as { id?: string }).id ?? "unknown");
    console.log();
    console.log("âœ… All OpenAI compatibility tests passed!");
    return true;
  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("  Message:", error.message);
      console.error("  Stack:", error.stack);
    }
    return false;
  }
}

// Run tests
testOpenAICompat()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
