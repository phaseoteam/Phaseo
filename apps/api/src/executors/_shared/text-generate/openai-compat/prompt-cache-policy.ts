// Purpose: Send prompt-cache and identity fields only to upstreams that document them.
// Why: OpenAI-only cache fields reached every OpenAI-compatible provider (Azure
//      returns 400 before GPT-5.6), Anthropic-style `cache_control` never reached
//      GPT-5.6, and hints some providers reject were sent anyway.
// How: Runs at the end of irToOpenAIChat / irToOpenAIResponses, before provider
//      quirks, and rewrites the built request in place.

import type { IRCacheControl } from "@core/ir";
import { resolveTextProviderParamPolicyOverride } from "@providers/textProfiles";
import { isTwelveHourCacheTtl, openAIBreakpointTtl, supportsOpenAIPromptCacheOptions } from "./prompt-cache-ttl";

const OPENAI_CACHE_PROVIDERS = new Set(["openai", "openai-eu", "azure"]);

// OpenAI-compatible upstreams whose docs accept Anthropic-style `cache_control`
// on content blocks:
// - Alibaba Model Studio: https://www.alibabacloud.com/help/en/model-studio/context-cache
// - Venice: https://docs.venice.ai/api-reference/api-spec
// - OpenRouter: https://openrouter.ai/docs/guides/best-practices/prompt-caching
const CACHE_CONTROL_PROVIDERS = new Set(["alibaba", "alibaba-cloud", "qwen", "venice", "openrouter"]);

// DeepInfra documents `prompt_cache_breakpoint` and `prompt_cache_options`
// (`{ mode: "explicit", ttl: "5m" | "1h" }`) and ignores them on models without
// support: https://docs.deepinfra.com/chat/prompt-cache-retention
const OPENAI_STYLE_BREAKPOINT_PROVIDERS = new Set(["deepinfra"]);

// Request fields that are hints, not instructions. They are removed when the
// provider's profile marks them unsupported, instead of costing the provider
// its place in routing.
// Breakpoint lifetimes per upstream: OpenAI documents "30m" and "12h" on
// prompt_cache_breakpoint (GPT-5.6+, Responses). Azure and DeepInfra document
// breakpoints without one.
const OPENAI_BREAKPOINT_TTLS: ReadonlySet<string> = new Set(["30m", "12h"]);
const NO_BREAKPOINT_TTLS: ReadonlySet<string> = new Set();

const DROPPABLE_HINT_FIELDS = [
	"prompt_cache_key",
	"prompt_cache_retention",
	"prompt_cache_options",
	"safety_identifier",
	"user",
	"session_id",
] as const;

type PromptCachePolicyArgs = {
	providerId?: string | null;
	model?: string | null;
	irModel?: string | null;
};

/**
 * OpenAI documents explicit breakpoints and `prompt_cache_options` for GPT-5.6
 * and later, and `prompt_cache_retention` for earlier models only
 * (https://developers.openai.com/api/docs/guides/prompt-caching). Azure runs
 * the same models, and its deployment name need not contain the model, so the
 * gateway model id is checked too.
 */
function supportsExplicitOpenAIBreakpoints(args: PromptCachePolicyArgs): boolean {
	return supportsOpenAIPromptCacheOptions(args.model, args.irModel);
}

type MarkMode = "openai-explicit" | "openai-implicit" | "openai-style" | "cache-control" | "none";

function stripPartMarks(
	part: any,
	mode: MarkMode,
	/** Breakpoint lifetimes the upstream documents; any other ttl is removed. */
	breakpointTtls: ReadonlySet<string> = NO_BREAKPOINT_TTLS,
): boolean {
	if (!part || typeof part !== "object") return false;
	const hadBreakpoint = "prompt_cache_breakpoint" in part;
	const hadCacheControl = "cache_control" in part;
	if (!hadBreakpoint && !hadCacheControl) return false;
	if (mode === "openai-explicit" || mode === "openai-style") {
		// Block cache_control is the provider-neutral spelling of a breakpoint.
		if (hadBreakpoint || (mode === "openai-explicit" && hadCacheControl)) {
			// A breakpoint keeps its own lifetime where the upstream documents it. An
			// Anthropic-style cache_control ttl ("5m", "1h") is never carried over.
			const ttl = hadBreakpoint ? openAIBreakpointTtl(part.prompt_cache_breakpoint?.ttl) : undefined;
			part.prompt_cache_breakpoint = {
				mode: "explicit",
				...(ttl && breakpointTtls.has(ttl) ? { ttl } : {}),
			};
		}
		delete part.cache_control;
	} else if (mode === "cache-control") {
		delete part.prompt_cache_breakpoint;
	} else {
		delete part.prompt_cache_breakpoint;
		delete part.cache_control;
	}
	return true;
}

/**
 * When marks were stripped from content that would otherwise have been a plain
 * string, send the string again so the prompt bytes match an unmarked request.
 */
function collapseTextParts(content: any[]): string | any[] {
	const allText = content.every((part) =>
		part && typeof part === "object" && (part.type === "text" || part.type === "input_text")
		&& typeof part.text === "string" && Object.keys(part).length === 2);
	return allText ? content.map((part) => part.text).join("") : content;
}

function applyToContent(
	content: unknown,
	mode: MarkMode,
	collapse: boolean,
	breakpointTtls?: ReadonlySet<string>,
): unknown {
	if (!Array.isArray(content)) return content;
	let changed = false;
	for (const part of content) changed = stripPartMarks(part, mode, breakpointTtls) || changed;
	return changed && collapse ? collapseTextParts(content) : content;
}

/**
 * Serialize an IR cache mark the way the text serializers do. The field policy
 * below then keeps, converts or strips it for the target upstream.
 */
export function cacheMarkFields(cacheControl: IRCacheControl | undefined): Record<string, unknown> {
	if (!cacheControl) return {};
	return cacheControl.type === "prompt_cache_breakpoint"
		? { prompt_cache_breakpoint: promptCacheBreakpointValue(cacheControl) }
		: { cache_control: cacheControl };
}

/** OpenAI's `prompt_cache_breakpoint` object for an IR breakpoint mark, keeping its lifetime. */
export function promptCacheBreakpointValue(cacheControl: IRCacheControl): Record<string, unknown> {
	return {
		mode: cacheControl.mode,
		...(typeof cacheControl.ttl === "string" && cacheControl.ttl ? { ttl: cacheControl.ttl } : {}),
	};
}

export function applyPromptCacheFieldPolicy(request: Record<string, any>, args: PromptCachePolicyArgs): void {
	const providerId = String(args.providerId ?? "").toLowerCase();
	const openAIFamily = OPENAI_CACHE_PROVIDERS.has(providerId);
	const explicit = openAIFamily && supportsExplicitOpenAIBreakpoints(args);
	const breakpointTtls = providerId === "openai" || providerId === "openai-eu" ? OPENAI_BREAKPOINT_TTLS : NO_BREAKPOINT_TTLS;
	const mode: MarkMode = openAIFamily
		? (explicit ? "openai-explicit" : "openai-implicit")
		: OPENAI_STYLE_BREAKPOINT_PROVIDERS.has(providerId)
			? "openai-style"
			: CACHE_CONTROL_PROVIDERS.has(providerId) ? "cache-control" : "none";

	for (const message of Array.isArray(request.messages) ? request.messages : []) {
		if (!message || typeof message !== "object") continue;
		// User content with several parts was always an array; other roles and
		// single-part user content were strings unless they carried a mark.
		const collapse = message.role !== "user" || (Array.isArray(message.content) && message.content.length === 1);
		message.content = applyToContent(message.content, mode, collapse, breakpointTtls);
	}
	const items = Array.isArray(request.input) ? request.input : Array.isArray(request.input_items) ? request.input_items : [];
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		if (Array.isArray(item.content)) applyToContent(item.content, mode, false, breakpointTtls);
		if (Array.isArray(item.output)) item.output = applyToContent(item.output, mode, true, breakpointTtls);
	}
	// OpenAI does not accept breakpoints on tool definitions; only providers that
	// take Anthropic-style cache_control keep a tool mark.
	for (const tool of Array.isArray(request.tools) ? request.tools : []) {
		if (!tool || typeof tool !== "object") continue;
		delete tool.prompt_cache_breakpoint;
		if (mode !== "cache-control") delete tool.cache_control;
	}

	if (openAIFamily) {
		if (explicit) delete request.prompt_cache_retention;
		else delete request.prompt_cache_options;
		// Azure documents only the "30m" request lifetime.
		if (providerId === "azure" && isTwelveHourCacheTtl(request.prompt_cache_options?.ttl)) {
			const { ttl: _ttl, ...options } = request.prompt_cache_options;
			request.prompt_cache_options = options;
		}
	} else if (mode !== "openai-style") {
		delete request.prompt_cache_options;
		delete request.prompt_cache_retention;
	} else {
		delete request.prompt_cache_retention;
	}

	if (providerId) {
		// stream_options is not a hint, but a client value must not reach a
		// provider whose profile rejects it either.
		for (const field of [...DROPPABLE_HINT_FIELDS, "stream_options"]) {
			if (!(field in request)) continue;
			const supported = resolveTextProviderParamPolicyOverride({ providerId, paramPathCandidates: [field] });
			if (supported === false) delete request[field];
		}
	}
}

/** Whether the provider profile allows `stream_options` on Chat requests. */
export function providerAcceptsStreamOptions(providerId: string | null | undefined): boolean {
	if (!providerId) return true;
	return resolveTextProviderParamPolicyOverride({ providerId, paramPathCandidates: ["stream_options"] }) !== false;
}
