import { AIStats } from "../src/index.js";
import { DevToolsWriter } from "@ai-stats/devtools-core";
import { randomUUID } from "crypto";
import * as fs from "fs";

const TEST_DIR = `.ai-stats-devtools-test-${randomUUID()}`;

describe("DevTools Integration", () => {
  let client: AIStats;
  let writer: DevToolsWriter;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }

    // Create client with devtools enabled
    client = new AIStats({
      apiKey: process.env.AI_STATS_API_KEY || "test-key",
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 100
      }
    });

    writer = new DevToolsWriter(TEST_DIR);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("captures chat completion request", async () => {
    try {
      await client.generateText({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }]
      });
    } catch {
      // Expected to fail without real API key
    }

    // Wait for flush
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check that telemetry was captured
    const entries = writer.readEntries();
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0];
    expect(entry.type).toBe("chat.completions");
    expect(entry.request.model).toBe("gpt-4");
    expect(entry.request.messages).toHaveLength(1);
    expect(entry.metadata.sdk).toBe("typescript");
  });

  test("respects enabled flag", () => {
    const disabledClient = new AIStats({
      apiKey: "test-key",
      devtools: {
        enabled: false,
        directory: TEST_DIR
      }
    });

    // Directory should not be created when disabled
    expect(fs.existsSync(TEST_DIR)).toBe(false);
  });
});
