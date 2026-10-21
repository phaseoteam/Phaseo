// Purpose: Price OpenAI's 30-minute and 12-hour prompt-cache writes on their own meters.
// Why: GPT-5.6 and later bill a 30-minute write at 1.25x input and a 12-hour write at 2.5x
//      input (https://developers.openai.com/api/docs/guides/prompt-caching). Billing every
//      write on the one generic meter charged 12-hour writes at half their price.
// How: The engine calls this after it has read the usage into meters. It moves the split
//      onto `cached_write_text_tokens_30m` / `_12h` and leaves the generic write meter only
//      what no lifetime row prices. Kept apart from the Anthropic 5-minute / 1-hour logic.

import type { CacheTokenUsage } from "@core/cache-usage";
import type { PriceCard } from "./types";

export const OPENAI_CACHE_WRITE_30M_METER = "cached_write_text_tokens_30m";
export const OPENAI_CACHE_WRITE_12H_METER = "cached_write_text_tokens_12h";
export const OPENAI_CACHE_WRITE_TTL_METERS = [OPENAI_CACHE_WRITE_30M_METER, OPENAI_CACHE_WRITE_12H_METER] as const;

/**
 * OpenAI's documented 12-hour write price as a multiple of input. Used when a route reports
 * 12-hour writes but its card has no `_12h` row, so those writes are never billed at the
 * cheaper generic write rate.
 */
export const OPENAI_CACHE_WRITE_12H_INPUT_MULTIPLIER = 2.5;

/** OpenAI's documented 30-minute write price as a multiple of input, for the same fallback. */
export const OPENAI_CACHE_WRITE_30M_INPUT_MULTIPLIER = 1.25;

/**
 * Splits the cache-write meters by lifetime when the usage reports OpenAI's
 * `cache_write_tokens_details`. Each write token is priced once:
 * - 12-hour writes go on `cached_write_text_tokens_12h`. With no such row on the card the
 *   engine's cache fallback prices them at input x 2.5.
 * - 30-minute writes go on `cached_write_text_tokens_30m` when the card has that row, and
 *   otherwise stay on the generic `cached_write_text_tokens` row, as before.
 * Usage with only a write total (no split) is left unchanged.
 */
export function applyOpenAICacheWriteTtlSplit(
	meters: Record<string, number>,
	card: PriceCard,
	cache: Pick<CacheTokenUsage, "writeTokens" | "write30mTokens" | "write12hTokens">,
): void {
	const reported30m = meters[OPENAI_CACHE_WRITE_30M_METER] ?? cache.write30mTokens;
	const reported12h = meters[OPENAI_CACHE_WRITE_12H_METER] ?? cache.write12hTokens;
	if (typeof reported30m !== "number" && typeof reported12h !== "number") return;

	const splitTotal = Math.max(0, reported30m ?? 0) + Math.max(0, reported12h ?? 0);
	const aggregate = meters.cached_write_text_tokens ?? cache.writeTokens;
	// The two counts sum to the write total. If a payload disagrees, the total wins so no
	// write token is billed twice; 12-hour writes are kept first.
	const total = typeof aggregate === "number" ? Math.max(0, aggregate) : splitTotal;
	const twelveHour = Math.min(Math.max(0, reported12h ?? 0), total);
	const thirtyMinute = total - twelveHour;

	delete meters[OPENAI_CACHE_WRITE_30M_METER];
	delete meters[OPENAI_CACHE_WRITE_12H_METER];
	delete meters.cached_write_text_tokens;
	if (twelveHour > 0) meters[OPENAI_CACHE_WRITE_12H_METER] = twelveHour;
	if (thirtyMinute <= 0) return;
	if (card.rules.some((rule) => rule.meter === OPENAI_CACHE_WRITE_30M_METER)) {
		meters[OPENAI_CACHE_WRITE_30M_METER] = thirtyMinute;
	} else {
		meters.cached_write_text_tokens = thirtyMinute;
	}
}
