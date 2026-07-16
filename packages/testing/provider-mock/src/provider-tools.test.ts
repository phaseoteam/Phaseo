import { afterEach, describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { ProviderContractRegistry } from "./registry.js";
import { ProviderMockServer } from "./server.js";
import { registerAnthropicProvider } from "./providers/anthropic.js";
import { registerGoogleAIStudioProvider } from "./providers/google-ai-studio.js";
import { registerXAIProvider } from "./providers/openai.js";

const servers: ProviderMockServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop())); });

describe("provider tool contracts", () => {
  it("registers complete Anthropic, Google AI Studio, and xAI overlays", async () => {
    const contracts = await Promise.all(["anthropic", "google-ai-studio", "x-ai"].map(loadBundledProviderContract));
    const registry = new ProviderContractRegistry();
    contracts.forEach((contract) => registry.register(contract));
    expect(registry.providers()).toEqual(["anthropic", "google-ai-studio", "x-ai"]);
    expect(registry.coverage()).toEqual([]);
  });

  it.each([
    ["anthropic", registerAnthropicProvider, "/v1/messages", { model: "claude-sonnet-4-5", max_tokens: 32, messages: [{ role: "user", content: "weather" }], tools: [{ name: "lookup_weather", input_schema: { type: "object" } }] }, "tool_use"],
    ["google-ai-studio", registerGoogleAIStudioProvider, "/v1beta/models/gemini-2.5-flash:generateContent", { contents: [{ role: "user", parts: [{ text: "weather" }] }], tools: [{ functionDeclarations: [{ name: "lookup_weather", parameters: { type: "object" } }] }] }, "functionCall"],
    ["x-ai", registerXAIProvider, "/v1/responses", { model: "grok-4", input: "weather", tools: [{ type: "function", name: "lookup_weather", parameters: { type: "object" } }] }, "function_call"],
  ])("validates and responds to %s tool requests", async (providerId, register, path, body, responseMarker) => {
    const server = new ProviderMockServer();
    servers.push(server);
    register(server, await loadBundledProviderContract(providerId));
    await server.start();
    const response = await fetch(`${server.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    expect(text).toContain(responseMarker);
    expect(server.getLastRequest()?.validationIssues).toEqual([]);
  });
});
