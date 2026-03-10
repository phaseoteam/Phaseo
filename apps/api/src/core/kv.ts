// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

// apps/api/src/lib/gateway/kv.ts
// Single source of truth for KV access in the Worker.
// - No process.env
// - No c.env at module scope

import { getCache } from "@/runtime/env";

export function getKv() {
    return getCache();
}

const KEY_VERSION_PREFIX = "gateway:keyver";
const KEY_VERSION_L1_CACHE_TTL_MS = 1000;
const KEY_VERSION_L1_CACHE_MAX_ENTRIES = 2000;
type KeyVersionL1Entry = {
    version: number;
    expiresAt: number;
};
const keyVersionL1Cache = new Map<string, KeyVersionL1Entry>();

function keyVersionKey(scope: "kid" | "id", value: string): string {
    return `${KEY_VERSION_PREFIX}:${scope}:${value}`;
}

function readKeyVersionL1(scope: "kid" | "id", value: string): number | null {
    const key = keyVersionKey(scope, value);
    const entry = keyVersionL1Cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        keyVersionL1Cache.delete(key);
        return null;
    }
    return entry.version;
}

function writeKeyVersionL1(scope: "kid" | "id", value: string, version: number, ttlMs = KEY_VERSION_L1_CACHE_TTL_MS): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
    const now = Date.now();
    // Opportunistically sweep expired entries to keep memory bounded.
    for (const [entryKey, entry] of keyVersionL1Cache) {
        if (entry.expiresAt <= now) {
            keyVersionL1Cache.delete(entryKey);
        }
    }
    keyVersionL1Cache.set(keyVersionKey(scope, value), {
        version,
        expiresAt: now + ttlMs,
    });
    while (keyVersionL1Cache.size > KEY_VERSION_L1_CACHE_MAX_ENTRIES) {
        const oldestKey = keyVersionL1Cache.keys().next().value;
        if (oldestKey === undefined) break;
        keyVersionL1Cache.delete(oldestKey);
    }
}

export async function getJson<T>(key: string): Promise<T | null> {
    try {
        const raw = await getCache().get(key, "text");
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function putJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const options = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
    await getCache().put(key, JSON.stringify(value), options);
}

export async function deleteKey(key: string): Promise<void> {
    await getCache().delete(key);
}

export async function getKeyVersion(
    scope: "kid" | "id",
    value: string,
    options?: {
        useL1Cache?: boolean;
        l1TtlMs?: number;
    }
): Promise<number> {
    const useL1Cache = options?.useL1Cache ?? false;
    const l1TtlMs = options?.l1TtlMs ?? KEY_VERSION_L1_CACHE_TTL_MS;
    if (useL1Cache) {
        const cached = readKeyVersionL1(scope, value);
        if (cached !== null) {
            return cached;
        }
    }
    try {
        const raw = await getCache().get(keyVersionKey(scope, value), "text");
        const parsed = raw ? Number(raw) : 0;
        const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
        if (useL1Cache) {
            writeKeyVersionL1(scope, value, normalized, l1TtlMs);
        }
        return normalized;
    } catch {
        // Fail open: if KV is unavailable, use version 0 to keep requests serving.
        return 0;
    }
}

export async function setKeyVersion(scope: "kid" | "id", value: string, version: number): Promise<number> {
    const next = Number.isFinite(version) ? Math.max(0, Math.floor(version)) : Date.now();
    await getCache().put(keyVersionKey(scope, value), String(next));
    writeKeyVersionL1(scope, value, next, KEY_VERSION_L1_CACHE_TTL_MS);
    return next;
}

export async function bumpKeyVersion(scope: "kid" | "id", value: string): Promise<number> {
    const current = await getKeyVersion(scope, value, { useL1Cache: false });
    const next = current + 1;
    return setKeyVersion(scope, value, next);
}

export async function keyVersionToken(
    scope: "kid" | "id",
    value: string,
    options?: {
        useL1Cache?: boolean;
        l1TtlMs?: number;
    }
): Promise<string> {
    const version = await getKeyVersion(scope, value, options);
    return `v${version}`;
}

