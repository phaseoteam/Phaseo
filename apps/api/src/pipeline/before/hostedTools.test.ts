import { describe, expect, it, vi } from "vitest";
import { resolveHostedTools } from "./hostedTools";
import { prepareServerToolsForTextRequest } from "@pipeline/surfaces/server-tools";
import { decodeProtocol } from "@protocols/index";
import { isOpenAIHostedToolType } from "@core/nativeTools";

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ EXA_API_KEY: "exa_test_key" }),
}));

function candidate(providerId: string, providerModelSlug: string | null = null): any {
	return { providerId, providerModelSlug };
}

describe("resolveHostedTools", () => {
	it("leaves requests alone when every candidate runs the hosted tools", () => {
		const body = { model: "openai/gpt-5", input: "hi", tools: [{ type: "code_interpreter", container: { type: "auto" } }] };
		const result = resolveHostedTools({
			endpoint: "responses",
			body,
			providers: [candidate("openai"), candidate("openai-eu"), candidate("azure", "gpt-5")],
		});
		expect(result).toEqual({
			ok: true,
			body,
			providers: [candidate("openai"), candidate("openai-eu"), candidate("azure", "gpt-5")],
			droppedProviderIds: [],
			webSearchMapped: false,
		});
	});

	it("treats Azure Chat routes and Azure Claude deployments as non-native", () => {
		const tools = [{ type: "web_search" }];
		const chat = resolveHostedTools({
			endpoint: "chat.completions",
			body: { model: "openai/gpt-5", messages: [], tools },
			providers: [candidate("openai"), candidate("azure", "gpt-5")],
		});
		expect(chat.ok && chat.providers.map((p) => p.providerId)).toEqual(["openai"]);

		const claude = resolveHostedTools({
			endpoint: "responses",
			body: { model: "anthropic/claude-sonnet-4-5", input: "hi", tools },
			providers: [candidate("azure", "claude-sonnet-4-5")],
		});
		expect(claude.ok && claude.webSearchMapped).toBe(true);
	});

	it("lets xAI run web search, code interpreter and MCP, but not shell", () => {
		const ok = resolveHostedTools({
			endpoint: "responses",
			body: { model: "x-ai/grok-5", input: "hi", tools: [{ type: "web_search" }, { type: "mcp", server_label: "a" }] },
			providers: [candidate("x-ai")],
		});
		expect(ok.ok && ok.webSearchMapped).toBe(false);

		const shell = resolveHostedTools({
			endpoint: "responses",
			body: { model: "x-ai/grok-5", input: "hi", tools: [{ type: "shell" }] },
			providers: [candidate("x-ai")],
		});
		expect(shell).toEqual({ ok: false, unsupportedTools: [{ type: "shell", index: 0 }] });
	});

	it("treats the routed spacex-ai id as xAI", () => {
		const body = {
			model: "x-ai/grok-5",
			input: "hi",
			tools: [{ type: "web_search" }, { type: "code_interpreter", container: { type: "auto" } }],
		};
		const result = resolveHostedTools({ endpoint: "responses", body, providers: [candidate("spacex-ai")] });
		expect(result).toEqual({
			ok: true,
			body,
			providers: [candidate("spacex-ai")],
			droppedProviderIds: [],
			webSearchMapped: false,
		});
	});

	it("maps OpenAI's web search fields and keeps a single search tool", () => {
		const result = resolveHostedTools({
			endpoint: "responses",
			body: {
				model: "google/gemini-3-flash",
				input: "hi",
				tools: [
					{
						type: "web_search_2025_08_26",
						search_context_size: "high",
						filters: { allowed_domains: ["example.com"] },
						user_location: { type: "approximate", country: "GB" },
						engine: "native",
						max_results: 4,
					},
					{ type: "web_search_preview" },
					{ type: "function", name: "lookup", parameters: {} },
				],
				tool_choice: "web_search_preview",
			},
			providers: [candidate("google-ai-studio")],
		});
		expect(result.ok && result.body.tools).toEqual([
			{
				type: "phaseo:web_search",
				parameters: { search_context_size: "high", max_results: 4, allowed_domains: ["example.com"] },
			},
			{ type: "function", name: "lookup", parameters: {} },
		]);
		expect(result.ok && result.body.tool_choice).toBe("phaseo:web_search");
	});

	it("never leaves a hosted tool definition for Claude or Gemini", () => {
		for (const [endpoint, protocol, body] of [
			["responses", "openai.responses", { model: "m", input: "news?", tools: [{ type: "web_search", search_context_size: "low" }] }],
			["chat.completions", "openai.chat.completions", { model: "m", messages: [{ role: "user", content: "news?" }], tools: [{ type: "web_search_preview" }] }],
		] as const) {
			for (const providerId of ["anthropic", "google-ai-studio"]) {
				const resolved = resolveHostedTools({ endpoint, body, providers: [candidate(providerId)] });
				if (!resolved.ok) throw new Error("expected ok");
				const prepared = prepareServerToolsForTextRequest(resolved.body, protocol);
				if (!prepared.ok) throw new Error(prepared.message);
				expect(prepared.config.webSearchEnabled).toBe(true);
				const ir = decodeProtocol(protocol, prepared.body);
				expect(ir.tools?.map((tool) => tool.name)).toEqual(["phaseo_web_search"]);
				expect(ir.tools?.some((tool) => isOpenAIHostedToolType(tool.type))).toBe(false);
			}
		}
	});
});
