import { describe, expect, it, vi } from "vitest";
import {
	EXTERNAL_CATALOGUE_SOURCES,
	listEntries,
	syncExternalCatalogueSource,
	toCatalogueModel,
	type ExternalCatalogueSource,
} from "./index";

const source = (providerSlug: string, pricing?: string): ExternalCatalogueSource => ({
	providerSlug,
	url: `https://example.test/${providerSlug}`,
	pricing,
});

// Entries below are trimmed copies of what each provider's public list returned on 2026-11-13.
describe("toCatalogueModel", () => {
	it("reads OpenRouter-style lists (per-token prices, top_provider limits)", () => {
		expect(toCatalogueModel(source("kilo", "kilo"), {
			id: "anthropic/claude-sonnet-5.5",
			pricing: { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000001", input_cache_write: "0.0000025" },
			context_length: 1000000,
			top_provider: { context_length: 1000000, max_completion_tokens: 128000 },
		})).toEqual({
			id: "anthropic/claude-sonnet-5.5",
			context_length: 1000000,
			max_output_tokens: 128000,
			meters: { cached_read_text_tokens: 0.1, cached_write_text_tokens: 2.5, input_text_tokens: 2, output_text_tokens: 10 },
		});
	});

	it("reads Requesty's per-token fields", () => {
		expect(toCatalogueModel(source("requesty", "requesty"), {
			id: "vertex/gemini-4-hydrogen@eu",
			input_price: 0.00000165,
			cached_price: 8.25e-8,
			output_price: 0.00000825,
			pricing: [{ prompt_tokens_threshold: 0 }],
			context_window: 1048576,
			max_output_tokens: 65536,
		})?.meters).toEqual({ cached_read_text_tokens: 0.0825, input_text_tokens: 1.65, output_text_tokens: 8.25 });
	});

	it("reads NanoGPT's per-million prices and per-thousand cache rates", () => {
		expect(toCatalogueModel(source("nano-gpt", "nano-gpt"), {
			id: "anthropic/claude-sonnet-5.5",
			pricing: { prompt: 2, completion: 10, cacheReadInputPer1kTokens: 0.0001, cacheWriteInputPer1kTokens: 0.0025, currency: "USD", unit: "per_million_tokens" },
			context_length: 1000000,
			max_output_tokens: 128000,
		})?.meters).toEqual({ cached_read_text_tokens: 0.1, cached_write_text_tokens: 2.5, input_text_tokens: 2, output_text_tokens: 10 });
	});

	it("reads CrossModel's micro-dollar tiers, but only a single tier", () => {
		const entry = {
			id: "anthropic/claude-fable-5-2",
			pricing: { tiers: [{ threshold: 0, input_micro_per_1m: 8000000, output_micro_per_1m: 40000000, cache_read_micro_per_1m: 200000, cache_creation_micro_per_1m: 10000000 }] },
			context_window_tokens: 1000000,
			max_output_tokens: 128000,
		};
		expect(toCatalogueModel(source("crossmodel", "crossmodel"), entry)?.meters).toEqual({
			cached_read_text_tokens: 0.2, cached_write_text_tokens: 10, input_text_tokens: 8, output_text_tokens: 40,
		});
		const tiered = { ...entry, pricing: { tiers: [entry.pricing.tiers[0], { ...entry.pricing.tiers[0], threshold: 200000 }] } };
		expect(toCatalogueModel(source("crossmodel", "crossmodel"), tiered)?.meters).toBeNull();
	});

	it("reads Abacus's per-token rates", () => {
		expect(toCatalogueModel(source("abacus", "abacus"), {
			id: "claude-sonnet-5-5", input_token_rate: "0.000002", output_token_rate: "0.00001", cached_input_token_rate: "0.0000001",
			context_length: 1000000, max_completion_tokens: 128000,
		})).toEqual({
			id: "claude-sonnet-5-5", context_length: 1000000, max_output_tokens: 128000,
			meters: { cached_read_text_tokens: 0.1, input_text_tokens: 2, output_text_tokens: 10 },
		});
	});

	it("drops an output limit larger than the context window", () => {
		expect(toCatalogueModel(source("qiniu-ai"), { id: "meituan/longcat-flash-lite", context_length: 256000, max_tokens: 320000 }))
			.toEqual({ id: "meituan/longcat-flash-lite", context_length: 256000, max_output_tokens: null, meters: null });
	});

	it("skips entries without an id", () => {
		expect(toCatalogueModel(source("vultr"), { name: "no id" })).toBeNull();
	});
});

describe("listEntries", () => {
	it("accepts bare arrays, data and models envelopes", () => {
		expect(listEntries([1])).toEqual([1]);
		expect(listEntries({ data: [1] })).toEqual([1]);
		expect(listEntries({ models: [1] })).toEqual([1]);
		expect(listEntries({ error: "nope" })).toEqual([]);
	});
});

describe("syncExternalCatalogueSource", () => {
	const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

	it("passes parsed rows to the database function", async () => {
		const rpc = vi.fn(async () => ({ provider: "vercel", matched: 1 }));
		const result = await syncExternalCatalogueSource(source("vercel", "vercel"), {
			fetchImpl: ok({ data: [{ id: "alibaba/qwen-3-14b", pricing: { input: "0.00000012", output: "0.00000024" }, context_window: 40960, max_tokens: 16384 }] }) as unknown as typeof fetch,
			rpc,
		});
		expect(result).toEqual({ provider: "vercel", ok: true, summary: { provider: "vercel", matched: 1 } });
		expect(rpc).toHaveBeenCalledWith("vercel", [
			{ id: "alibaba/qwen-3-14b", context_length: 40960, max_output_tokens: 16384, meters: { input_text_tokens: 0.12, output_text_tokens: 0.24 } },
		]);
	});

	it("never calls the database for an empty list or an error response", async () => {
		const rpc = vi.fn();
		expect(await syncExternalCatalogueSource(source("vercel"), { fetchImpl: ok({ data: [] }) as unknown as typeof fetch, rpc }))
			.toEqual({ provider: "vercel", ok: false, error: "empty model list" });
		const failing = vi.fn(async () => new Response("down", { status: 503 }));
		expect(await syncExternalCatalogueSource(source("vercel"), { fetchImpl: failing as unknown as typeof fetch, rpc }))
			.toEqual({ provider: "vercel", ok: false, error: "HTTP 503" });
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe("EXTERNAL_CATALOGUE_SOURCES", () => {
	it("lists each provider once", () => {
		const slugs = EXTERNAL_CATALOGUE_SOURCES.map((entry) => entry.providerSlug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});
});
