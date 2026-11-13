import { describe, expect, it, vi } from "vitest";
import { resolveHostedTools } from "./hostedTools";
import { deepSeekRunsNativeWebSearch, isDeepSeekWebToolModel } from "@core/nativeTools";

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ EXA_API_KEY: "exa_test_key" }),
}));

function candidate(providerId: string, providerModelSlug: string | null = null): any {
	return { providerId, providerModelSlug };
}

const FLASH_ROUTES = [candidate("deepseek", "deepseek-flash"), candidate("nebius-token-factory", "deepseek-ai/DeepSeek-V4.1-Flash-1017")];

describe("DeepSeek native web search routing", () => {
	it("keeps DeepSeek for hosted web search on Flash and drops routes without native search", () => {
		const body = { model: "deepseek/deepseek-v4.1-flash-1017", messages: [], tools: [{ type: "web_search" }] };
		const result = resolveHostedTools({ endpoint: "chat.completions", body, providers: FLASH_ROUTES });
		expect(result).toEqual({
			ok: true,
			body,
			providers: [FLASH_ROUTES[0]],
			droppedProviderIds: ["nebius-token-factory"],
			webSearchMapped: false,
		});
	});

	it("treats phaseo:web_search with engine native the same way", () => {
		const body = {
			model: "deepseek/deepseek-v4.1-flash-1017",
			input: "hi",
			tools: [{ type: "phaseo:web_search", parameters: { engine: "native" } }],
		};
		const result = resolveHostedTools({ endpoint: "responses", body, providers: FLASH_ROUTES });
		expect(result.ok && result.providers.map((p) => p.providerId)).toEqual(["deepseek"]);
		expect(result.ok && result.webSearchMapped).toBe(false);
	});

	it("falls back to gateway search when the request also has function tools", () => {
		const body = {
			model: "deepseek/deepseek-v4.1-flash-1017",
			messages: [],
			tools: [
				{ type: "web_search" },
				{ type: "function", function: { name: "lookup", parameters: { type: "object" } } },
			],
		};
		const result = resolveHostedTools({ endpoint: "chat.completions", body, providers: FLASH_ROUTES });
		expect(result.ok && result.webSearchMapped).toBe(true);
		expect(result.ok && result.providers).toEqual(FLASH_ROUTES);
		expect(result.ok && result.body.tools[0]).toEqual({ type: "phaseo:web_search" });
	});

	it("falls back to gateway search when the search filters domains", () => {
		const body = {
			model: "deepseek/deepseek-v4.1-flash-1017",
			messages: [],
			tools: [{ type: "web_search", filters: { allowed_domains: ["example.com"] } }],
		};
		const result = resolveHostedTools({ endpoint: "chat.completions", body, providers: FLASH_ROUTES });
		expect(result.ok && result.webSearchMapped).toBe(true);
		expect(result.ok && result.body.tools[0]).toEqual({
			type: "phaseo:web_search",
			parameters: { allowed_domains: ["example.com"] },
		});
	});

	it("does not treat DeepSeek V4 Pro as running native search", () => {
		const body = { model: "deepseek/deepseek-v4-pro-0813", messages: [], tools: [{ type: "web_search" }] };
		const result = resolveHostedTools({
			endpoint: "chat.completions",
			body,
			providers: [candidate("deepseek", "deepseek-v4-pro")],
		});
		expect(result.ok && result.webSearchMapped).toBe(true);
	});

	it("never lets DeepSeek claim the other OpenAI hosted tools", () => {
		const result = resolveHostedTools({
			endpoint: "responses",
			body: { model: "deepseek/deepseek-v4.1-flash-1017", input: "hi", tools: [{ type: "code_interpreter" }] },
			providers: [candidate("deepseek", "deepseek-flash")],
		});
		expect(result).toEqual({ ok: false, unsupportedTools: [{ type: "code_interpreter", index: 0 }] });
	});
});

describe("isDeepSeekWebToolModel", () => {
	it("matches the Flash API names", () => {
		for (const id of ["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "deepseek/deepseek-v4.1-flash-1017"]) {
			expect(isDeepSeekWebToolModel(id)).toBe(true);
		}
		for (const id of ["deepseek-v4-pro", "deepseek-chat", "deepseek-flashy", null]) {
			expect(isDeepSeekWebToolModel(id)).toBe(false);
		}
	});

	it("rejects searches with domain filters in either place", () => {
		expect(deepSeekRunsNativeWebSearch({ model: "deepseek-flash", tool: { type: "web_search" } })).toBe(true);
		expect(deepSeekRunsNativeWebSearch({
			model: "deepseek-flash",
			tool: { type: "phaseo:web_search", parameters: { engine: "native", excluded_domains: ["a.com"] } },
		})).toBe(false);
	});
});
