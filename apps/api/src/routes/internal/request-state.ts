import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { configureRuntime, clearRuntime, setWaitUntil, getSupabaseAdmin } from "@/runtime/env";
import { withoutSupabase } from "@/runtime/request-state-scope";
import { workspaceState, requestStateEnabled } from "@core/request-state/client";
import { digest, sealSnapshot } from "@core/request-state/snapshots";
import type { CompiledRequestSnapshot, PublishedKey, SnapshotReference } from "@core/request-state/contracts";
import { hashRequestStateSecret } from "@/pipeline/before/auth";
import { fetchGatewayContext } from "@/pipeline/before/context";
import { fetchWorkspacePolicy } from "@/pipeline/before/workspacePolicy";
import { computeStaticTtl } from "@/pipeline/before/context.shared";
import { beforeRequest } from "@/pipeline/before";
import { Timer } from "@/pipeline/telemetry/timer";
import type { Endpoint } from "@core/types";
import { reserveWalletCredits, captureWalletReservation, releaseWalletReservation, settleWalletReservation } from "@core/wallet-reservations";
import { recordUsageAndCharge } from "@/pipeline/pricing/persist";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { normalizeCapability } from "@/executors";
import { bodyLimit } from "hono/body-limit";

export const internalRequestStateRoutes = new Hono<Env>();

function authorized(provided: string, expected: string): boolean {
    if (expected.length < 128 || provided.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
    return difference === 0;
}

internalRequestStateRoutes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!requestStateEnabled(c.env)) return c.json({ error: "request_state_disabled" }, 404);
    if (!authorized(c.req.header("x-internal-token") ?? "", c.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "")) {
        return c.json({ error: "unauthorized" }, 401);
    }
    if (Number(c.req.header("content-length") ?? 0) > 64_000) return c.json({ error: "body_too_large" }, 413);
    configureRuntime(c.env);
    const releaseWait = setWaitUntil(promise => c.executionCtx.waitUntil(promise));
    try { await next(); }
    finally { releaseWait(); clearRuntime(); }
});
internalRequestStateRoutes.use("*", bodyLimit({ maxSize: 64_000 }));

const targetSchema = z.object({ model: z.string().min(1).max(256), endpoint: z.string().min(1).max(64) }).strict();
const publishSchema = z.object({
    sourceWorkspaceId: z.uuid(), sourceKeyId: z.uuid(),
    targets: z.array(targetSchema).min(1).max(8),
}).strict();

// Compilation is an explicit control-plane operation. It reads current source
// records, but never opens a production wallet allocation or changes a real key.
internalRequestStateRoutes.post("/publish", async c => {
    const input = publishSchema.parse(await c.req.json());
    const env = c.env;
    if (!env.GATEWAY_REQUEST_STATE_KV || !env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY || !env.KEY_PEPPER_ACTIVE) {
        return c.json({ error: "request_state_bindings_missing" }, 503);
    }
    const source = await getSupabaseAdmin().from("keys").select("id,status,workspace_id")
        .eq("id", input.sourceKeyId).eq("workspace_id", input.sourceWorkspaceId).maybeSingle();
    if (source.error || source.data?.status !== "active") return c.json({ error: "source_key_unavailable" }, 400);
    const workspaceId = `staging:${crypto.randomUUID()}`;
    const apiKeyId = crypto.randomUUID();
    const kid = `edge${crypto.randomUUID().replaceAll("-", "")}`;
    const secret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const key: PublishedKey = { id: apiKeyId, kid, workspace_id: workspaceId, status: "active",
        hash: await hashRequestStateSecret(secret, env.KEY_PEPPER_ACTIVE.trim()), expires_at: null, soft_blocked: false, revision: 1 };
    const stub = workspaceState(workspaceId, env);
    await stub.initializeSynthetic(workspaceId, `synthetic:${workspaceId}`, 10_000_000_000);
    await stub.publishKey(key);
    const policy = await fetchWorkspacePolicy({ workspaceId: input.sourceWorkspaceId, apiKeyId: input.sourceKeyId });
    const publications: { model: string; endpoint: string; compileMs: number; validUntil: number }[] = [];
    const targets = [...new Map(input.targets.map(target => {
        const normalized = { ...target, endpoint: normalizeCapability(resolveCapabilityFromEndpoint(target.endpoint as Endpoint)) };
        return [JSON.stringify(normalized), normalized];
    })).values()];
    for (const target of targets) {
        const start = performance.now();
        const context = await fetchGatewayContext({ workspaceId: input.sourceWorkspaceId,
            apiKeyId: input.sourceKeyId, ...target, disableCache: true });
        const ttl = computeStaticTtl(context);
        if (ttl === null) throw new Error("pricing_boundary_requires_republication");
        const validUntil = Math.min(Date.now() + ttl * 1000, context.publicCatalogExpiresAt ?? Number.MAX_SAFE_INTEGER);
        const compiled: CompiledRequestSnapshot = { version: 1, workspaceId, apiKeyId, ...target,
            testingMode: false, validUntil, policy,
            context: { ...context, workspaceId, contextTelemetry: undefined } };
        const sealed = await sealSnapshot(compiled, env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY);
        const hash = await digest(sealed);
        const reference: SnapshotReference = { key: `snapshot:v1:${workspaceId}:${hash}`, digest: hash, validUntil, revision: 1 };
        // No expirationTtl: the immutable object survives cache eviction. Its
        // executable lifetime is controlled by the active reference and deadline.
        await env.GATEWAY_REQUEST_STATE_KV.put(reference.key, sealed);
        await stub.publishSnapshot({ apiKeyId, ...target, testingMode: false, reference, sealed });
        publications.push({ ...target, compileMs: performance.now() - start, validUntil });
    }
    await env.GATEWAY_REQUEST_STATE_KV.put(`directory:${kid}`, workspaceId);
    return c.json({ workspaceId, apiKeyId, kid, token: `phaseo_v1_sk_${kid}_${secret}`, publications,
        mode: "synthetic", providerDispatchAllowed: false });
});

const benchmarkSchema = z.object({ endpoint: z.string().min(1).max(64), token: z.string().max(512),
    body: z.record(z.string(), z.unknown()) }).strict();

internalRequestStateRoutes.post("/preflight", async c => {
    const input = benchmarkSchema.parse(await c.req.json());
    const req = new Request("https://api-staging.phaseo.app/v1/request-state-benchmark", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.token}`,
            "x-internal-token": c.req.header("x-internal-token")! }, body: JSON.stringify(input.body),
    });
    const timer = new Timer();
    const result = await withoutSupabase(() => beforeRequest(req, input.endpoint as Endpoint, timer));
    if (result.value.ok === false) {
        return c.json({ ok: false, supabaseAttempts: result.attempts, timings: timer.snapshot(),
            pipelineStatus: result.value.response.status, error: await result.value.response.json() }, 422);
    }
    return c.json({ ok: result.attempts === 0, supabaseAttempts: result.attempts,
        preflightMs: timer.elapsed("request_start"), timings: timer.snapshot(),
        providerCount: result.value.ctx.providers.length,
        model: result.value.ctx.model, providerDispatchAllowed: false });
});

const walletSchema = z.object({ workspaceId: z.string().startsWith("staging:").max(100),
    apiKeyId: z.uuid(), reservationId: z.string().min(1).max(128),
    action: z.enum(["reserve", "settle", "capture", "release", "charge"]),
    kind: z.enum(["inference", "hold"]).default("inference"),
    amountNanos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
}).strict();

internalRequestStateRoutes.post("/wallet", async c => {
    const input = walletSchema.parse(await c.req.json());
    const start = performance.now();
    const result = await withoutSupabase(async () => {
        const identity = { workspaceId: input.workspaceId, reservationId: input.reservationId, keyId: input.apiKeyId };
        if (input.action === "charge") return recordUsageAndCharge({ workspaceId: input.workspaceId, requestId: input.reservationId, cost_nanos: input.amountNanos });
        if (input.action === "reserve") return reserveWalletCredits({ ...identity, amountNanos: input.amountNanos });
        if (input.action === "settle") return settleWalletReservation({ ...identity, actualNanos: input.amountNanos });
        if (input.action === "capture") return captureWalletReservation(identity);
        return releaseWalletReservation(identity);
    });
    return c.json({ ...result.value, elapsedMs: performance.now() - start, supabaseAttempts: result.attempts });
});

internalRequestStateRoutes.post("/revoke", async c => {
    const input = z.object({ workspaceId: z.string().startsWith("staging:").max(100), kid: z.string().max(64) }).strict().parse(await c.req.json());
    const stub = workspaceState(input.workspaceId, c.env);
    const key = await stub.key(input.kid);
    if (!key) return c.json({ error: "key_not_found" }, 404);
    await stub.publishKey({ ...key, status: "revoked", revision: key.revision + 1 });
    return c.json({ ok: true });
});

internalRequestStateRoutes.onError((error, c) => {
    // Never return compiled context, credentials, or arbitrary source errors.
    console.error("request_state_operation_failed", { name: error.name });
    return c.json({ error: error instanceof z.ZodError ? "invalid_request" : "request_state_operation_failed" }, 400);
});
