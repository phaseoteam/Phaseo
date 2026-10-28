// Purpose: Decide where OpenAI's 12-hour prompt-cache lifetime may be sent.
// Why: OpenAI documents `prompt_cache_options.ttl: "12h"` and `prompt_cache_breakpoint.ttl`
//      for GPT-5.6 and later on the Responses API only, at 2.5x input per written token
//      (https://developers.openai.com/api/docs/guides/prompt-caching). Chat Completions and
//      Azure OpenAI document only "30m"
//      (https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/prompt-caching).
// How: Routing puts routes that take 12h first; a route that cannot take it gets the
//      request without it (the 30-minute default) and the removal is reported; the OpenAI
//      executor sends 12h Chat requests to Responses.

import type { IRCacheControl, IRChatRequest, IRContentPart } from "@core/ir";

export const OPENAI_TWELVE_HOUR_CACHE_TTL = "12h";

/** The breakpoint lifetimes OpenAI documents for GPT-5.6 and later. */
const OPENAI_BREAKPOINT_TTLS = new Set(["30m", "12h"]);

// Routes that run OpenAI's own Responses API. Azure is left out: its docs list only "30m".
const TWELVE_HOUR_CACHE_PROVIDERS = new Set(["openai", "openai-eu"]);

const TWELVE_HOUR_WRITE_METER = "cached_write_text_tokens_12h";

function normaliseTtl(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

export function isTwelveHourCacheTtl(value: unknown): boolean {
	return normaliseTtl(value) === OPENAI_TWELVE_HOUR_CACHE_TTL;
}

/** A breakpoint lifetime OpenAI accepts, normalised, or undefined. */
export function openAIBreakpointTtl(value: unknown): string | undefined {
	const ttl = normaliseTtl(value);
	return ttl && OPENAI_BREAKPOINT_TTLS.has(ttl) ? ttl : undefined;
}

function gptVersion(model: string | null | undefined): number | null {
	const match = /(?:^|[/.])gpt-(\d+)(?:\.(\d+))?/.exec(String(model ?? "").toLowerCase());
	if (!match) return null;
	return Number(match[1]) + Number(match[2] ?? 0) / 10;
}

/** GPT-5.6 and later: the models OpenAI documents `prompt_cache_options` for. */
export function supportsOpenAIPromptCacheOptions(...models: Array<string | null | undefined>): boolean {
	return models.some((model) => {
		const version = gptVersion(model);
		return version !== null && version >= 5.6;
	});
}

function isTwelveHourBreakpoint(mark: IRCacheControl | undefined): boolean {
	return mark?.type === "prompt_cache_breakpoint" && isTwelveHourCacheTtl(mark.ttl);
}

function partsAskForTwelveHours(parts: IRContentPart[] | undefined): boolean {
	return Array.isArray(parts) && parts.some((part) => isTwelveHourBreakpoint((part as { cacheControl?: IRCacheControl }).cacheControl));
}

/** True when the request asks for a 12-hour cache, at request level or on any breakpoint. */
export function irRequestsTwelveHourCache(ir: IRChatRequest): boolean {
	if (isTwelveHourCacheTtl(ir.promptCacheOptions?.ttl)) return true;
	for (const message of ir.messages ?? []) {
		if (message.role === "tool") {
			if (message.toolResults?.some((result) => isTwelveHourBreakpoint(result.cacheControl) || partsAskForTwelveHours(result.parts))) {
				return true;
			}
		} else if (partsAskForTwelveHours(message.content)) {
			return true;
		}
	}
	return false;
}

/**
 * Whether this route can take a 12-hour cache: OpenAI's own API, a GPT-5.6+ model, and a
 * price card with a 12-hour write row (when the card is known), so the writes are billed at
 * their published rate.
 */
export function routeSupportsTwelveHourCache(args: {
	providerId: string;
	models: Array<string | null | undefined>;
	pricingCard?: { rules?: Array<{ meter?: string }> } | null;
}): boolean {
	if (!TWELVE_HOUR_CACHE_PROVIDERS.has(String(args.providerId ?? "").toLowerCase())) return false;
	if (!supportsOpenAIPromptCacheOptions(...args.models)) return false;
	if (!args.pricingCard) return true;
	return (args.pricingCard.rules ?? []).some((rule) => rule.meter === TWELVE_HOUR_WRITE_METER);
}

function withoutTwelveHourTtl(mark: IRCacheControl): IRCacheControl {
	const { ttl: _ttl, ...rest } = mark;
	return rest;
}

function stripParts<T extends IRContentPart>(parts: T[]): { parts: T[]; changed: boolean } {
	let changed = false;
	const next = parts.map((part) => {
		const mark = (part as { cacheControl?: IRCacheControl }).cacheControl;
		if (!isTwelveHourBreakpoint(mark)) return part;
		changed = true;
		return { ...part, cacheControl: withoutTwelveHourTtl(mark!) };
	});
	return { parts: changed ? next : parts, changed };
}

/**
 * Removes the 12-hour lifetime from the request (request level and breakpoints), so the
 * route's 30-minute default applies. Returns which client fields lost it.
 */
export function stripTwelveHourCache(ir: IRChatRequest): { ir: IRChatRequest; params: string[] } {
	const params: string[] = [];
	let next = ir;
	if (isTwelveHourCacheTtl(ir.promptCacheOptions?.ttl)) {
		const { ttl: _ttl, ...options } = ir.promptCacheOptions!;
		next = { ...next, promptCacheOptions: options };
		params.push("prompt_cache_options.ttl");
	}
	let partsChanged = false;
	const messages = (ir.messages ?? []).map((message) => {
		if (message.role === "tool") {
			let changed = false;
			const toolResults = message.toolResults.map((result) => {
				const parts = result.parts ? stripParts(result.parts) : null;
				const markChanged = isTwelveHourBreakpoint(result.cacheControl);
				if (!markChanged && !parts?.changed) return result;
				changed = true;
				return {
					...result,
					...(markChanged ? { cacheControl: withoutTwelveHourTtl(result.cacheControl!) } : {}),
					...(parts?.changed ? { parts: parts.parts } : {}),
				};
			});
			if (!changed) return message;
			partsChanged = true;
			return { ...message, toolResults };
		}
		const stripped = stripParts(message.content);
		if (!stripped.changed) return message;
		partsChanged = true;
		return { ...message, content: stripped.parts } as typeof message;
	});
	if (partsChanged) {
		next = { ...next, messages };
		params.push("prompt_cache_breakpoint.ttl");
	}
	return { ir: next, params };
}
