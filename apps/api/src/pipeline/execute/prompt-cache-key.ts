// Purpose: Workspace-scoped prompt cache keys for upstream providers.
// Why: Every Phaseo workspace shares Phaseo's provider organisation, so a raw client
// prompt_cache_key would collide across tenants (OpenAI overflows at about 15 rpm per
// key and prefix) and a request without one would share routing with every tenant.
// How: Send sha256(workspaceId:key) upstream, derive one from session_id when the
// client sends none, and never send null. Phaseo's own sticky routing keeps using the
// client's raw key from the request body.

import type { IRChatRequest } from "@core/ir";

// Not "phx_": that is the PostHog personal API key prefix and trips secret scanners.
const UPSTREAM_KEY_PREFIX = "pck_";
const UPSTREAM_KEY_HEX_LENGTH = 40;

/**
 * Providers whose docs make prompt_cache_key an accepted affinity hint, so a key
 * derived from session_id can be added even when the client sent none. Others only
 * receive a key the client sent, namespaced, exactly as before.
 * - OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching
 * - xAI Responses: https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits
 * - Fireworks chat: https://docs.fireworks.ai/api-reference/post-chatcompletions
 * - Cerebras: https://inference-docs.cerebras.ai/capabilities/prompt-caching
 */
const DERIVED_KEY_PROVIDERS = new Set(["openai", "openai-eu", "x-ai", "fireworks", "cerebras"]);

function normalizeKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function namespacedKey(scope: string): Promise<string> {
    return `${UPSTREAM_KEY_PREFIX}${(await sha256Hex(scope)).slice(0, UPSTREAM_KEY_HEX_LENGTH)}`;
}

export type UpstreamPromptCacheKey = {
    /** Hash sent upstream as prompt_cache_key (and as provider affinity headers). */
    key: string;
    /** "client" when the client sent prompt_cache_key; "session" when derived from session_id. */
    origin: "client" | "session";
};

export async function resolveUpstreamPromptCacheKey(args: {
    workspaceId: string;
    promptCacheKey: unknown;
    sessionId?: unknown;
}): Promise<UpstreamPromptCacheKey | null> {
    const workspaceId = String(args.workspaceId ?? "").trim();
    const clientKey = normalizeKey(args.promptCacheKey);
    if (clientKey) {
        return { key: await namespacedKey(`prompt-cache-key:v1:${workspaceId}:${clientKey}`), origin: "client" };
    }
    const sessionId = normalizeKey(args.sessionId);
    if (sessionId) {
        return { key: await namespacedKey(`prompt-cache-session:v1:${workspaceId}:${sessionId}`), origin: "session" };
    }
    return null;
}

/** Replace the IR's client key with the upstream key for this provider, or remove it. */
export function applyUpstreamPromptCacheKey(
    ir: IRChatRequest,
    providerId: string,
    upstream: UpstreamPromptCacheKey | null,
): IRChatRequest {
    const sendKey = upstream && (
        upstream.origin === "client" ||
        DERIVED_KEY_PROVIDERS.has(String(providerId ?? "").trim().toLowerCase())
    );
    if (sendKey) {
        if (ir.promptCacheKey === upstream.key) return ir;
        return { ...ir, promptCacheKey: upstream.key };
    }
    if (!("promptCacheKey" in ir)) return ir;
    const next: IRChatRequest = { ...ir };
    delete next.promptCacheKey;
    return next;
}
