// Purpose: Resolve prompt-cache token counts and how they relate to input tokens.
// Why: Providers name cache reads and writes differently. OpenAI-style providers count both
//      inside input tokens; Anthropic reports them on top of input. Billing, client usage and
//      observability must agree on one reading, whether or not the request hit the cache.
// How: One resolver, shared by the usage normalisers, client usage shaping and the pricing engine.

import { pickFirstFiniteNumber } from "./usage-normalization";

/** Cache-read aliases. Order matters: internal meters first, then provider shapes. */
export const CACHED_READ_TOKEN_PATHS = [
	"cached_read_text_tokens",
	"cache_read_input_tokens",
	"cached_tokens",
	"prompt_cache_hit_tokens",
	"cachedInputTokens",
	"cachedContentTokenCount",
	"input_tokens_details.cached_tokens",
	"input_details.cached_tokens",
	"prompt_tokens_details.cached_tokens",
	"cached_input_tokens",
] as const;

/** Cache-write aliases nested in input details: these count inside input tokens. */
const NESTED_CACHED_WRITE_TOKEN_PATHS = [
	"input_tokens_details.cache_write_tokens",
	"prompt_tokens_details.cache_write_tokens",
	"input_details.cache_write_tokens",
	"input_tokens_details.cache_creation_input_tokens",
	"prompt_tokens_details.cache_creation_input_tokens",
	"input_tokens_details.cache_creation_tokens",
	"prompt_tokens_details.cache_creation_tokens",
] as const;

/** Cache-write aliases. Order matters: internal meters first, then provider shapes. */
export const CACHED_WRITE_TOKEN_PATHS = [
	"cached_write_text_tokens",
	"cache_creation_input_tokens",
	...NESTED_CACHED_WRITE_TOKEN_PATHS,
	"cache_write_tokens",
	"_ext.cachedWriteTokens",
	// Legacy gateway shape: writes reported under output details.
	"output_tokens_details.cached_tokens",
	"completion_tokens_details.cached_tokens",
] as const;

export const CACHED_WRITE_5M_TOKEN_PATHS = [
	"cached_write_text_tokens_5m",
	"_ext.cachedWriteTokens5m",
	"cache_creation.ephemeral_5m_input_tokens",
	"cache_creation_5m_input_tokens",
	"cache_creation_ephemeral_5m_input_tokens",
] as const;

export const CACHED_WRITE_1H_TOKEN_PATHS = [
	"cached_write_text_tokens_1h",
	"_ext.cachedWriteTokens1h",
	"cache_creation.ephemeral_1h_input_tokens",
	"cache_creation_1h_input_tokens",
	"cache_creation_ephemeral_1h_input_tokens",
] as const;

const NESTED_CACHED_READ_TOKEN_PATHS = [
	"input_tokens_details.cached_tokens",
	"input_details.cached_tokens",
	"prompt_tokens_details.cached_tokens",
] as const;

// OpenAI-compatible top-level read fields (DeepSeek, SiliconFlow, StepFun, Gemini): all count
// inside prompt tokens.
const SUBSET_TOP_LEVEL_READ_PATHS = [
	"cached_tokens",
	"prompt_cache_hit_tokens",
	"cached_input_tokens",
	"cachedContentTokenCount",
] as const;

function explicitBoolean(usage: any, snake: string, camel: string): boolean | undefined {
	const value = usage?.[snake] ?? usage?.[camel];
	return typeof value === "boolean" ? value : undefined;
}

function hasNumber(usage: any, paths: readonly string[]): boolean {
	return typeof pickFirstFiniteNumber(usage, [...paths]) === "number";
}

export type CacheTokenUsage = {
	readTokens?: number;
	writeTokens?: number;
	write5mTokens?: number;
	write1hTokens?: number;
	/** Cache reads are already counted inside the reported input tokens. */
	readSubset: boolean;
	/** Cache writes are already counted inside the reported input tokens. */
	writeSubset: boolean;
};

export type ResolveCacheTokenUsageOptions = {
	/** Read semantics when nothing in the payload says otherwise. */
	readSubsetDefault?: boolean;
};

/**
 * Read cache token counts and decide whether they sit inside `inputTokens`.
 *
 * Explicit hints (`cached_read_tokens_are_subset_of_input`,
 * `cached_write_tokens_are_subset_of_input`) win. Otherwise the payload shape decides:
 * counts nested in input/prompt details are part of input (OpenAI, Azure, Kimi, Alibaba,
 * Venice); Anthropic's top-level `cache_read_input_tokens` / `cache_creation_input_tokens`
 * are additive. A subset reading that would exceed the reported input is impossible, so it
 * falls back to additive.
 */
export function resolveCacheTokenUsage(
	usage: any,
	inputTokens: number,
	options?: ResolveCacheTokenUsageOptions,
): CacheTokenUsage {
	if (!usage || typeof usage !== "object") return { readSubset: false, writeSubset: false };

	const readTokens = pickFirstFiniteNumber(usage, [...CACHED_READ_TOKEN_PATHS]);
	const write5mTokens = pickFirstFiniteNumber(usage, [...CACHED_WRITE_5M_TOKEN_PATHS]);
	const write1hTokens = pickFirstFiniteNumber(usage, [...CACHED_WRITE_1H_TOKEN_PATHS]);
	let writeTokens = pickFirstFiniteNumber(usage, [...CACHED_WRITE_TOKEN_PATHS]);
	if (typeof writeTokens !== "number" && (typeof write5mTokens === "number" || typeof write1hTokens === "number")) {
		writeTokens = (write5mTokens ?? 0) + (write1hTokens ?? 0);
	}

	const explicitRead = explicitBoolean(usage, "cached_read_tokens_are_subset_of_input", "cachedReadTokensAreSubsetOfInput");
	let readSubset: boolean;
	if (typeof explicitRead === "boolean") readSubset = explicitRead;
	else if (hasNumber(usage, NESTED_CACHED_READ_TOKEN_PATHS)) readSubset = true;
	else if (typeof usage.cache_read_input_tokens === "number") readSubset = false;
	else if (hasNumber(usage, SUBSET_TOP_LEVEL_READ_PATHS)) readSubset = true;
	else readSubset = options?.readSubsetDefault ?? false;

	const explicitWrite = explicitBoolean(usage, "cached_write_tokens_are_subset_of_input", "cachedWriteTokensAreSubsetOfInput");
	let writeSubset: boolean;
	if (typeof explicitWrite === "boolean") writeSubset = explicitWrite;
	else if (hasNumber(usage, NESTED_CACHED_WRITE_TOKEN_PATHS)) writeSubset = true;
	else if (typeof usage.cache_creation_input_tokens === "number") writeSubset = false;
	else writeSubset = typeof usage.cache_write_tokens === "number";

	const read = Math.max(0, readTokens ?? 0);
	const write = Math.max(0, writeTokens ?? 0);
	const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
	if (writeSubset && write > 0 && input < (readSubset ? read : 0) + write) writeSubset = false;
	if (readSubset && read > 0 && input < read) readSubset = false;

	return { readTokens, writeTokens, write5mTokens, write1hTokens, readSubset, writeSubset };
}

/** Input tokens that were neither read from nor written to the cache. */
export function uncachedInputTokens(inputTokens: number, cache: CacheTokenUsage): number {
	const read = cache.readSubset ? Math.max(0, cache.readTokens ?? 0) : 0;
	const write = cache.writeSubset ? Math.max(0, cache.writeTokens ?? 0) : 0;
	return Math.max(0, inputTokens - read - write);
}

export type OpenAIStyleCacheUsage = {
	/** Uncached input + cache reads + cache writes. */
	inputTokens: number;
	totalTokens: number;
	readTokens?: number;
	writeTokens?: number;
	write5mTokens?: number;
	write1hTokens?: number;
};

/**
 * Restate IR usage in OpenAI terms for the OpenAI-shaped encoders (Chat, Responses).
 * IR keeps each provider's own input semantics plus the subset hints; this applies them.
 */
export function irUsageToOpenAIStyle(usage: {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cachedInputTokens?: number;
	cachedReadTokensAreSubsetOfInput?: boolean;
	cachedWriteTokensAreSubsetOfInput?: boolean;
	_ext?: { cachedWriteTokens?: number; cachedWriteTokens5m?: number; cachedWriteTokens1h?: number };
}): OpenAIStyleCacheUsage {
	const input = Number.isFinite(usage.inputTokens) ? Number(usage.inputTokens) : 0;
	const cache = resolveCacheTokenUsage(
		{
			cachedInputTokens: usage.cachedInputTokens,
			cachedReadTokensAreSubsetOfInput: usage.cachedReadTokensAreSubsetOfInput,
			cachedWriteTokensAreSubsetOfInput: usage.cachedWriteTokensAreSubsetOfInput,
			_ext: usage._ext,
		},
		input,
		{ readSubsetDefault: true },
	);
	const inputTokens = totalInputTokens(input, cache);
	const output = Number.isFinite(usage.outputTokens) ? Number(usage.outputTokens) : 0;
	const reportedTotal = Number.isFinite(usage.totalTokens) ? Number(usage.totalTokens) : input + output;
	return {
		inputTokens,
		totalTokens: reportedTotal + (inputTokens - input),
		readTokens: cache.readTokens,
		writeTokens: cache.writeTokens,
		write5mTokens: cache.write5mTokens,
		write1hTokens: cache.write1hTokens,
	};
}

export type AnthropicStyleCacheUsage = {
	/** Input that was neither read from nor written to the cache. */
	inputTokens: number;
	readTokens?: number;
	writeTokens?: number;
	write5mTokens?: number;
	write1hTokens?: number;
};

/**
 * Restate IR usage in Anthropic terms for the Messages encoder: input excludes cache reads
 * and writes, which are reported beside it.
 */
export function irUsageToAnthropicStyle(usage: Parameters<typeof irUsageToOpenAIStyle>[0]): AnthropicStyleCacheUsage {
	const input = Number.isFinite(usage.inputTokens) ? Number(usage.inputTokens) : 0;
	const cache = resolveCacheTokenUsage(
		{
			cachedInputTokens: usage.cachedInputTokens,
			cachedReadTokensAreSubsetOfInput: usage.cachedReadTokensAreSubsetOfInput,
			cachedWriteTokensAreSubsetOfInput: usage.cachedWriteTokensAreSubsetOfInput,
			_ext: usage._ext,
		},
		input,
		{ readSubsetDefault: true },
	);
	return {
		inputTokens: uncachedInputTokens(input, cache),
		readTokens: cache.readTokens,
		writeTokens: cache.writeTokens,
		write5mTokens: cache.write5mTokens,
		write1hTokens: cache.write1hTokens,
	};
}

export type ReportedCacheTokens = {
	readTokens?: number;
	writeTokens?: number;
	write5mTokens?: number;
	write1hTokens?: number;
};

function pricedLines(usage: any): any[] | null {
	const lines = usage?.pricing?.lines ?? usage?.pricing_breakdown?.lines;
	return Array.isArray(lines) && lines.length > 0 ? lines : null;
}

/**
 * Cache tokens for observability, taken from the priced meters when the usage carries a
 * pricing breakdown (what the customer was billed for), otherwise from the usage fields.
 */
export function reportedCacheTokens(usage: any): ReportedCacheTokens {
	if (!usage || typeof usage !== "object") return {};
	const lines = pricedLines(usage);
	if (lines) {
		const sum = (predicate: (dimension: string) => boolean): number | undefined => {
			const matching = lines.filter((line) => predicate(String(line?.dimension ?? "")));
			if (matching.length === 0) return undefined;
			return matching.reduce((total, line) => total + (Number(line?.quantity) || 0), 0);
		};
		const read = sum((dimension) => dimension.startsWith("cached_read_") || dimension === "implicit_cached_input_text_tokens");
		const write5m = sum((dimension) => dimension === "cached_write_text_tokens_5m");
		const write1h = sum((dimension) => dimension === "cached_write_text_tokens_1h");
		const aggregateWrite = sum((dimension) => dimension.startsWith("cached_write_") && !/_(5m|1h)$/.test(dimension));
		const write = aggregateWrite ?? (write5m !== undefined || write1h !== undefined ? (write5m ?? 0) + (write1h ?? 0) : undefined);
		if (read !== undefined || write !== undefined) {
			return { readTokens: read, writeTokens: write, write5mTokens: write5m, write1hTokens: write1h };
		}
	}
	const input = pickFirstFiniteNumber(usage, ["input_tokens", "prompt_tokens"]) ?? 0;
	const cache = resolveCacheTokenUsage(usage, input, { readSubsetDefault: true });
	return {
		readTokens: cache.readTokens,
		writeTokens: cache.writeTokens,
		write5mTokens: cache.write5mTokens,
		write1hTokens: cache.write1hTokens,
	};
}

/** Total prompt size in OpenAI terms: uncached + cache reads + cache writes. */
export function totalInputTokens(inputTokens: number, cache: CacheTokenUsage): number {
	return uncachedInputTokens(inputTokens, cache) + Math.max(0, cache.readTokens ?? 0) + Math.max(0, cache.writeTokens ?? 0);
}
