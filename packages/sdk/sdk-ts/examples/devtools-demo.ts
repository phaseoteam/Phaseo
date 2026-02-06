/**
 * DevTools Demo
 *
 * This example demonstrates how to use AI Stats DevTools to capture
 * and inspect API requests in real-time.
 *
 * Setup:
 * 1. Set AI_STATS_API_KEY environment variable
 * 2. Run this script: AI_STATS_DEVTOOLS=true tsx examples/devtools-demo.ts
 * 3. In another terminal, start the viewer: npx @ai-stats/devtools-viewer start
 * 4. Open http://localhost:4983 to see requests in real-time
 */

import { AIStats } from "../src/index.js";

async function main() {
  // Create client with devtools enabled
  const client = new AIStats({
    apiKey: process.env.AI_STATS_API_KEY!,
    devtools: {
      enabled: true, // Can also use AI_STATS_DEVTOOLS=true env var
      directory: ".ai-stats-devtools", // Default directory
      flushIntervalMs: 1000 // Flush every 1 second
    }
  });

  console.log("🚀 Running AI Stats SDK with DevTools enabled");
  console.log("📂 Telemetry will be saved to .ai-stats-devtools/");
  console.log("🌐 Start the viewer: npx @ai-stats/devtools-viewer start");
  console.log("");

  try {
    // Example 1: Chat completion
    console.log("1️⃣  Testing chat completion...");
    const chatResponse = await client.generateText({
      model: "openai/gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" }
      ],
      temperature: 0.7,
      max_tokens: 100
    });
    console.log("✓ Response:", chatResponse.choices[0]?.message?.content);
    console.log("");

    // Example 2: Streaming chat completion
    console.log("2️⃣  Testing streaming chat completion...");
    const stream = client.streamText({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: "Count from 1 to 5" }]
    });

    process.stdout.write("✓ Stream: ");
    for await (const chunk of stream) {
      // Parse SSE chunk
      if (chunk.startsWith("data: ")) {
        const data = chunk.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            process.stdout.write(content);
          }
        } catch {}
      }
    }
    console.log("\n");

    // Example 3: Image generation
    console.log("3️⃣  Testing image generation...");
    const imageResponse = await client.generateImage({
      model: "dall-e-3",
      prompt: "A serene mountain landscape at sunset",
      n: 1,
      size: "1024x1024"
    });
    console.log("✓ Image generated:", imageResponse.data[0]?.url);
    console.log("");

    // Example 4: Embeddings
    console.log("4️⃣  Testing embeddings...");
    const embeddingResponse = await client.generateEmbedding({
      model: "text-embedding-3-small",
      input: "The quick brown fox jumps over the lazy dog"
    });
    console.log("✓ Embedding generated:", embeddingResponse);
    console.log("");

    console.log("✅ All examples completed!");
    console.log("");
    console.log("📊 View telemetry at: http://localhost:4983");
    console.log("   (Make sure the devtools viewer is running)");
  } catch (error) {
    console.error("❌ Error:", error);
  }

  // Give telemetry time to flush
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

main();
