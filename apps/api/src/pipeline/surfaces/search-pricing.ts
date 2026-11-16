// Purpose: What one managed web search, research run or page fetch costs Phaseo.
// Why: Each engine and mode is billed to the customer at exactly what its provider bills Phaseo,
// not one flat rate for every engine.
// How: The provider's own reported cost when its response carries one (Exa `costDollars`),
// otherwise the provider's published list price for that call. Prices read 2026-11-16 from:
// Exa https://exa.ai/pricing, Parallel https://docs.parallel.ai/getting-started/pricing,
// Perplexity https://docs.perplexity.ai/getting-started/pricing,
// DeepSeek https://api-docs.deepseek.com/quick_start/pricing.
// Firecrawl bills in plan credits and TinyFish and direct fetches are free; neither is priced here.

import type { ServerToolPricing } from "@core/types";

const NANOS_PER_USD = 1_000_000_000;
/** $1 per 1,000. */
const PER_THOUSAND_1 = 1_000_000;

export const EXA_SEARCH_MODES = ["lite", "auto", "deep-lite", "deep"] as const;
export const EXA_RESEARCH_MODES = ["agent-minimal", "agent-low"] as const;
export const PARALLEL_SEARCH_MODES = ["turbo", "fast", "basic", "advanced"] as const;
export const PARALLEL_RESEARCH_MODES = ["task-lite", "task-base"] as const;
export const PERPLEXITY_SEARCH_MODES = ["standard", "fast"] as const;

/** Modes each engine accepts; an engine missing here takes none. The first is its default. */
export const WEB_SEARCH_MODES: Record<string, readonly string[]> = {
	exa: [...EXA_SEARCH_MODES, ...EXA_RESEARCH_MODES],
	parallel: [...PARALLEL_SEARCH_MODES, ...PARALLEL_RESEARCH_MODES],
	perplexity: PERPLEXITY_SEARCH_MODES,
};

/** The mode an engine runs when none is set: the provider's own default. */
export const DEFAULT_WEB_SEARCH_MODE: Record<string, string> = {
	exa: "auto",
	parallel: "advanced",
	perplexity: "standard",
};

// Exa: lite $4, auto $7, deep-lite and deep $12 per 1,000 searches of up to 10 results; each
// result past 10 is $1 per 1,000; contents are $1 per 1,000 pages per content type.
const EXA_SEARCH_NANOS: Record<string, number> = { lite: 4_000_000, auto: 7_000_000, "deep-lite": 12_000_000, deep: 12_000_000 };
// Exa Agent fixed efforts: minimal $0.012, low $0.025 per run.
const EXA_AGENT_NANOS: Record<string, number> = { "agent-minimal": 12_000_000, "agent-low": 25_000_000 };
// Parallel Search: turbo and fast $1, basic and advanced $5 per 1,000 requests with 10 results
// included, then $1 per 1,000 results. Task API: lite $5, base $10 per 1,000 completed runs.
const PARALLEL_SEARCH_NANOS: Record<string, number> = { turbo: 1_000_000, fast: 1_000_000, basic: 5_000_000, advanced: 5_000_000 };
const PARALLEL_TASK_NANOS: Record<string, number> = { "task-lite": 5_000_000, "task-base": 10_000_000 };
// Perplexity Search: $5 per 1,000 requests, Fast Search $1, billed for every successful request.
const PERPLEXITY_SEARCH_NANOS: Record<string, number> = { standard: 5_000_000, fast: 1_000_000 };
// DeepSeek Search and Fetch: $0.75 per 1,000, billed only for a 200 that returns a result.
const DEEPSEEK_TOOL_NANOS = 750_000;

/** One billed provider call: what the customer is charged, and where the figure came from. */
export type SearchCharge = {
	kind: "search" | "fetch";
	engine: string;
	mode: string | null;
	nanos: number;
	/** `provider_reported` when the provider's response gave the cost, else `list_price`. */
	source: "provider_reported" | "list_price";
};

function listPrice(kind: SearchCharge["kind"], engine: string, mode: string | null, nanos: number): SearchCharge {
	return { kind, engine, mode, nanos, source: "list_price" };
}

/** A provider-reported USD amount in nanos, or null when it is missing or not a valid amount. */
export function reportedUsdNanos(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	const nanos = Math.round(value * NANOS_PER_USD);
	return Number.isSafeInteger(nanos) ? nanos : null;
}

export function exaSearchCharge(args: {
	mode: string;
	results: number;
	contentTypes: number;
	costDollars?: unknown;
}): SearchCharge {
	const reported = reportedUsdNanos((args.costDollars as { total?: unknown } | undefined)?.total);
	if (reported !== null) return { kind: "search", engine: "exa", mode: args.mode, nanos: reported, source: "provider_reported" };
	const base = EXA_SEARCH_NANOS[args.mode] ?? EXA_SEARCH_NANOS.auto;
	const extra = Math.max(0, args.results - 10) * PER_THOUSAND_1;
	const contents = Math.max(0, args.results) * Math.max(0, args.contentTypes) * PER_THOUSAND_1;
	return listPrice("search", "exa", args.mode, base + extra + contents);
}

export function exaAgentCharge(mode: string, costDollars?: unknown): SearchCharge {
	const reported = reportedUsdNanos((costDollars as { total?: unknown } | undefined)?.total);
	if (reported !== null) return { kind: "search", engine: "exa", mode, nanos: reported, source: "provider_reported" };
	return listPrice("search", "exa", mode, EXA_AGENT_NANOS[mode] ?? 0);
}

export function exaContentsCharge(pages: number, costDollars?: unknown): SearchCharge {
	const reported = reportedUsdNanos((costDollars as { total?: unknown } | undefined)?.total);
	if (reported !== null) return { kind: "fetch", engine: "exa", mode: null, nanos: reported, source: "provider_reported" };
	return listPrice("fetch", "exa", null, Math.max(0, pages) * PER_THOUSAND_1);
}

export function parallelSearchCharge(mode: string, results: number): SearchCharge {
	const base = PARALLEL_SEARCH_NANOS[mode] ?? PARALLEL_SEARCH_NANOS.advanced;
	return listPrice("search", "parallel", mode, base + Math.max(0, results - 10) * PER_THOUSAND_1);
}

export function parallelTaskCharge(mode: string): SearchCharge {
	return listPrice("search", "parallel", mode, PARALLEL_TASK_NANOS[mode] ?? 0);
}

export function parallelExtractCharge(urls: number): SearchCharge {
	return listPrice("fetch", "parallel", null, Math.max(0, urls) * PER_THOUSAND_1);
}

export function perplexitySearchCharge(mode: string): SearchCharge {
	return listPrice("search", "perplexity", mode, PERPLEXITY_SEARCH_NANOS[mode] ?? PERPLEXITY_SEARCH_NANOS.standard);
}

export function deepSeekToolCharge(kind: SearchCharge["kind"]): SearchCharge {
	return listPrice(kind, "deepseek", null, DEEPSEEK_TOOL_NANOS);
}

/** The request-level charge for a round's billed searches and fetches, in the server-tool pricing shape. */
export function searchChargesToPricing(charges: readonly SearchCharge[]): ServerToolPricing | null {
	const billed = charges.filter((charge) => charge.nanos > 0);
	if (billed.length === 0) return null;
	const lines = billed.map((charge) => ({
		dimension: charge.kind === "search" ? "server_tool_web_search_requests" : "server_tool_web_fetch_requests",
		component: charge.kind === "search" ? "web_search" : "web_fetch",
		engine: charge.engine,
		...(charge.mode ? { mode: charge.mode } : {}),
		quantity: 1,
		billable_units: 1,
		unit_size: 1,
		unit_price_usd: String(charge.nanos / NANOS_PER_USD),
		line_cost_usd: String(charge.nanos / NANOS_PER_USD),
		line_nanos: charge.nanos,
		price_source: charge.source,
	}));
	return {
		component: "web_search",
		model: "phaseo/web-search",
		provider: billed.length === 1 ? billed[0].engine : "multiple",
		total_nanos: billed.reduce((sum, charge) => sum + charge.nanos, 0),
		key_source: "gateway",
		lines,
	};
}
