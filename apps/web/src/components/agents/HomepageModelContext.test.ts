// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareUrl, createHomepageTools, registerHomepageTools, type ModelContextTool } from "./HomepageModelContext";

const sonnet = {
	model_id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", organisation_name: "Anthropic", status: "Available",
	gateway_status: "active", primary_date: "2026-09-28T00:00:00+00:00", context_lengths: [200000, 1000000],
	gateway_input_modalities: ["image", "text"], gateway_output_modalities: ["text"], gateway_active_provider_names: ["Anthropic"],
	gateway_tiers: ["standard"], pricing_summary: { kind: "tokens", input: 2, output: 10, unit: "1M tokens" },
	pricing_detail_rows: [{ label: "Input Text Tokens", value: "$2 / 1M tokens" }],
};
const gpt = { ...sonnet, model_id: "openai/gpt-5", name: "GPT-5", organisation_name: "OpenAI" };

function tool(name: string) {
	const found = createHomepageTools().find((item) => item.name === name);
	if (!found) throw new Error(name);
	return found;
}

afterEach(() => vi.unstubAllGlobals());

describe("homepage WebMCP tools", () => {
	it("keeps the tool count small and every tool read-only", () => {
		const tools = createHomepageTools();
		expect(tools.length).toBeGreaterThanOrEqual(4);
		expect(tools.length).toBeLessThanOrEqual(6);
		expect(tools.map((item) => item.name)).toEqual(expect.arrayContaining(["get-phaseo-discovery", "open-phaseo-models", "open-phaseo-api-docs", "open-phaseo-pricing", "search-phaseo-models", "compare-phaseo-models"]));
		for (const item of tools) expect(item.annotations?.readOnlyHint).toBe(true);
	});

	it("searches the public catalogue by name and returns compact rows", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [sonnet] })));
		vi.stubGlobal("fetch", fetchMock);
		const result = JSON.parse(await tool("search-phaseo-models").execute({ query: " claude sonnet ", limit: 99 }));
		const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
		expect(url).toContain("/api/_web/models?limit=20&");
		expect(url).toContain("search=claude%20sonnet");
		expect(result.results[0]).toMatchObject({ id: "anthropic/claude-sonnet-5.5", callable_on_phaseo: true, context_length: 1000000, released: "2026-09-28" });
		expect(result.results[0]).not.toHaveProperty("prices");
	});

	it("rejects an empty search", async () => {
		await expect(tool("search-phaseo-models").execute({ query: "  " })).rejects.toThrow("query is required");
	});

	it("compares known models and reports unknown ids", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ models: [sonnet, gpt] }))));
		const result = JSON.parse(await tool("compare-phaseo-models").execute({ model_ids: ["openai/gpt-5", "anthropic/claude-sonnet-5.5", "acme/none"] }));
		expect(result.models.map((model: { id: string }) => model.id)).toEqual(["openai/gpt-5", "anthropic/claude-sonnet-5.5"]);
		expect(result.models[0].prices).toEqual([{ label: "Input Text Tokens", value: "$2 / 1M tokens" }]);
		expect(result.not_found).toEqual(["acme/none"]);
		expect(result.compare_url).toBe(compareUrl(["openai/gpt-5", "anthropic/claude-sonnet-5.5", "acme/none"]));
		expect(result.compare_url).toContain("/compare?models=openai_gpt-5&models=anthropic_claude-sonnet-5.5");
	});

	it("reads later catalogue pages before reporting a model as not found", async () => {
		const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("offset=0&")
			? { models: [sonnet], total: 2001 }
			: { models: [gpt], total: 2001 })));
		vi.stubGlobal("fetch", fetchMock);
		const result = JSON.parse(await tool("compare-phaseo-models").execute({ model_ids: ["anthropic/claude-sonnet-5.5", "openai/gpt-5"] }));
		expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
			expect.stringContaining("limit=2000&offset=0&"),
			expect.stringContaining("limit=2000&offset=2000&"),
		]);
		expect(result.not_found).toEqual([]);
		expect(result.models).toHaveLength(2);
	});

	it("needs two to four distinct ids to compare", async () => {
		await expect(tool("compare-phaseo-models").execute({ model_ids: ["a/b", "a/b"] })).rejects.toThrow("2 to 4");
		await expect(tool("compare-phaseo-models").execute({ model_ids: ["a/1", "a/2", "a/3", "a/4", "a/5"] })).rejects.toThrow("2 to 4");
	});
});

describe("WebMCP registration", () => {
	const tools: ModelContextTool[] = [{ name: "t", description: "d", execute: async () => "ok" }];

	it("prefers document.modelContext.registerTool and unregisters through the signal", () => {
		const registerTool = vi.fn((_tool: ModelContextTool, _options?: { signal?: AbortSignal }) => Promise.resolve());
		const provideContext = vi.fn();
		const cleanup = registerHomepageTools(tools, { modelContext: { registerTool } } as unknown as Document, { modelContext: { provideContext } } as unknown as Navigator);
		expect(registerTool).toHaveBeenCalledTimes(1);
		expect(provideContext).not.toHaveBeenCalled();
		const signal = registerTool.mock.calls[0]?.[1]?.signal;
		expect(signal?.aborted).toBe(false);
		cleanup();
		expect(signal?.aborted).toBe(true);
	});

	it("keeps registering after one tool is rejected", () => {
		const registerTool = vi.fn().mockImplementationOnce(() => { throw new Error("duplicate"); }).mockResolvedValue(undefined);
		registerHomepageTools([...tools, { ...tools[0]!, name: "u" }], { modelContext: { registerTool } } as unknown as Document, {} as Navigator);
		expect(registerTool).toHaveBeenCalledTimes(2);
	});

	it("falls back to navigator.modelContext.provideContext with MCP text content", async () => {
		const provideContext = vi.fn();
		const clearContext = vi.fn();
		const cleanup = registerHomepageTools(tools, {} as Document, { modelContext: { provideContext, clearContext } } as unknown as Navigator);
		const provided = provideContext.mock.calls[0]?.[0] as { tools: { execute: (input: Record<string, unknown>) => Promise<unknown> }[] };
		await expect(provided.tools[0]!.execute({})).resolves.toEqual({ content: [{ type: "text", text: "ok" }] });
		cleanup();
		expect(clearContext).toHaveBeenCalled();
	});

	it("does nothing without WebMCP", () => {
		expect(() => registerHomepageTools(tools, {} as Document, {} as Navigator)()).not.toThrow();
	});
});
