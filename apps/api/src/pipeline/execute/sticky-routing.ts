// Purpose: Cache-aware routing hints.
// Why: Prefer providers that recently served cached responses for the same request context.
// How: Store short-lived (5 min) provider hints in KV keyed by team+endpoint+model+context hash.

import type { Endpoint } from "@core/types";
import { getJson, putJson } from "@/core/kv";

const STICKY_PREFIX = "gateway:routing:sticky";
const STICKY_TTL_SECONDS = 300; // 5 minutes
const CONTEXT_HASH_VERSION = "v2-opening-anchors";
const CACHE_AWARE_ROUTING_ENDPOINTS = new Set<Endpoint>([
    "responses",
    "chat.completions",
    "messages",
]);

export type StickyRoutingEntry = {
    providerId: string;
    cachedReadTokens: number;
    contextKey: string;
    source: "prompt_cache_key" | "context_hash";
    createdAt: string;
};

export type StickyRoutingContext = {
    key: string;
    source: "prompt_cache_key" | "context_hash";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    return Object.prototype.toString.call(value) === "[object Object]";
}

function stableStringify(value: unknown): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function pickFirstBoolean(values: unknown[]): boolean | null {
    for (const value of values) {
        if (typeof value === "boolean") return value;
    }
    return null;
}

function pickFirstString(values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        return trimmed;
    }
    return null;
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number" || typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.some((entry) => hasMeaningfulValue(entry));
    if (isPlainObject(value)) return Object.values(value).some((entry) => hasMeaningfulValue(entry));
    return false;
}

function sanitizeString(value: unknown, maxLength = 1024): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeContentForHash(content: unknown): unknown {
    const asString = sanitizeString(content);
    if (asString) return asString;

    if (Array.isArray(content)) {
        const parts = content
            .map((part) => normalizeContentForHash(part))
            .filter((part) => hasMeaningfulValue(part));
        if (!parts.length) return null;
        return parts.slice(0, 8);
    }

    if (!isPlainObject(content)) return null;

    const part = content as Record<string, unknown>;
    const type = sanitizeString(part.type);
    const role = sanitizeString(part.role);
    const text = sanitizeString(part.text);
    const url = sanitizeString(
        (part as any)?.image_url?.url ??
        (part as any)?.source?.url ??
        (part as any)?.url,
    );

    if (text || url || type || role) {
        return {
            ...(role ? { role } : {}),
            ...(type ? { type } : {}),
            ...(text ? { text } : {}),
            ...(url ? { url } : {}),
        };
    }

    if ("content" in part) {
        return normalizeContentForHash(part.content);
    }

    return null;
}

function extractAnchorsFromMessages(messages: unknown): {
    firstSystemOrDeveloper: unknown;
    firstUserOrNonSystem: unknown;
} {
    if (!Array.isArray(messages)) {
        return {
            firstSystemOrDeveloper: null,
            firstUserOrNonSystem: null,
        };
    }

    let firstSystemOrDeveloper: unknown = null;
    let firstUserOrNonSystem: unknown = null;

    for (const message of messages) {
        if (!isPlainObject(message)) continue;
        const role = sanitizeString((message as any).role)?.toLowerCase();
        const content = normalizeContentForHash((message as any).content);

        if (!firstSystemOrDeveloper && (role === "system" || role === "developer")) {
            firstSystemOrDeveloper = content;
        }
        if (!firstUserOrNonSystem && role === "user") {
            firstUserOrNonSystem = content;
        }
    }

    if (!firstUserOrNonSystem) {
        for (const message of messages) {
            if (!isPlainObject(message)) continue;
            const role = sanitizeString((message as any).role)?.toLowerCase();
            if (role === "system" || role === "developer") continue;
            const content = normalizeContentForHash((message as any).content);
            if (hasMeaningfulValue(content)) {
                firstUserOrNonSystem = content;
                break;
            }
        }
    }

    return { firstSystemOrDeveloper, firstUserOrNonSystem };
}

function extractResponsesAnchors(body: any): {
    firstSystemOrDeveloper: unknown;
    firstUserOrNonSystem: unknown;
} {
    const instructionAnchor = normalizeContentForHash(body?.instructions ?? body?.system);
    let firstSystemOrDeveloper = hasMeaningfulValue(instructionAnchor)
        ? instructionAnchor
        : null;
    let firstUserOrNonSystem: unknown = null;

    const input = body?.input_items ?? body?.input;
    if (typeof input === "string") {
        firstUserOrNonSystem = sanitizeString(input);
    } else if (Array.isArray(input)) {
        for (const item of input) {
            if (!isPlainObject(item)) continue;
            const type = sanitizeString((item as any).type)?.toLowerCase();
            const role = sanitizeString((item as any).role)?.toLowerCase();

            if ((type === "message" || role) && hasMeaningfulValue((item as any).content)) {
                const content = normalizeContentForHash((item as any).content);
                if (!firstSystemOrDeveloper && (role === "system" || role === "developer")) {
                    firstSystemOrDeveloper = content;
                }
                if (!firstUserOrNonSystem && role === "user") {
                    firstUserOrNonSystem = content;
                }
                continue;
            }

            if (!firstUserOrNonSystem && type && type.startsWith("input_")) {
                const normalized = normalizeContentForHash(item);
                if (hasMeaningfulValue(normalized)) {
                    firstUserOrNonSystem = normalized;
                }
            }
        }
    }

    if (!firstUserOrNonSystem && Array.isArray(body?.messages)) {
        const fromMessages = extractAnchorsFromMessages(body.messages);
        if (!firstSystemOrDeveloper && hasMeaningfulValue(fromMessages.firstSystemOrDeveloper)) {
            firstSystemOrDeveloper = fromMessages.firstSystemOrDeveloper;
        }
        if (hasMeaningfulValue(fromMessages.firstUserOrNonSystem)) {
            firstUserOrNonSystem = fromMessages.firstUserOrNonSystem;
        }
    }

    return { firstSystemOrDeveloper, firstUserOrNonSystem };
}

function extractCacheHints(body: any): Record<string, unknown> {
    const providerOptions = body?.provider_options ?? body?.providerOptions;
    const openaiOptions = providerOptions?.openai ?? {};
    const anthropicOptions = providerOptions?.anthropic ?? {};
    const googleOptions = providerOptions?.google ?? {};
    const xaiOptions = providerOptions?.xai ?? providerOptions?.["x-ai"] ?? {};

    return {
        prompt_cache_retention:
            body?.prompt_cache_retention ??
            body?.promptCacheRetention ??
            openaiOptions?.prompt_cache_retention ??
            openaiOptions?.promptCacheRetention ??
            body?.cache_control?.ttl ??
            body?.cacheControl?.ttl ??
            null,
        cache_control:
            body?.cache_control ??
            body?.cacheControl ??
            anthropicOptions?.cache_control ??
            anthropicOptions?.cacheControl ??
            googleOptions?.cache_control ??
            googleOptions?.cacheControl ??
            null,
        cached_content:
            body?.cached_content ??
            body?.cachedContent ??
            googleOptions?.cached_content ??
            googleOptions?.cachedContent ??
            null,
        cache_ttl:
            googleOptions?.cache_ttl ??
            googleOptions?.cacheTtl ??
            null,
        conversation_id:
            body?.conversation_id ??
            body?.conversationId ??
            xaiOptions?.conversation_id ??
            xaiOptions?.conversationId ??
            null,
    };
}

function buildContextInput(body: any, endpoint: Endpoint): Record<string, unknown> {
    const fromMessages = extractAnchorsFromMessages(body?.messages);
    const fromResponses = extractResponsesAnchors(body);

    const explicitSystem = normalizeContentForHash(body?.system);

    const opening = endpoint === "responses"
        ? fromResponses
        : {
            firstSystemOrDeveloper:
                hasMeaningfulValue(explicitSystem)
                    ? explicitSystem
                    : fromMessages.firstSystemOrDeveloper,
            firstUserOrNonSystem: fromMessages.firstUserOrNonSystem,
        };

    return {
        opening,
        cache_hints: extractCacheHints(body),
    };
}

export function isCacheAwareRoutingEndpoint(endpoint: Endpoint): boolean {
    return CACHE_AWARE_ROUTING_ENDPOINTS.has(endpoint);
}

export function resolveCacheAwareRoutingPreference(body: any, fallback = true): boolean {
    const provider = body?.provider;
    const routing = body?.routing;
    const explicit = pickFirstBoolean([
        provider?.prefer_cache,
        provider?.preferCache,
        provider?.cache_aware_routing,
        provider?.cacheAwareRouting,
        provider?.prefer_cache_routing,
        provider?.preferCacheRouting,
        routing?.prefer_cache,
        routing?.preferCache,
        routing?.cache_aware,
        routing?.cacheAware,
    ]);
    if (explicit !== null) return explicit;
    return fallback;
}

export async function resolveStickyRoutingContext(args: {
    endpoint: Endpoint;
    body: any;
}): Promise<StickyRoutingContext | null> {
    if (!isCacheAwareRoutingEndpoint(args.endpoint)) return null;

    const explicitPromptCacheKey = pickFirstString([
        args.body?.prompt_cache_key,
        args.body?.promptCacheKey,
    ]);
    if (explicitPromptCacheKey) {
        const digest = await sha256Hex(`prompt-cache-key:${explicitPromptCacheKey}`);
        return {
            key: `prompt:${digest}`,
            source: "prompt_cache_key",
        };
    }

    const contextInput = buildContextInput(args.body, args.endpoint);
    if (!hasMeaningfulValue(contextInput)) return null;

    const serialized = stableStringify(contextInput);
    const digest = await sha256Hex(`sticky-context:${CONTEXT_HASH_VERSION}:${args.endpoint}:${serialized}`);
    return {
        key: `context:${digest}`,
        source: "context_hash",
    };
}

export function buildStickyRoutingKey(
    teamId: string,
    endpoint: Endpoint,
    model: string,
    contextKey: string
) {
    return `${STICKY_PREFIX}:${teamId}:${endpoint}:${model}:${contextKey}`;
}

export async function readStickyRouting(
    teamId: string,
    endpoint: Endpoint,
    model: string,
    contextKey: string
): Promise<StickyRoutingEntry | null> {
    const key = buildStickyRoutingKey(teamId, endpoint, model, contextKey);
    return await getJson<StickyRoutingEntry>(key);
}

export async function writeStickyRouting(
    teamId: string,
    endpoint: Endpoint,
    model: string,
    context: StickyRoutingContext,
    providerId: string,
    cachedReadTokens: number
): Promise<void> {
    const key = buildStickyRoutingKey(teamId, endpoint, model, context.key);
    const payload: StickyRoutingEntry = {
        providerId,
        cachedReadTokens,
        contextKey: context.key,
        source: context.source,
        createdAt: new Date().toISOString(),
    };
    await putJson(key, payload, STICKY_TTL_SECONDS);
}

export async function maybeWriteStickyRoutingFromUsage(args: {
    teamId: string;
    endpoint: Endpoint;
    model: string;
    body: any;
    providerId: string;
    usage: any;
    enabled?: boolean;
}): Promise<void> {
    if (!isCacheAwareRoutingEndpoint(args.endpoint)) return;
    if (args.enabled === false) return;

    const context = await resolveStickyRoutingContext({ endpoint: args.endpoint, body: args.body });
    if (!context) return;

    const cachedReadTokens = extractCachedReadTokens(args.usage);
    if (cachedReadTokens === null) return;

    await writeStickyRouting(
        args.teamId,
        args.endpoint,
        args.model,
        context,
        args.providerId,
        cachedReadTokens
    );
}

export function stickyRoutingCacheBoostMultiplier(cachedReadTokens: number): number {
    if (!Number.isFinite(cachedReadTokens) || cachedReadTokens <= 0) return 1;
    const log10 = Math.log10(cachedReadTokens + 1);
    const boost = Math.min(12, log10 * 4); // 10 tokens ~5x, 1k ~13x
    return 1 + boost;
}

export function extractCachedReadTokens(usage: any): number | null {
    if (!usage || typeof usage !== "object") return null;
    const direct = typeof usage.cached_read_text_tokens === "number" ? usage.cached_read_text_tokens : undefined;
    const nested = typeof usage?.input_tokens_details?.cached_tokens === "number"
        ? usage.input_tokens_details.cached_tokens
        : undefined;
    const value = direct ?? nested;
    return typeof value === "number" && value > 0 ? value : null;
}
