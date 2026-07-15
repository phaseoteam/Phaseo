import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { ProviderContractRegistry } from "./registry.js";
import { ProviderMockServer } from "./server.js";
import { registerNovitaProvider } from "./providers/novita.js";

const server = new ProviderMockServer();
const contractDir = path.resolve(import.meta.dirname, "..", "contracts", "novita");

beforeAll(async () => {
  const contract = await loadBundledProviderContract("novita");
  new ProviderContractRegistry().register(contract).assertCoverage("novita");
  registerNovitaProvider(server, contract);
  await server.start();
});

afterAll(() => server.stop());

describe("Novita Mintlify contract", () => {
  it("is reproducibly compiled from six official endpoint pages", async () => {
    const provenance = JSON.parse(await readFile(path.join(contractDir, "provenance.json"), "utf8"));
    const bundle = await readFile(path.join(contractDir, "openapi.json"));
    expect(provenance.pages).toHaveLength(6);
    expect(createHash("sha256").update(bundle).digest("hex")).toBe(provenance.bundleSha256);
  });

  it("validates Novita tools and returns deterministic tool calls", async () => {
    const response = await fetch(`${server.url}/openai/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4-pro",
        messages: [{ role: "user", content: "weather" }],
        max_tokens: 32,
        tools: [{ type: "function", function: { name: "lookup_weather", description: "Lookup weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }, strict: true } }],
        tool_choice: "required",
      }),
    });
    const payload = await response.json() as any;
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.choices[0].message.tool_calls[0].function.name).toBe("lookup_weather");
    expect(server.getLastRequest()?.validationIssues).toEqual([]);
  });
});
