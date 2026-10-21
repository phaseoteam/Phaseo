// Purpose: Cache-aware routing hints.
// Why: Keep an agent turn on the provider (and route) that holds its prompt cache.
// How: Store per-workspace pins in KV with a TTL derived from the provider's cache
// retention, backed by a short-lived per-isolate L1.

import type { Endpoint } from "@core/types";
import { getJson, putJson } from "@/core/kv";
import { dispatchBackground } from "@/runtime/env";

const STICKY_PREFIX = "gateway:routing:sticky";
// Floor for every pin. Anthropic's default 5-minute cache and OpenAI's in-memory
// cache are refreshed on each hit, so a shorter pin would expire mid-turn.
const STICKY_TTL_SECONDS = 15 * 60;
const SESSION_STICKY_TTL_SECONDS = 24 * 60 * 60;
const MAX_STICKY_TTL_SECONDS = 24 * 60 * 60;
// Unchanged pins are rewritten after a third of their TTL, so a pin can expire
// two thirds of a TTL after its last use. 1.5x the provider's retention keeps it
// alive for as long as the provider's cache can still be warm.
const RETENTION_TTL_MULTIPLIER = 1.5;
// Isolate-local copies are short-lived. A positive entry is at most this stale
// before KV is consulted again, and "no pin" is cached for seconds only, so a pin
// written by another isolate is seen on the next agent step.
const STICKY_L1_POSITIVE_TTL_MS = 60_000;
const STICKY_L1_NEGATIVE_TTL_MS = 5_000;
const STICKY_L1_MAX_ENTRIES = 1_000;
// Affinity is a pin, not a soft preference. Health breakers, failure evidence and
// quota exhaustion still demote it, so failover remains available.
export const STICKY_ROUTING_PIN_MULTIPLIER = 1_000_000;
const CONTEXT_HASH_VERSION = "v2-opening-anchors";
const CACHE_AWARE_ROUTING_ENDPOINTS = new Set<Endpoint>([
    "responses",
    "chat.completions",
    "messages",
]);

export type StickyRoutingSource = "prompt_cache_key" | "context_hash" | "session_id";

export type StickyRoutingEntry = {
    providerId: string;
    cachedReadTokens: number;
    contextKey: string;
    source: StickyRoutingSource;
    createdAt: string;
    /** The route within the provider, so deployment and region affinity survive. */
    apiModelId?: string | null;
    providerModelSlug?: string | null;
    keySource?: "gateway" | "byok" | null;
    byokKeyId?: string | null;
    /** KV TTL the pin was written with, derived from the provider's cache retention. */
    ttlSeconds?: number;
};

export type StickyRoutingContext = {
    key: string;
    source: StickyRoutingSource;
    /**
     * True when the client asked for cache affinity: prompt_cache_key, session_id or a
     * cache_control opt-in. These requests pin on their first successful step and read
     * KV synchronously on a cold isolate instead of routing without the pin.
     */
    explicit?: boolean;
};

export type StickyRoutingRoute = {
    providerId: string;
    apiModelId?: string | null;
    providerModelSlug?: string | null;
    keySource?: "gateway" | "byok" | null;
    byokKeyId?: string | null;
};

export type StickyRoutingReadMode = "l1" | "kv" | "optimistic";

type StickyL1Entry = {
    value: StickyRoutingEntry | null;
    expiresAtMs: number;
};

const stickyL1 = new Map<string, StickyL1Entry>();
const stickyL1Inflight = new Map<string, Promise<void>>();

function stickyTtlSeconds(value: StickyRoutingEntry | null): number {
    if (typeof value?.ttlSeconds === "number" && Number.isFinite(value.ttlSeconds) && value.ttlSeconds > 0) {
        return value.ttlSeconds;
    }
    return value?.source === "session_id" ? SESSION_STICKY_TTL_SECONDS : STICKY_TTL_SECONDS;
}

function setStickyL1(key: string, value: StickyRoutingEntry | null): void {
    if (!stickyL1.has(key) && stickyL1.size >= STICKY_L1_MAX_ENTRIES) {
        const oldestKey = stickyL1.keys().next().value;
        if (typeof oldestKey === "string") stickyL1.delete(oldestKey);
    }
    stickyL1.set(key, {
        value,
        expiresAtMs: Date.now() + (value ? STICKY_L1_POSITIVE_TTL_MS : STICKY_L1_NEGATIVE_TTL_MS),
    });
}

function readStickyL1(key: string): StickyL1Entry | null {
    const cached = stickyL1.get(key);
    if (!cached) return null;
    if (cached.expiresAtMs > Date.now()) return cached;
    stickyL1.delete(key);
    return null;
}

function refreshStickyL1(key: string): Promise<void> {
    const inflight = stickyL1Inflight.get(key);
    if (inflight) return inflight;
    const refresh = getJson<StickyRoutingEntry>(key)
        .then((value) => setStickyL1(key, value))
        .catch(() => setStickyL1(key, null))
        .finally(() => stickyL1Inflight.delete(key));
    stickyL1Inflight.set(key, refresh);
    return refresh;
}

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
        const parts: unknown[] = [];
        for (const part of content) {
            const normalized = normalizeContentForHash(part);
            if (hasMeaningfulValue(normalized)) parts.push(normalized);
            if (parts.length === 8) break;
        }
        if (!parts.length) return null;
        return parts;
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
        if (firstSystemOrDeveloper && firstUserOrNonSystem) break;
        if (!isPlainObject(message)) continue;
        const role = sanitizeString((message as any).role)?.toLowerCase();
        if (!(
            (!firstSystemOrDeveloper && (role === "system" || role === "developer")) ||
            (!firstUserOrNonSystem && role === "user")
        )) continue;
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
            if (firstSystemOrDeveloper && firstUserOrNonSystem) break;
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
    let opening: ReturnType<typeof extractAnchorsFromMessages>;
    if (endpoint === "responses") {
        opening = extractResponsesAnchors(body);
    } else {
        const fromMessages = extractAnchorsFromMessages(body?.messages);
        const explicitSystem = normalizeContentForHash(body?.system);
        opening = {
            firstSystemOrDeveloper:
                hasMeaningfulValue(explicitSystem)
                    ? explicitSystem
                    : fromMessages.firstSystemOrDeveloper,
            firstUserOrNonSystem: fromMessages.firstUserOrNonSystem,
        };
    }

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

export function resolveSessionAffinityPreference(body: any, fallback = true): boolean {
    const routing = body?.routing;
    const provider = body?.provider;
    const explicit = pickFirstBoolean([
        provider?.session_affinity,
        provider?.sessionAffinity,
        routing?.session_affinity,
        routing?.sessionAffinity,
    ]);
    if (explicit !== null) return explicit;
    return fallback;
}

const BLOCK_CACHE_MARK_FIELDS = ["cache_control", "cacheControl", "prompt_cache_breakpoint"] as const;

function collectBlockMarks(
    blocks: unknown,
    out: Record<string, unknown>[],
    depth = 0,
    fields: readonly string[] = BLOCK_CACHE_MARK_FIELDS,
): void {
    if (!Array.isArray(blocks) || depth > 2) return;
    for (const block of blocks) {
        if (!isPlainObject(block)) continue;
        for (const field of fields) {
            const mark = (block as any)[field];
            if (isPlainObject(mark)) out.push(mark as Record<string, unknown>);
        }
        // Message items (Chat messages, Responses input items) and tool results nest blocks.
        collectBlockMarks((block as any).content, out, depth + 1, fields);
        collectBlockMarks((block as any).output, out, depth + 1, fields);
    }
}

const MARK_SCAN_OPENING_ITEMS = 8;
const MARK_SCAN_LATEST_ITEMS = 4;

/**
 * The opening and latest conversation items. Clients mark the stable opening and move
 * a mark along the latest turns, so this finds an opt-in without walking a long
 * agent history on every request.
 */
function markScanItems(items: unknown): unknown[] {
    if (!Array.isArray(items)) return [];
    if (items.length <= MARK_SCAN_OPENING_ITEMS + MARK_SCAN_LATEST_ITEMS) return items;
    return [...items.slice(0, MARK_SCAN_OPENING_ITEMS), ...items.slice(-MARK_SCAN_LATEST_ITEMS)];
}

/**
 * Cache marks on content blocks and tool definitions: the documented Anthropic
 * placement, also accepted on Chat and Responses.
 */
function blockCacheMarks(body: any): Record<string, unknown>[] {
    const marks: Record<string, unknown>[] = [];
    collectBlockMarks(body?.tools, marks);
    collectBlockMarks(body?.system, marks);
    collectBlockMarks(body?.instructions, marks);
    collectBlockMarks(markScanItems(body?.messages), marks);
    collectBlockMarks(markScanItems(body?.input), marks);
    return marks;
}

function hasCacheControlOptIn(body: any): boolean {
    const providerOptions = body?.provider_options ?? body?.providerOptions;
    const anthropicOptions = providerOptions?.anthropic;
    return [
        body?.cache_control,
        body?.cacheControl,
        anthropicOptions?.cache_control,
        anthropicOptions?.cacheControl,
    ].some((value) => isPlainObject(value) && hasMeaningfulValue(value))
        || blockCacheMarks(body).length > 0;
}

/**
 * The longest TTL named by a block cache mark, in seconds. Only Anthropic's 5m and
 * 1h count: other values are dropped before the request is sent.
 */
function longestBlockTtlSeconds(body: any): number | null {
    let longest: number | null = null;
    for (const mark of blockCacheMarks(body)) {
        const seconds = mark.ttl === "5m" || mark.ttl === "1h" ? parseRetentionSeconds(mark.ttl) : null;
        if (seconds && (longest === null || seconds > longest)) longest = seconds;
    }
    return longest;
}

/**
 * The longest lifetime named on an OpenAI `prompt_cache_breakpoint` ("30m" or "12h",
 * GPT-5.6+ Responses), in seconds.
 */
function longestOpenAIBreakpointTtlSeconds(body: any): number | null {
    const marks: Record<string, unknown>[] = [];
    for (const items of [body?.messages, body?.input]) {
        collectBlockMarks(markScanItems(items), marks, 0, ["prompt_cache_breakpoint"]);
    }
    let longest: number | null = null;
    for (const mark of marks) {
        const ttl = typeof mark.ttl === "string" ? mark.ttl.trim().toLowerCase() : "";
        const seconds = ttl === "30m" || ttl === "12h" ? parseRetentionSeconds(ttl) : null;
        if (seconds && (longest === null || seconds > longest)) longest = seconds;
    }
    return longest;
}

// Routes that take OpenAI's 12-hour lifetime; elsewhere it is removed before sending, so
// the 30-minute default applies (see ./prompt-cache-ttl.ts).
const OPENAI_TWELVE_HOUR_PROVIDERS = new Set(["openai", "openai-eu"]);
const OPENAI_DEFAULT_TTL_SECONDS = 30 * 60;

export async function resolveStickyRoutingContext(args: {
    endpoint: Endpoint;
    body: any;
}): Promise<StickyRoutingContext | null> {
    if (!isCacheAwareRoutingEndpoint(args.endpoint)) return null;

    const sessionId = pickFirstString([
        args.body?.session_id,
        args.body?.sessionId,
    ]);
    if (sessionId && resolveSessionAffinityPreference(args.body)) {
        const digest = await sha256Hex(`session-id:${sessionId}`);
        return {
            key: `session:${digest}`,
            source: "session_id",
            explicit: true,
        };
    }

    const explicitPromptCacheKey = pickFirstString([
        args.body?.prompt_cache_key,
        args.body?.promptCacheKey,
    ]);
    if (explicitPromptCacheKey) {
        const digest = await sha256Hex(`prompt-cache-key:${explicitPromptCacheKey}`);
        return {
            key: `prompt:${digest}`,
            source: "prompt_cache_key",
            explicit: true,
        };
    }

    const contextInput = buildContextInput(args.body, args.endpoint);
    if (!hasMeaningfulValue(contextInput)) return null;

    const serialized = stableStringify(contextInput);
    const digest = await sha256Hex(`sticky-context:${CONTEXT_HASH_VERSION}:${args.endpoint}:${serialized}`);
    return {
        key: `context:${digest}`,
        source: "context_hash",
        explicit: hasCacheControlOptIn(args.body),
    };
}

function parseRetentionSeconds(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    // OpenAI: in-memory entries stay for 5-10 minutes of inactivity, up to one hour.
    if (normalized === "in_memory" || normalized === "in-memory") return 60 * 60;
    const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/.exec(normalized);
    if (!match) return null;
    const unitSeconds = { s: 1, m: 60, h: 3_600, d: 86_400 }[match[2] as "s" | "m" | "h" | "d"];
    const seconds = Number(match[1]) * unitSeconds;
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

// OpenAI and Azure OpenAI default to in-memory retention (up to an hour) when the
// request names none; 24h is only the default for non-ZDR OpenAI organisations.
const OPENAI_RETENTION_PROVIDERS = new Set(["openai", "openai-eu", "azure"]);

/**
 * How long the serving provider keeps this request's prompt cache, where it is known.
 * Anthropic: cache_control ttl ("5m" default, "1h" extended); a reported 1h write proves 1h.
 * OpenAI/Azure: top-level prompt_cache_retention, then the provider_options alias, then
 * the longer of prompt_cache_options.ttl and any prompt_cache_breakpoint.ttl (GPT-5.6+;
 * "12h" only where the route takes it, otherwise the 30-minute default), then the in-memory
 * default. A reported 12-hour write proves 12 hours.
 */
export function resolveProviderCacheRetentionSeconds(args: {
    body: any;
    providerId: string;
    usage?: any;
}): number | null {
    const body = args.body;
    const usage = args.usage;
    const providerOptions = body?.provider_options ?? body?.providerOptions;
    const openaiOptions = providerOptions?.openai ?? {};
    const anthropicOptions = providerOptions?.anthropic ?? {};
    const retention: number[] = [];

    const anthropicTtl = parseRetentionSeconds(
        body?.cache_control?.ttl ??
        body?.cacheControl?.ttl ??
        anthropicOptions?.cache_control?.ttl ??
        anthropicOptions?.cacheControl?.ttl,
    ) ?? longestBlockTtlSeconds(body);
    if (anthropicTtl) retention.push(anthropicTtl);
    else if (hasCacheControlOptIn(body)) retention.push(5 * 60);
    const oneHourWrites = [
        usage?.cached_write_text_tokens_1h,
        usage?.cache_creation?.ephemeral_1h_input_tokens,
        usage?.input_tokens_details?.cache_creation?.ephemeral_1h_input_tokens,
    ].some((value) => typeof value === "number" && value > 0);
    if (oneHourWrites) retention.push(60 * 60);
    const twelveHourWrites = [
        usage?.cached_write_text_tokens_12h,
        usage?.input_tokens_details?.cache_write_tokens_details?.ttl_12h_tokens,
    ].some((value) => typeof value === "number" && value > 0);
    if (twelveHourWrites) retention.push(12 * 60 * 60);

    const providerId = String(args.providerId ?? "").trim().toLowerCase();
    if (OPENAI_RETENTION_PROVIDERS.has(providerId)) {
        const takesTwelveHours = OPENAI_TWELVE_HOUR_PROVIDERS.has(providerId);
        const capTtl = (seconds: number | null) =>
            seconds !== null && seconds > OPENAI_DEFAULT_TTL_SECONDS && !takesTwelveHours ? OPENAI_DEFAULT_TTL_SECONDS : seconds;
        const optionsTtl = capTtl(parseRetentionSeconds((body?.prompt_cache_options ?? openaiOptions?.prompt_cache_options)?.ttl));
        const breakpointTtl = capTtl(longestOpenAIBreakpointTtlSeconds(body));
        const openaiRetention =
            parseRetentionSeconds(body?.prompt_cache_retention ?? body?.promptCacheRetention) ??
            parseRetentionSeconds(openaiOptions?.prompt_cache_retention ?? openaiOptions?.promptCacheRetention) ??
            (optionsTtl !== null || breakpointTtl !== null ? Math.max(optionsTtl ?? 0, breakpointTtl ?? 0) : null) ??
            60 * 60;
        retention.push(openaiRetention);
    }

    return retention.length ? Math.max(...retention) : null;
}

export function resolveStickyPinTtlSeconds(args: {
    context: StickyRoutingContext;
    body: any;
    providerId: string;
    usage?: any;
}): number {
    const retention = resolveProviderCacheRetentionSeconds(args);
    const fromRetention = retention ? Math.ceil(retention * RETENTION_TTL_MULTIPLIER) : 0;
    const floor = args.context.source === "session_id" ? SESSION_STICKY_TTL_SECONDS : STICKY_TTL_SECONDS;
    return Math.min(MAX_STICKY_TTL_SECONDS, Math.max(floor, fromRetention));
}

export function buildStickyRoutingKey(
    workspaceId: string,
    endpoint: Endpoint,
    model: string,
    contextKey: string
) {
    return `${STICKY_PREFIX}:${workspaceId}:${endpoint}:${model}:${contextKey}`;
}

export async function readStickyRouting(
    workspaceId: string,
    endpoint: Endpoint,
    model: string,
    contextKey: string
): Promise<StickyRoutingEntry | null> {
    const key = buildStickyRoutingKey(workspaceId, endpoint, model, contextKey);
    const value = await getJson<StickyRoutingEntry>(key);
    setStickyL1(key, value);
    return value;
}

/** Serve an isolate-local hint and refresh KV asynchronously on cold/expiry. */
export function readStickyRoutingOptimistic(
    workspaceId: string,
    endpoint: Endpoint,
    model: string,
    contextKey: string
): StickyRoutingEntry | null {
    const key = buildStickyRoutingKey(workspaceId, endpoint, model, contextKey);
    const cached = readStickyL1(key);
    if (cached) return cached.value;
    dispatchBackground(refreshStickyL1(key));
    return null;
}

/**
 * Read the pin for routing. Requests that asked for cache affinity wait for KV on a
 * cold or expired isolate entry, because routing them without their pin would move
 * the turn off the provider holding its cache. Other requests stay optimistic.
 */
export async function readStickyRoutingForRouting(
    workspaceId: string,
    endpoint: Endpoint,
    model: string,
    context: StickyRoutingContext,
): Promise<{ entry: StickyRoutingEntry | null; mode: StickyRoutingReadMode }> {
    const key = buildStickyRoutingKey(workspaceId, endpoint, model, context.key);
    const cached = readStickyL1(key);
    if (cached) return { entry: cached.value, mode: "l1" };
    if (context.explicit) {
        await refreshStickyL1(key);
        return { entry: stickyL1.get(key)?.value ?? null, mode: "kv" };
    }
    dispatchBackground(refreshStickyL1(key));
    return { entry: null, mode: "optimistic" };
}

function normalizeRoute(route: string | StickyRoutingRoute): StickyRoutingRoute {
    return typeof route === "string" ? { providerId: route } : route;
}

function normalizeOptionalString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function writeStickyRouting(
    workspaceId: string,
    endpoint: Endpoint,
    model: string,
    context: StickyRoutingContext,
    route: string | StickyRoutingRoute,
    cachedReadTokens: number,
    options?: { ttlSeconds?: number },
): Promise<void> {
    const key = buildStickyRoutingKey(workspaceId, endpoint, model, context.key);
    const target = normalizeRoute(route);
    const providerModelSlug = normalizeOptionalString(target.providerModelSlug);
    const ttlSeconds = typeof options?.ttlSeconds === "number" && options.ttlSeconds > 0
        ? Math.ceil(options.ttlSeconds)
        : context.source === "session_id" ? SESSION_STICKY_TTL_SECONDS : STICKY_TTL_SECONDS;
    // Agent sessions hit the same pin every turn. KV writes cost 10x reads and
    // allow about one write per second per key, so only rewrite when the pin
    // changes, needs a longer TTL, or is a third of the way through its TTL.
    const existing = stickyL1.get(key)?.value;
    if (
        existing?.providerId === target.providerId &&
        (existing.providerModelSlug ?? null) === providerModelSlug &&
        existing.source === context.source &&
        stickyTtlSeconds(existing) >= ttlSeconds
    ) {
        const writtenAt = Date.parse(existing.createdAt);
        const refreshAfterMs = (stickyTtlSeconds(existing) * 1_000) / 3;
        if (Number.isFinite(writtenAt) && Date.now() - writtenAt < refreshAfterMs) return;
    }
    const payload: StickyRoutingEntry = {
        providerId: target.providerId,
        cachedReadTokens,
        contextKey: context.key,
        source: context.source,
        createdAt: new Date().toISOString(),
        apiModelId: normalizeOptionalString(target.apiModelId),
        providerModelSlug,
        keySource: target.keySource ?? null,
        byokKeyId: normalizeOptionalString(target.byokKeyId),
        ttlSeconds,
    };
    setStickyL1(key, payload);
    await putJson(key, payload, ttlSeconds);
}

export function resetStickyRoutingStateForTests(): void {
    stickyL1.clear();
    stickyL1Inflight.clear();
}

export async function maybeWriteStickyRoutingFromUsage(args: {
    workspaceId: string;
    endpoint: Endpoint;
    model: string;
    body: any;
    providerId: string;
    apiModelId?: string | null;
    providerModelSlug?: string | null;
    keySource?: "gateway" | "byok" | null;
    byokKeyId?: string | null;
    usage: any;
    enabled?: boolean;
}): Promise<void> {
    if (!isCacheAwareRoutingEndpoint(args.endpoint)) return;
    if (args.enabled === false) return;

    const context = await resolveStickyRoutingContext({ endpoint: args.endpoint, body: args.body });
    if (!context) return;

    // Requests that asked for affinity pin on their first successful step. Many
    // providers report no cache write, so waiting for a reported read or write
    // would leave the first steps of a turn free to land anywhere.
    const cacheAffinityTokens = extractCacheAffinityTokens(args.usage);
    if (cacheAffinityTokens === null && !context.explicit) return;

    await writeStickyRouting(
        args.workspaceId,
        args.endpoint,
        args.model,
        context,
        {
            providerId: args.providerId,
            apiModelId: args.apiModelId ?? null,
            providerModelSlug: args.providerModelSlug ?? null,
            keySource: args.keySource ?? null,
            byokKeyId: args.byokKeyId ?? null,
        },
        cacheAffinityTokens ?? 0,
        {
            ttlSeconds: resolveStickyPinTtlSeconds({
                context,
                body: args.body,
                providerId: args.providerId,
                usage: args.usage,
            }),
        },
    );
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

export function extractCacheAffinityTokens(usage: any): number | null {
    const cachedReadTokens = extractCachedReadTokens(usage);
    if (cachedReadTokens !== null) return cachedReadTokens;
    if (!usage || typeof usage !== "object") return null;

    const directWrite = [
        usage.cached_write_text_tokens,
        usage.cache_creation_input_tokens,
        usage?.input_tokens_details?.cache_creation_input_tokens,
        usage?.input_tokens_details?.cache_creation_tokens,
        usage?.prompt_tokens_details?.cache_creation_input_tokens,
        usage?.prompt_tokens_details?.cache_creation_tokens,
    ].find((value) => typeof value === "number" && value > 0);
    if (typeof directWrite === "number") return directWrite;

    const splitWrite = [
        usage.cached_write_text_tokens_5m,
        usage.cached_write_text_tokens_1h,
        usage?.cache_creation?.ephemeral_5m_input_tokens,
        usage?.cache_creation?.ephemeral_1h_input_tokens,
    ].reduce((sum, value) => sum + (typeof value === "number" && value > 0 ? value : 0), 0);
    return splitWrite > 0 ? splitWrite : null;
}
