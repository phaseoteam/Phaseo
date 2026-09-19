import { dispatchBackground, getBindings, getBindingsIfConfigured } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import { validateSnapshot, type CompiledRequestSnapshot, type SnapshotReference } from "./contracts";
import { loadSnapshot } from "./snapshots";

export function requestStateEnabled(bindings = getBindingsIfConfigured()): boolean {
    return bindings?.ENV === "staging" && (bindings.GATEWAY_REQUEST_STATE_MODE === "synthetic" || bindings.GATEWAY_REQUEST_STATE_MODE === "published");
}

export function workspaceState(workspaceId: string, bindings: GatewayBindings = getBindings()) {
    if (!requestStateEnabled(bindings) || !bindings.WORKSPACE_REQUEST_STATE ||
        !(workspaceId.startsWith("staging:") || (bindings.GATEWAY_REQUEST_STATE_MODE === "published" && workspaceId === bindings.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID))) {
        throw new Error("request_state_not_enabled");
    }
    return bindings.WORKSPACE_REQUEST_STATE.getByName(workspaceId);
}

export function isSyntheticWorkspace(workspaceId: string): boolean { return workspaceId.startsWith("staging:"); }
export function isRequestStateWorkspace(workspaceId: string): boolean {
    const env = getBindingsIfConfigured();
    return isSyntheticWorkspace(workspaceId) || Boolean(requestStateEnabled(env) && env?.GATEWAY_REQUEST_STATE_MODE === "published" && workspaceId === env.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID);
}
export function isSyntheticKey(kid: string): boolean { return /^edge[A-Za-z0-9]{12,60}$/.test(kid); }
export function publishedWorkspace(): string | null {
    const env = getBindingsIfConfigured();
    return requestStateEnabled(env) && env?.GATEWAY_REQUEST_STATE_MODE === "published" ? env.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID ?? null : null;
}

export async function readPublishedKey(kid: string) {
    const bindings = getBindings();
    if (!requestStateEnabled(bindings) || !bindings.GATEWAY_REQUEST_STATE_KV) throw new Error("request_state_not_enabled");
    const workspaceId = await bindings.GATEWAY_REQUEST_STATE_KV.get(`directory:${kid}`, "text");
    if (!workspaceId) return null;
    return workspaceState(workspaceId, bindings).key(kid);
}

async function snapshot(reference: SnapshotReference, workspaceId: string): Promise<CompiledRequestSnapshot> {
    const env = getBindings();
    if (!env.GATEWAY_REQUEST_STATE_KV || !env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY) throw new Error("request_state_bindings_missing");
    const stub = workspaceState(workspaceId, env);
    const loaded = await loadSnapshot({ reference, kv: env.GATEWAY_REQUEST_STATE_KV,
        secret: env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY, durableFallback: () => stub.blob(reference.digest),
        waitUntil: dispatchBackground, cache: typeof caches === "undefined" ? undefined : caches.default });
    return loaded.snapshot;
}

export async function readPublishedContext(args: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; includeTestingMode?: boolean;
}) {
    const started = performance.now();
    const identity = { ...args, testingMode: Boolean(args.includeTestingMode) };
    const { reference, wallet } = await workspaceState(args.workspaceId).preflight(identity);
    const compiled = await snapshot(reference, args.workspaceId);
    validateSnapshot(compiled, identity);
    const available = wallet.balanceNanos - wallet.reservedNanos;
    const enoughCredit = available >= 1_000_000_000;
    return { ...compiled.context,
        credit: { ...compiled.context.credit, ok: enoughCredit,
            reason: enoughCredit ? null : "insufficient_funds", balanceNanos: available },
        contextTelemetry: { cacheStatus: "hit" as const, totalMs: performance.now() - started,
            keyVersionMs: 0, cacheReadMs: performance.now() - started, creditRefreshMs: 0,
            rpcMs: 0, enrichMs: 0, cacheWriteMs: 0, fallbackRemap: false },
    };
}

export async function readPublishedPolicy(args: { workspaceId: string; apiKeyId: string }) {
    const reference = await workspaceState(args.workspaceId).policy(args.apiKeyId);
    const compiled = await snapshot(reference, args.workspaceId);
    if (compiled.workspaceId !== args.workspaceId || compiled.apiKeyId !== args.apiKeyId || compiled.validUntil <= Date.now()) {
        throw new Error("request_policy_scope_mismatch");
    }
    return compiled.policy;
}
