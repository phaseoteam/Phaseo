// Purpose: Runtime bindings and environment helpers.
// Why: Centralizes platform configuration.
// How: Reads bindings and exposes initialized clients.

// apps/api/src/runtime/env.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import { BINDING_KEYS } from "./env.binding-keys";
import type { GatewayBindings } from "./env.types";

export type { GatewayBindings, GatewayRuntime } from "./env.types";

type RuntimeState = {
    bindings: GatewayBindings;
    cache: KVNamespace;
    supabase: SupabaseClient;
};

let runtimeState: RuntimeState | null = null;
let runtimeActiveCount = 0;
let lastBindingsSnapshot: GatewayBindings | null = null;
type WaitUntilEntry = {
    id: number;
    handler: (promise: Promise<unknown>) => void;
};
const waitUntilEntries: WaitUntilEntry[] = [];
let nextWaitUntilEntryId = 0;
let waitUntilHandler: ((promise: Promise<unknown>) => void) | null = null;

function snapshotBindings(env: GatewayBindings): GatewayBindings {
    const snap: Partial<GatewayBindings> = {};
    for (const key of BINDING_KEYS) {
        const value = env[key];
        if (value !== undefined) {
            // Ensure we only retain primitive copies (avoid accidental mutation)
            const nextValue = typeof value === "string" ? `${value}` : value;
            (snap as Record<string, unknown>)[key] = nextValue;
        }
    }

    // Backward-compatible aliases used across scripts/docs/tests.
    if (!snap.KV && env.GATEWAY_CACHE) {
        snap.KV = env.GATEWAY_CACHE;
    }
    return Object.freeze(snap) as GatewayBindings;
}

function ensureRuntime(): RuntimeState {
    if (!runtimeState) throw new Error("Gateway runtime not configured");
    return runtimeState;
}

export function configureRuntime(env: GatewayBindings) {
    runtimeActiveCount += 1;
    if (runtimeState) return;

    const bindings = snapshotBindings(env);
    lastBindingsSnapshot = bindings;

    const globalFetch: typeof fetch = (input, init) => fetch(input, init);

    const supabaseAdmin = createClient(bindings.SUPABASE_URL, bindings.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: globalFetch },
    });

    runtimeState = { bindings, cache: bindings.GATEWAY_CACHE, supabase: supabaseAdmin };
}

export function clearRuntime() {
    if (runtimeActiveCount > 0) {
        runtimeActiveCount -= 1;
    }

    if (runtimeActiveCount === 0) {
        runtimeState = null;
        waitUntilEntries.length = 0;
        waitUntilHandler = null;
    }
}

export function ensureRuntimeForBackground(): () => void {
    if (runtimeState) {
        configureRuntime(runtimeState.bindings);
        return () => clearRuntime();
    }
    if (!lastBindingsSnapshot) {
        throw new Error("Gateway runtime not configured");
    }
    configureRuntime(lastBindingsSnapshot);
    return () => clearRuntime();
}

export function setWaitUntil(handler?: (promise: Promise<unknown>) => void): () => void {
    if (!handler) {
        return () => { };
    }

    const entry: WaitUntilEntry = {
        id: ++nextWaitUntilEntryId,
        handler,
    };
    waitUntilEntries.push(entry);
    waitUntilHandler = handler;

    let released = false;
    return () => {
        if (released) return;
        released = true;
        const idx = waitUntilEntries.findIndex((item) => item.id === entry.id);
        if (idx !== -1) {
            waitUntilEntries.splice(idx, 1);
        }
        waitUntilHandler = waitUntilEntries.length ? waitUntilEntries[waitUntilEntries.length - 1].handler : null;
    };
}

export function getBindings(): GatewayBindings {
    return ensureRuntime().bindings;
}

export function dispatchBackground(promise: Promise<unknown>) {
    const handler = waitUntilHandler;
    if (handler) {
        handler(promise.catch((err) => console.error(err)));
        return;
    }
    promise.catch((err) => console.error(err));
}

export function getCache(): KVNamespace {
    return ensureRuntime().cache;
}

export function getSupabaseAdmin(): SupabaseClient {
    return ensureRuntime().supabase;
}

export function getByokKey(version: number): string {
    const bindings = getBindings();
    const raw =
        (bindings as any)[`BYOK_KMS_KEY_V${version}_B64`] ??
        (bindings as any)[`BYOK_KMS_KEY_V${version}`];

    if (!raw) throw new Error(`Missing BYOK key for version ${version}`);

    const s = String(raw).trim().replace(/^["']|["']$/g, "");
    return s.startsWith("base64:") ? s.slice(7) : s;
}



