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

function keyVersionKey(scope: "kid" | "id", value: string): string {
    return `${KEY_VERSION_PREFIX}:${scope}:${value}`;
}

export async function getJson<T>(key: string): Promise<T | null> {
    const raw = await getCache().get(key, "text");
    if (!raw) return null;
    try {
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

export async function getKeyVersion(scope: "kid" | "id", value: string): Promise<number> {
    const raw = await getCache().get(keyVersionKey(scope, value), "text");
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export async function setKeyVersion(scope: "kid" | "id", value: string, version: number): Promise<number> {
    const next = Number.isFinite(version) ? Math.max(0, Math.floor(version)) : Date.now();
    await getCache().put(keyVersionKey(scope, value), String(next));
    return next;
}

export async function bumpKeyVersion(scope: "kid" | "id", value: string): Promise<number> {
    const current = await getKeyVersion(scope, value);
    const next = current + 1;
    return setKeyVersion(scope, value, next);
}

export async function keyVersionToken(scope: "kid" | "id", value: string): Promise<string> {
    const version = await getKeyVersion(scope, value);
    return `v${version}`;
}

