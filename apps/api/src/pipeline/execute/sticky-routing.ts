// Purpose: Cache-aware routing hints (beta-only).
// Why: Prefer providers that recently served cached responses.
// How: Store short-lived (5 min) provider hints in KV keyed by team+endpoint+model.

import type { Endpoint } from "@core/types";
import { getJson, putJson } from "@/core/kv";

const STICKY_PREFIX = "gateway:routing:sticky";
const STICKY_TTL_SECONDS = 300; // 5 minutes

export type StickyRoutingEntry = {
    providerId: string;
    cachedReadTokens: number;
    createdAt: string;
};

export function buildStickyRoutingKey(teamId: string, endpoint: Endpoint, model: string) {
    return `${STICKY_PREFIX}:${teamId}:${endpoint}:${model}`;
}

export async function readStickyRouting(teamId: string, endpoint: Endpoint, model: string): Promise<StickyRoutingEntry | null> {
    const key = buildStickyRoutingKey(teamId, endpoint, model);
    return await getJson<StickyRoutingEntry>(key);
}

export async function writeStickyRouting(
    teamId: string,
    endpoint: Endpoint,
    model: string,
    providerId: string,
    cachedReadTokens: number
): Promise<void> {
    const key = buildStickyRoutingKey(teamId, endpoint, model);
    const payload: StickyRoutingEntry = {
        providerId,
        cachedReadTokens,
        createdAt: new Date().toISOString(),
    };
    await putJson(key, payload, STICKY_TTL_SECONDS);
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
