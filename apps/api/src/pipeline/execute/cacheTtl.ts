// Purpose: Remove a cache-breakpoint `ttl` the serving provider does not accept for the model.
// Why: Amazon Bedrock and Google Vertex AI support only the 5-minute cache on older Claude
//      models. Bedrock: "For models that support only the 5-minute TTL, omit the ttl field.
//      Including the field for these models can result in a ValidationException"
//      (https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html). Vertex:
//      "The one-hour TTL isn't supported" for Claude 3.7 Sonnet, 3.5 Sonnet v2, 3.5 Sonnet and
//      3 Opus (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/prompt-caching).
//      Inference.net documents breakpoints with no ttl, and Moonshot's request-level ttl
//      must be one its route is priced for (both below).
// How: Runs per provider attempt next to dropUnsupportedParams. The breakpoints stay, with the
//      provider's default 5-minute lifetime. A dropped 1-hour TTL changes what is cached and
//      what it costs, so it is reported like any other dropped parameter, as `cache_control.ttl`.

import type { IRCacheControl, IRChatRequest, IRContentPart, IRMessage, IRTool, IRToolResult } from "@core/ir";
import { acceptsBlockCacheControl } from "@executors/_shared/text-generate/openai-compat/prompt-cache-policy";
import type { DroppedParam } from "./unsupportedParams";

const FIVE_MINUTE_ONLY_PROVIDERS = new Set(["amazon-bedrock", "google-vertex", "google-vertex-eu"]);

// Claude 3.7 Sonnet, 3.5 Sonnet (v1 and v2) and 3 Opus, in gateway, Bedrock and Vertex spellings
// (anthropic/claude-3.7-sonnet, anthropic.claude-3-7-sonnet-20250219-v1:0, claude-3-5-sonnet-v2@20241022).
const FIVE_MINUTE_ONLY_MODEL = /claude-3[-.](?:7|5)-sonnet|claude-3-opus/i;

// Inference.net documents block cache_control as `{ "type": "ephemeral" }` with no ttl on
// its Claude and Gemini model pages (https://inference.net/models/claude-opus-5/), so a
// ttl is never sent there and the writes are 5-minute writes.
const NO_TTL_CACHE_CONTROL_PROVIDERS = new Set(["inference-net"]);

/** Whether the provider serves this model with the 5-minute cache only. */
export function cacheTtlUnsupported(providerId: string, models: Array<string | null | undefined>): boolean {
	if (NO_TTL_CACHE_CONTROL_PROVIDERS.has(providerId)) return acceptsBlockCacheControl(providerId, models);
	if (!FIVE_MINUTE_ONLY_PROVIDERS.has(providerId)) return false;
	return models.some((model) => typeof model === "string" && FIVE_MINUTE_ONLY_MODEL.test(model));
}

// Moonshot: "prompt_cache_options: mode: only implicit. ttl: 5m (default) or 1h"
// (https://platform.kimi.ai/docs/api/chat), and "For K3 series models, cache writes are
// billed separately by TTL (5min / 1h)" (https://platform.kimi.ai/docs/pricing/chat-k3).
const PROMPT_CACHE_OPTIONS_TTL_PROVIDERS = new Set(["moonshotai"]);
const ONE_HOUR_WRITE_METER = "cached_write_text_tokens_1h";

/**
 * Keeps Moonshot's `prompt_cache_options` to what Moonshot documents: mode `implicit` and
 * ttl `5m` or `1h`. A `1h` ttl is sent only to a route whose price card has a 1-hour write
 * row, so the writes are billed at the 1-hour rate; elsewhere the 5-minute default applies.
 * Each removal is reported as a dropped parameter.
 */
export function dropUnsupportedPromptCacheOptions(
	ir: IRChatRequest,
	providerId: string,
	pricingCard?: { rules?: Array<{ meter?: string }> } | null,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	const options = ir.promptCacheOptions;
	if (!PROMPT_CACHE_OPTIONS_TTL_PROVIDERS.has(providerId) || !options || typeof options !== "object") {
		return { ir, dropped: [] };
	}
	const next: Record<string, any> = { ...options };
	const params: string[] = [];
	if (next.mode !== undefined && next.mode !== "implicit") {
		delete next.mode;
		params.push("prompt_cache_options.mode");
	}
	if (next.ttl !== undefined) {
		const ttl = String(next.ttl ?? "").trim().toLowerCase();
		const oneHourPriced = (pricingCard?.rules ?? []).some((rule) => rule.meter === ONE_HOUR_WRITE_METER);
		if (ttl === "5m" || (ttl === "1h" && oneHourPriced)) {
			next.ttl = ttl;
		} else {
			delete next.ttl;
			params.push("prompt_cache_options.ttl");
		}
	}
	if (params.length === 0 && next.ttl === options.ttl) return { ir, dropped: [] };
	return {
		ir: { ...ir, promptCacheOptions: next as IRChatRequest["promptCacheOptions"] },
		dropped: params.map((param): DroppedParam => ({
			param,
			reason: "value_not_supported",
			source: "provider_api",
			clientSent: true,
		})),
	};
}

type Removal = { removed: boolean; longer: boolean };

function withoutTtl<T extends { ttl?: unknown }>(control: T | undefined, removal: Removal): T | undefined {
	if (!control || typeof control !== "object" || !("ttl" in control)) return control;
	const { ttl, ...rest } = control;
	removal.removed = true;
	if (String(ttl ?? "").trim().toLowerCase() !== "5m") removal.longer = true;
	return rest as T;
}

function stripPart(part: IRContentPart, removal: Removal): IRContentPart {
	if (part.type === "provider_block") {
		const block = part.block?.cache_control ? { ...part.block, cache_control: withoutTtl(part.block.cache_control, removal) } : part.block;
		return block === part.block ? part : { ...part, block };
	}
	const cacheControl = (part as { cacheControl?: IRCacheControl }).cacheControl;
	if (!cacheControl || !("ttl" in cacheControl)) return part;
	return { ...part, cacheControl: withoutTtl(cacheControl, removal) } as IRContentPart;
}

function stripToolResult(result: IRToolResult, removal: Removal): IRToolResult {
	const cacheControl = withoutTtl(result.cacheControl, removal);
	const parts = result.parts?.map((part) => stripPart(part, removal));
	return { ...result, ...(result.cacheControl ? { cacheControl } : {}), ...(parts ? { parts } : {}) };
}

function stripTool(tool: IRTool, removal: Removal): IRTool {
	if (!tool.cacheControl && !tool.raw?.cache_control) return tool;
	return {
		...tool,
		...(tool.cacheControl ? { cacheControl: withoutTtl(tool.cacheControl, removal) } : {}),
		...(tool.raw?.cache_control ? { raw: { ...tool.raw, cache_control: withoutTtl(tool.raw.cache_control, removal) } } : {}),
	};
}

function stripMessage(message: IRMessage, removal: Removal): IRMessage {
	if (message.role === "tool") {
		return { ...message, toolResults: message.toolResults.map((result) => stripToolResult(result, removal)) };
	}
	return { ...message, content: message.content.map((part) => stripPart(part, removal)) } as IRMessage;
}

/**
 * Removes every cache-breakpoint `ttl` from a request for a provider and Claude model that
 * accept only the 5-minute cache. Reports `cache_control.ttl` when a longer TTL was removed;
 * removing an explicit `5m` changes nothing. Returns the request unchanged (same object) when
 * the provider accepts TTLs or the request names none.
 */
export function dropUnsupportedCacheTtl(
	ir: IRChatRequest,
	providerId: string,
	models: Array<string | null | undefined>,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	if (!cacheTtlUnsupported(providerId, [ir.model, ...models])) return { ir, dropped: [] };
	const removal: Removal = { removed: false, longer: false };
	const next: IRChatRequest = {
		...ir,
		messages: ir.messages.map((message) => stripMessage(message, removal)),
		...(ir.tools ? { tools: ir.tools.map((tool) => stripTool(tool, removal)) } : {}),
		...(ir.anthropicCacheControl ? { anthropicCacheControl: withoutTtl(ir.anthropicCacheControl, removal) } : {}),
	};
	if (!removal.removed) return { ir, dropped: [] };
	return {
		ir: next,
		dropped: removal.longer
			? [{ param: "cache_control.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true }]
			: [],
	};
}
