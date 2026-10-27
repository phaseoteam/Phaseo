import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyServerToolPlugins } from "./server-tool-plugins";
import { applyResponsePlugins, findUnknownGatewayPluginIds } from "./registry";
import { normalizeGatewayPlugins } from "./normalize";
import {
	attachServerToolUsageToRawUsage,
	buildServerToolContinuation,
	prepareServerToolsForTextRequest,
} from "@pipeline/surfaces/server-tools";
import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

function expand(endpoint: any, body: any, plugins: unknown) {
	return applyServerToolPlugins({ endpoint, body, plugins: normalizeGatewayPlugins(plugins) });
}

describe("web and web-fetch plugins", () => {
	it("are known plugin ids, while other ids stay unknown", () => {
		expect(findUnknownGatewayPluginIds(normalizeGatewayPlugins([
			{ id: "web" },
			{ id: "web-fetch" },
			{ id: "response-healing" },
			{ id: "file-parser" },
		]))).toEqual(["file-parser"]);
	});

	it("are not reported as unknown response plugins after the response", () => {
		const result = applyResponsePlugins({
			ctx: { plugins: normalizeGatewayPlugins([{ id: "web" }, { id: "web-fetch" }]) } as any,
			result: {} as any,
			payload: { ok: true },
			finishReason: "stop",
		});
		expect(result).toEqual({ payload: { ok: true }, executions: [] });
	});

	it("turns the web plugin into phaseo:web_search with its documented options", () => {
		const result = expand("chat.completions", {
			model: "anthropic/claude-sonnet-4-5",
			messages: [{ role: "user", content: "news?" }],
			tools: [{ type: "function", function: { name: "lookup", parameters: {} } }],
		}, [{
			id: "web",
			engine: "Parallel",
			max_results: 3,
			max_uses: 2,
			search_context_size: "high",
			include_domains: ["example.com"],
			exclude_domains: ["spam.example"],
			search_prompt: "ignored: no equivalent",
		}]);

		expect(result).toEqual({
			ok: true,
			addedTools: ["phaseo:web_search"],
			body: expect.objectContaining({
				tools: [
					{ type: "function", function: { name: "lookup", parameters: {} } },
					{
						type: "phaseo:web_search",
						parameters: {
							engine: "parallel",
							max_results: 3,
							max_uses: 2,
							search_context_size: "high",
							allowed_domains: ["example.com"],
							excluded_domains: ["spam.example"],
						},
					},
				],
			}),
		});
	});

	it("turns the web-fetch plugin into phaseo:web_fetch", () => {
		const result = expand("responses", { model: "google/gemini-3-flash", input: "read it" }, [{
			id: "web-fetch",
			config: { max_uses: 1, max_content_tokens: 5000, allowed_domains: ["docs.example.com"], blocked_domains: ["x.example"] },
		}]);

		expect(result.ok && result.body.tools).toEqual([{
			type: "phaseo:web_fetch",
			parameters: {
				max_uses: 1,
				max_content_tokens: 5000,
				allowed_domains: ["docs.example.com"],
				blocked_domains: ["x.example"],
			},
		}]);
	});

	it("adds nothing when the request already has a search tool, or the plugin is disabled", () => {
		const body = { model: "openai/gpt-5", input: "hi", tools: [{ type: "phaseo:web_search" }] };
		expect(expand("responses", body, [{ id: "web" }])).toEqual({ ok: true, body, addedTools: [] });
		const hosted = { model: "openai/gpt-5", input: "hi", tools: [{ type: "web_search" }] };
		expect(expand("responses", hosted, [{ id: "web" }])).toEqual({ ok: true, body: hosted, addedTools: [] });
		const plain = { model: "openai/gpt-5", input: "hi" };
		expect(expand("responses", plain, [{ id: "web", enabled: false }])).toEqual({ ok: true, body: plain, addedTools: [] });
		expect(expand("embeddings", plain, [{ id: "web" }])).toEqual({ ok: true, body: plain, addedTools: [] });
	});

	it("rejects option values the server tool would not accept", () => {
		expect(expand("messages", { model: "m", messages: [] }, [{ id: "web", engine: "bing" }])).toEqual({
			ok: false,
			pluginId: "web",
			field: "engine",
			message: expect.stringContaining("engine must be one of"),
		});
		expect(expand("messages", { model: "m", messages: [] }, [{ id: "web", max_results: 50 }])).toMatchObject({
			ok: false,
			field: "max_results",
		});
	});
});

describe("plugin-driven web search billing", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({ EXA_API_KEY: "exa_test_key", EXA_BASE_URL: "https://api.exa.ai" });
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			requestId: "exa_req",
			results: [
				{ title: "One", url: "https://example.com/1", highlights: ["a"] },
				{ title: "Two", url: "https://example.com/2", highlights: ["b"] },
			],
		}), { status: 200, headers: { "Content-Type": "application/json" } })));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const searchCard: PriceCard = {
		provider: "gateway",
		model: "gateway/server-tools",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [{
			pricing_plan: "standard",
			meter: "server_tool_web_search_requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: "0.005",
			currency: "USD",
			match: [],
			priority: 100,
		}],
	};

	async function billFor(body: any) {
		const prepared = prepareServerToolsForTextRequest(body, "openai.chat.completions");
		if (!prepared.ok) throw new Error(prepared.message);
		const continuation = await buildServerToolContinuation({
			choices: [{
				message: {
					role: "assistant",
					content: [],
					toolCalls: [{ id: "call_1", name: "phaseo_web_search", arguments: JSON.stringify({ query: "latest" }) }],
				},
				finishReason: "tool_calls",
			}],
		} as any, prepared.config);
		const usage = attachServerToolUsageToRawUsage({ prompt_tokens: 10 }, continuation!.usage);
		return { prepared, usage, bill: computeBill(usage, searchCard, {}, "standard") };
	}

	it("prepares, meters and prices exactly like a phaseo:web_search tool", async () => {
		const base = { model: "anthropic/claude-sonnet-4-5", messages: [{ role: "user", content: "news?" }] };
		const plugin = expand("chat.completions", base, [{ id: "web", max_results: 2, engine: "exa" }]);
		if (!plugin.ok) throw new Error(plugin.message);

		const viaPlugin = await billFor(plugin.body);
		const viaTool = await billFor({
			...base,
			tools: [{ type: "phaseo:web_search", parameters: { max_results: 2, engine: "exa" } }],
		});

		expect(viaPlugin.prepared).toEqual(viaTool.prepared);
		expect(viaPlugin.usage).toEqual(viaTool.usage);
		expect(viaPlugin.usage).toMatchObject({ server_tool_web_search_requests: 1 });
		expect(viaPlugin.bill.pricing.total_nanos).toBe(5_000_000);
		expect(viaPlugin.bill.pricing).toEqual(viaTool.bill.pricing);
	});
});
