/**
 * Anthropic Compatibility Layer Smoke Test
 * Tests that the Anthropic compatibility layer works as a drop-in replacement
 */

import { Anthropic } from "../src/compat/anthropic.js";
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

async function testAnthropicCompat() {
  console.log("🧪 Testing Anthropic Compatibility Layer\n");

  const client = new Anthropic({
    apiKey,
    baseURL,
    timeout: 30000
  });

  try {
    // Test 1: Non-streaming message
    console.log("Test 1: Non-streaming message");

    const message = await client.messages.create({
      model: manifest.testModel,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hi' }]
    });

    console.log("✅ Response received:");
    console.log("  - ID:", message.id);
    console.log("  - Model:", message.model);
    console.log("  - Role:", message.role);
    console.log("  - Content:", message.content?.[0]?.text?.substring(0, 100));
    console.log("  - Usage:", JSON.stringify(message.usage));
    console.log();

    // Test 2: Message with system prompt
    console.log("Test 2: Message with system prompt");

    const systemMessage = await client.messages.create({
      model: manifest.testModel,
      max_tokens: 50,
      system: "You are a helpful assistant.",
      messages: [{ role: 'user', content: 'Say hello' }]
    });

    console.log("✅ Response received:");
    console.log("  - Content:", systemMessage.content?.[0]?.text?.substring(0, 100));
    console.log();

    // Test 3: Streaming message
    console.log("Test 3: Streaming message");
    const stream = await client.messages.create({
      model: manifest.testModel,
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Hi' }],
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

    // Test 4: Access native features
    console.log("Test 4: Access native features via .native");
    const nativeResponse = await client.native.generateResponse({
      model: manifest.testModel,
      input: "Native compat check"
    } as any);
    console.log("[OK] Native response received:");
    console.log("  - ID:", (nativeResponse as { id?: string }).id ?? "unknown");
    console.log();
    console.log("âœ… All Anthropic compatibility tests passed!");
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
testAnthropicCompat()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
