// Purpose: Remove a cache-breakpoint `ttl` the serving provider does not accept for the model.
// Why: Amazon Bedrock and Google Vertex AI support only the 5-minute cache on older Claude
//      models. Bedrock: "For models that support only the 5-minute TTL, omit the ttl field.
//      Including the field for these models can result in a ValidationException"
//      (https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html). Vertex:
//      "The one-hour TTL isn't supported" for Claude 3.7 Sonnet, 3.5 Sonnet v2, 3.5 Sonnet and
//      3 Opus (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/prompt-caching).
// How: Runs per provider attempt next to dropUnsupportedParams. The breakpoints stay, with the
//      provider's default 5-minute lifetime. A dropped 1-hour TTL changes what is cached and
//      what it costs, so it is reported like any other dropped parameter, as `cache_control.ttl`.

import type { IRCacheControl, IRChatRequest, IRContentPart, IRMessage, IRTool, IRToolResult } from "@core/ir";
import type { DroppedParam } from "./unsupportedParams";

const FIVE_MINUTE_ONLY_PROVIDERS = new Set(["amazon-bedrock", "google-vertex", "google-vertex-eu"]);

// Claude 3.7 Sonnet, 3.5 Sonnet (v1 and v2) and 3 Opus, in gateway, Bedrock and Vertex spellings
// (anthropic/claude-3.7-sonnet, anthropic.claude-3-7-sonnet-20250219-v1:0, claude-3-5-sonnet-v2@20241022).
const FIVE_MINUTE_ONLY_MODEL = /claude-3[-.](?:7|5)-sonnet|claude-3-opus/i;

/** Whether the provider serves this Claude model with the 5-minute cache only. */
export function cacheTtlUnsupported(providerId: string, models: Array<string | null | undefined>): boolean {
	if (!FIVE_MINUTE_ONLY_PROVIDERS.has(providerId)) return false;
	return models.some((model) => typeof model === "string" && FIVE_MINUTE_ONLY_MODEL.test(model));
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
