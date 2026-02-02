// lib/gateway/before/context.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Calls RPC/SQL to fetch provider, pricing, and gating context.

import { getSupabaseAdmin, getCache } from "@/runtime/env";
import { keyVersionToken } from "@/core/kv";
import { contextSchema } from "./schemas";
import type { GatewayContextData } from "./types";

const CONTEXT_CACHE_PREFIX = "gateway:context";

// Multi-tier caching constants (respecting Cloudflare KV 60s minimum)
const STATIC_CACHE_PREFIX = "gateway:static";
const DYNAMIC_CACHE_PREFIX = "gateway:dynamic";
const PRESET_CACHE_PREFIX = "gateway:preset";

const STATIC_TTL_MIN = 300;  // 5 minutes
const STATIC_TTL_MAX = 900;  // 15 minutes
const DYNAMIC_TTL_MIN = 60;  // 1 minute (KV minimum)
const DYNAMIC_TTL_MAX = 180; // 3 minutes
const PRESET_TTL = 120;      // 2 minutes

const MIN_TTL_SECONDS = 60;  // Cloudflare KV minimum
const MAX_TTL_SECONDS = 900; // 15 minutes

/**
 * Clamp TTL to valid range for Cloudflare Workers KV
 * Minimum: 60s (KV requirement)
 * Maximum: 900s (15 minutes)
 */
function clampTtl(value: number): number {
    return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(value)));
}

function toUnixSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
}

function parseWindowEnd(bucket: "daily" | "weekly" | "monthly", windowStart?: string | null): number | null {
    if (!windowStart) return null;
    const start = new Date(windowStart);
    if (!Number.isFinite(start.getTime())) return null;
    const end = new Date(start);
    if (bucket === "daily") {
        end.setUTCDate(start.getUTCDate() + 1);
    } else if (bucket === "weekly") {
        end.setUTCDate(start.getUTCDate() + 7);
    } else {
        end.setUTCMonth(start.getUTCMonth() + 1);
    }
    return toUnixSeconds(end);
}

function bucketPressureScore(bucket?: {
    requestsUsed: number;
    requestsLimit: number;
    costUsedNanos: number;
    costLimitNanos: number;
} | null): number {
    if (!bucket) return 0;
    const ratios: number[] = [];
    if (bucket.requestsLimit > 0) ratios.push(bucket.requestsUsed / bucket.requestsLimit);
    if (bucket.costLimitNanos > 0) ratios.push(bucket.costUsedNanos / bucket.costLimitNanos);
    return ratios.length ? Math.max(...ratios) : 0;
}

/**
 * Compute adaptive TTL for dynamic data (key limits, buckets)
 * Respects Cloudflare KV 60s minimum TTL
 */
function computeAdaptiveTtlForDynamic(context: GatewayContextData): number {
    let ttl = DYNAMIC_TTL_MAX;

    // If key or limits are not OK, use shorter TTL
    if (!context.key.ok || !context.keyLimit.ok) {
        return DYNAMIC_TTL_MIN;
    }

    const buckets = context.keyLimit.buckets ?? null;
    const nowSec = context.keyLimit.now ? toUnixSeconds(new Date(context.keyLimit.now)) : toUnixSeconds(new Date());
    const bucketEntries: Array<["daily" | "weekly" | "monthly", any]> = [
        ["daily", buckets?.daily ?? null],
        ["weekly", buckets?.weekly ?? null],
        ["monthly", buckets?.monthly ?? null],
    ];

    for (const [bucketName, bucket] of bucketEntries) {
        if (!bucket) continue;
        const pressure = bucketPressureScore(bucket);

        // High pressure = shorter TTL (but respect 60s minimum)
        if (pressure >= 0.95) ttl = Math.min(ttl, 60);
        else if (pressure >= 0.9) ttl = Math.min(ttl, 75);
        else if (pressure >= 0.8) ttl = Math.min(ttl, 90);
        else if (pressure >= 0.6) ttl = Math.min(ttl, 120);
        else ttl = Math.min(ttl, 180);

        const windowEnd = parseWindowEnd(bucketName, bucket.windowStart);
        if (windowEnd) {
            const secondsToReset = windowEnd - nowSec;
            if (secondsToReset > 0 && secondsToReset >= MIN_TTL_SECONDS) {
                ttl = Math.min(ttl, secondsToReset);
            }
        }
    }

    return clampTtl(ttl);
}

/**
 * Compute TTL for static data (providers, pricing)
 * Uses longer TTL since this data changes infrequently
 */
function computeStaticTtl(): number {
    // Static data can be cached for 5-15 minutes
    // Use 10 minutes as default for good balance
    return 600; // 10 minutes
}

function isContextLike(value: unknown): value is GatewayContextData {
    if (!value || typeof value !== "object") return false;
    const ctx = value as GatewayContextData;
    return Boolean(ctx.teamId && ctx.key && ctx.keyLimit && ctx.credit && ctx.providers);
}

export async function fetchGatewayContext(args: {
    teamId: string;
    model: string;
    endpoint: string;
    apiKeyId: string;
    disableCache?: boolean;
}): Promise<GatewayContextData> {
    const supabase = getSupabaseAdmin();
    const cache = getCache();
    const versionToken = await keyVersionToken("id", args.apiKeyId);

    // Check if model is a preset
    const isPreset = args.model.startsWith("@");
    const cacheKey = isPreset
        ? `${PRESET_CACHE_PREFIX}:${args.teamId}:${args.model}:${args.endpoint}`
        : `${CONTEXT_CACHE_PREFIX}:${args.teamId}:${args.apiKeyId}:${versionToken}:${args.endpoint}:${args.model}`;

    // Try cache first
    if (!args.disableCache) {
        try {
            const cached = await cache.get(cacheKey, "text");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (isContextLike(parsed)) {
                    return parsed;
                }
            }
        } catch {
            // ignore cache read failures
        }
    }

    // Cache miss - fetch from database
    const { data, error } = await supabase.rpc("gateway_fetch_request_context", {
        team_id: args.teamId,
        model: args.model,
        endpoint: args.endpoint,
        api_key_id: args.apiKeyId,
    });

    if (error) throw new Error(`gateway_context_rpc_error:${error.message ?? "unknown"}`);

    const payload = Array.isArray(data) ? (data.length ? data[0] : null) : data;
    if (!payload) throw new Error("gateway_context_rpc_empty");

    let parsed: GatewayContextData;
    try {
        parsed = contextSchema.parse(payload);
    } catch (e) {
        console.error("[context.ts] Zod parsing error:", e);
        console.error("[context.ts] Payload that failed:", payload);
        throw e;
    }

    // Compute adaptive TTL based on data characteristics
    if (!args.disableCache) {
        try {
            let ttl: number;

        if (isPreset) {
            // Presets: use fixed TTL (config changes infrequently)
            ttl = PRESET_TTL;
        } else {
            // Regular models: compute adaptive TTL for dynamic data
            // Static data (providers/pricing) would ideally be cached separately
            // but for now we use adaptive TTL that favors longer caching
            const dynamicTtl = computeAdaptiveTtlForDynamic(parsed);

            // If limits are healthy, use longer TTL closer to static tier
            // If limits are stressed, use shorter TTL for more frequent updates
            if (!parsed.keyLimit.ok) {
                ttl = DYNAMIC_TTL_MIN;
            } else {
                const buckets = parsed.keyLimit.buckets;
                const maxPressure = Math.max(
                    bucketPressureScore(buckets?.daily),
                    bucketPressureScore(buckets?.weekly),
                    bucketPressureScore(buckets?.monthly)
                );

                // Low pressure → cache longer (providers/pricing don't change often)
                // High pressure → cache shorter (limits need frequent updates)
                if (maxPressure < 0.3) {
                    ttl = Math.min(STATIC_TTL_MIN, dynamicTtl * 3);
                } else {
                    ttl = dynamicTtl;
                }
            }
        }

            ttl = clampTtl(ttl);
            await cache.put(cacheKey, JSON.stringify(parsed), { expirationTtl: ttl });
        } catch {
            // ignore cache write failures
        }
    }

    return parsed;
}









