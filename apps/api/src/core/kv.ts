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
const keyVersionInflight = new Map<string, Promise<number>>();
// One isolate epoch fences pending reads without retaining an unbounded map of
// every key ever invalidated. Unrelated concurrent mutations may reject a read;
// authorization fails closed instead of accepting an ambiguous version.
let keyVersionEpoch = 0;
const keyVersionWrites = new Map<string, { pending: boolean; promise: Promise<number> }>();
const KEY_VERSION_MAX_PENDING = 128;
let activeKeyVersionReads = 0;

export function __resetKeyVersionL1ForTests(): void {
	keyVersionL1Cache.clear();
	keyVersionInflight.clear();
	keyVersionWrites.clear();
	keyVersionEpoch++;
}

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

export async function getTextMany(keys: string[]): Promise<Record<string, string | null>> {
    const uniqueKeys = Array.from(new Set(keys.filter((key) => key.length > 0)));
    if (uniqueKeys.length === 0) return {};
    const out: Record<string, string | null> = {};

    for (let index = 0; index < uniqueKeys.length; index += 100) {
        const chunk = uniqueKeys.slice(index, index + 100);
        try {
            const values = await getCache().get(chunk, "text");
            for (const key of chunk) {
                out[key] = values.get(key) ?? null;
            }
        } catch {
            const pairs = await Promise.all(
                chunk.map(async (key) => {
                    try {
                        return [key, await getCache().get(key, "text")] as const;
                    } catch {
                        return [key, null] as const;
                    }
                }),
            );
            for (const [key, value] of pairs) {
                out[key] = value;
            }
        }
    }

    return out;
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
    const key = keyVersionKey(scope, value);
    const useL1Cache = options?.useL1Cache ?? false;
    const l1TtlMs = options?.l1TtlMs ?? KEY_VERSION_L1_CACHE_TTL_MS;
    // Pending and failed publications must never fall back to an old KV marker.
    // Failed writes retain a bounded fail-closed fence until a successful retry.
    const publication = keyVersionWrites.get(key);
    if (publication) return publication.promise;
    if (useL1Cache) {
        const cached = readKeyVersionL1(scope, value);
        if (cached !== null) {
            return cached;
        }
        const inflight = keyVersionInflight.get(key);
        if (inflight) return inflight;
    }
    if (activeKeyVersionReads >= KEY_VERSION_MAX_PENDING) throw new Error("Key version read capacity exceeded");
    activeKeyVersionReads++;
    const epochAtStart = keyVersionEpoch;
    const loader = Promise.resolve().then(async () => {
        try {
            const raw = await getCache().get(key, "text");
            if (raw !== null && !/^(0|[1-9]\d*)$/.test(raw)) throw new Error("Invalid key version");
            const parsed = raw === null ? 0 : Number(raw);
            if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid key version");
            const normalized = parsed;
            if (keyVersionEpoch !== epochAtStart) {
                throw new Error("Key version changed during read");
            }
            if (useL1Cache) {
                writeKeyVersionL1(scope, value, normalized, l1TtlMs);
            }
            return normalized;
        } finally {
            activeKeyVersionReads--;
            if (useL1Cache && keyVersionInflight.get(key) === loader) {
                keyVersionInflight.delete(key);
            }
        }
    });
    if (useL1Cache) {
        keyVersionInflight.set(key, loader);
    }
    return loader;
}

export async function setKeyVersion(scope: "kid" | "id", value: string, version: number): Promise<number> {
    const next = Number.isSafeInteger(version) && version >= 0 ? version : Date.now();
    const key = keyVersionKey(scope, value);
    if (keyVersionWrites.get(key)?.pending) throw new Error("Key version publication already pending");
    if (!keyVersionWrites.has(key) && keyVersionWrites.size >= KEY_VERSION_L1_CACHE_MAX_ENTRIES) {
        throw new Error("Key version publication capacity exceeded");
    }
    keyVersionEpoch++;
    keyVersionL1Cache.delete(key);
    keyVersionInflight.delete(key);
    const state = { pending: true, promise: Promise.resolve(0) };
    state.promise = Promise.resolve().then(async () => {
        await getCache().put(key, String(next));
        writeKeyVersionL1(scope, value, next, KEY_VERSION_L1_CACHE_TTL_MS);
        keyVersionWrites.delete(key);
        return next;
    }).finally(() => { state.pending = false; });
    keyVersionWrites.set(key, state);
    return state.promise;
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
