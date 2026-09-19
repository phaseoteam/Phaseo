import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayBindings } from "@/runtime/env.types";
import type { PublishedKey } from "./contracts";
import { digest } from "./snapshots";
import type { RealtimeSessionRow } from "../realtime-sessions";
import { configureRuntime, clearRuntime } from "@/runtime/env";
import { withoutSupabase } from "@/runtime/request-state-scope";
import { upsertAsyncOperation, getAsyncOperation, patchAsyncOperationMeta, setAsyncOperationStatus, markAsyncOperationBilled, listTeamAsyncOperations } from "../async-operations";
import { saveBatchRequestRows, listBatchRequestRows } from "../batch-requests";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {
    constructor(protected ctx: DurableObjectState, protected env: GatewayBindings) {}
} }));
import { WorkspaceRequestState } from "./durable-object";

const databases: DatabaseSync[] = [];
afterEach(() => { clearRuntime(); for (const db of databases.splice(0)) db.close(); vi.unstubAllGlobals(); });

function harness() {
    const db = new DatabaseSync(":memory:"); databases.push(db);
    const storage = {
        setAlarm: vi.fn(async () => undefined),
        sql: { exec: (query: string, ...args: (string | number)[]) => {
            const statement = db.prepare(query);
            if (/^SELECT/.test(query)) return { toArray: () => statement.all(...args) };
            statement.run(...args); return { toArray: () => [] };
        } },
        transactionSync: <T>(operation: () => T): T => {
            db.exec("BEGIN");
            try { const result = operation(); db.exec("COMMIT"); return result; }
            catch (error) { db.exec("ROLLBACK"); throw error; }
        },
    };
    const ctx = { storage } as unknown as DurableObjectState;
    const env = { ENV: "staging" } as GatewayBindings;
    const object = new WorkspaceRequestState(ctx, env);
    object.initializeSynthetic("staging:workspace", "allocation", 1000);
    const key: PublishedKey = { id: "key", kid: "edge123456789012", workspace_id: "staging:workspace",
        hash: "a".repeat(64), status: "active", soft_blocked: false, revision: 1, expires_at: null };
    object.publishKey(key);
    return { object, ctx, env, key, db };
}

describe("workspace durable state", () => {
    it("survives object recreation with reservations and its atomic outbox intact", () => {
        const { object, ctx, env } = harness();
        object.reserve({ id: "video", keyId: "key", kind: "hold", amountNanos: 700 });
        const restarted = new WorkspaceRequestState(ctx, env);
        expect(restarted.wallet().reservedNanos).toBe(700);
        restarted.settle("video", 500);
        expect(restarted.pendingEvents().map(e => [e.sequence, e.reservation.status])).toEqual([[1, "held"], [2, "captured"]]);
        expect(restarted.wallet()).toMatchObject({ balanceNanos: 500, reservedNanos: 0 });
    });
    it("rolls accounting back when durable outbox persistence fails", () => {
        const { object, db } = harness();
        db.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON request_state WHEN NEW.key LIKE 'outbox:%' BEGIN SELECT RAISE(ABORT, 'disk failure'); END");
        expect(() => object.reserve({ id: "request", keyId: "key", kind: "inference", amountNanos: 200 })).toThrow();
        expect(object.wallet()).toMatchObject({ balanceNanos: 1000, reservedNanos: 0, sequence: 0 });
        expect(object.pendingEvents()).toEqual([]);
    });
    it("blocks revoked keys immediately, preserves settlement, and rejects stale resurrection", () => {
        const { object, key } = harness();
        object.reserve({ id: "held", keyId: key.id, kind: "hold", amountNanos: 600 });
        object.publishKey({ ...key, status: "revoked", revision: 2 });
        expect(() => object.reserve({ id: "next", keyId: key.id, kind: "hold", amountNanos: 1 })).toThrow("key_not_active");
        expect(() => object.publishKey(key)).toThrow("stale_key_publication");
        expect(() => object.publishKey({ ...key, revision: 3 })).toThrow("revoked_key_cannot_reactivate");
        expect(object.settle("held", 500).applied).toBe(true);
    });
    it("isolates key owners and rejects expired keys", () => {
        const { object, key } = harness();
        expect(() => object.publishKey({ ...key, workspace_id: "other" })).toThrow("invalid_published_key");
        object.publishKey({ ...key, revision: 2, expires_at: new Date(Date.now() - 1000).toISOString() });
        expect(() => object.reserve({ id: "expired", keyId: key.id, kind: "hold", amountNanos: 1 })).toThrow("key_not_active");
    });
    it("publishes a pointer and fallback blob atomically, without accepting old revisions", async () => {
        const { object } = harness();
        const sealed = "opaque encrypted bytes";
        const hash = await digest(sealed);
        const reference = { digest: hash, key: "kv-key", validUntil: Date.now() + 60_000, revision: 2 };
        const identity = { apiKeyId: "key", model: "model", endpoint: "text.generate", testingMode: false };
        await object.publishSnapshot({ ...identity, reference, sealed });
        expect(object.preflight(identity).reference).toEqual(reference);
        expect(object.blob(hash)).toBe(sealed);
        await expect(object.publishSnapshot({ ...identity, reference: { ...reference, revision: 1 }, sealed })).rejects.toThrow("stale_snapshot_publication");
        expect(() => object.preflight({ ...identity, apiKeyId: "another" })).toThrow("key_not_active");
        expect(() => object.preflight({ ...identity, model: "another" })).toThrow("request_snapshot_not_published");
    });
    it("does not allow a synthetic allocation outside staging or for a production workspace", () => {
        const { ctx } = harness();
        const production = new WorkspaceRequestState(ctx, { ENV: "production" } as GatewayBindings);
        expect(() => production.initializeSynthetic("staging:workspace", "allocation", 1000)).toThrow("synthetic_state_staging_only");
        const staging = new WorkspaceRequestState(ctx, { ENV: "staging" } as GatewayBindings);
        expect(() => staging.initializeSynthetic("real-workspace", "allocation", 1000)).toThrow("synthetic_state_staging_only");
    });
    it("keeps a cumulative one-dollar allocation capped across admissions, restart and retries", async () => {
        const { ctx, db } = harness();
        // Separate empty object storage; no synthetic balance is converted.
        db.exec("DELETE FROM request_state");
        const workspaceId = "00000000-0000-4000-8000-000000000001";
        const env = { ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "escrow", GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID: workspaceId } as GatewayBindings;
        const object = new WorkspaceRequestState(ctx, env);
        const allocation = { workspaceId, allocationId: "allocation", capNanos: 1_000_000_000 };
        await expect(object.initializeEscrow({ ...allocation, capNanos: 1_000_000_001 })).rejects.toThrow("invalid_test_cap");
        await object.initializeEscrow(allocation);
        object.commitPublication(object.beginPublication(), Date.now() + 60_000);
        object.publishKey({ id: "key", kid: "normal123456", workspace_id: workspaceId, hash: "a".repeat(64), status: "active", soft_blocked: false, revision: 1, expires_at: null });
        expect(() => object.charge("not-admitted", 1)).toThrow("inference_admission_required");
        object.reserve({ id: "one", keyId: "key", kind: "inference", amountNanos: 700_000_000 });
        expect(object.reserve({ id: "two", keyId: "key", kind: "hold", amountNanos: 400_000_000 }).status).toBe("insufficient_funds");
        object.charge("one", 600_000_000);
        const restarted = new WorkspaceRequestState(ctx, env);
        await restarted.initializeEscrow(allocation);
        expect(restarted.wallet().balanceNanos).toBe(400_000_000);
        expect(restarted.charge("one", 600_000_000).alreadyApplied).toBe(true);
        expect(restarted.reserve({ id: "one", keyId: "key", kind: "inference", amountNanos: 700_000_000 }).status).toBe("captured");
    });
    it("retries an uncertain projection without acknowledging or losing the durable event", async () => {
        const { ctx, db } = harness(); db.exec("DELETE FROM request_state");
        const workspaceId = "00000000-0000-4000-8000-000000000001";
        const env = { ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "escrow", GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID: workspaceId,
            SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" } as GatewayBindings;
        const object = new WorkspaceRequestState(ctx, env);
        await object.initializeEscrow({ workspaceId, allocationId: "allocation", capNanos: 1000 });
        object.commitPublication(object.beginPublication(), Date.now() + 60_000);
        object.publishKey({ id: "key", kid: "normal123456", workspace_id: workspaceId, hash: "a".repeat(64), status: "active", soft_blocked: false, revision: 1, expires_at: null });
        object.reserve({ id: "one", keyId: "key", kind: "inference", amountNanos: 700 });
        const remote = new Set<number>(); let loseAck = true;
        vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
            const { p_event } = JSON.parse(init.body); remote.add(p_event.sequence);
            if (loseAck) { loseAck = false; throw new Error("lost_ack"); }
            return Response.json(p_event.sequence);
        }));
        await expect(object.alarm()).rejects.toThrow("lost_ack");
        expect(object.pendingEvents()).toHaveLength(1);
        expect(object.projectionStatus().acknowledged).toBe(0);
        const restarted = new WorkspaceRequestState(ctx, env);
        await restarted.alarm();
        expect(remote.size).toBe(1);
        expect(restarted.pendingEvents()).toHaveLength(0);
        expect(restarted.projectionStatus()).toEqual({ sequence: 1, acknowledged: 1 });
        expect(ctx.storage.setAlarm).toHaveBeenCalledTimes(3);
    });
    it("preserves async ownership, monotonic status, atomic metadata and webhook lease fencing", () => {
        const { object, ctx, env } = harness();
        const row = { workspace_id: "staging:workspace", kind: "batch", internal_id: "job", native_id: "provider-job", status: "in_progress", meta: { webhook: { endpoint_id: "endpoint" } } };
        object.rowPut("gateway_async_operations", row, 0);
        expect(() => object.rowPut("gateway_async_operations", { ...row, workspace_id: "other" })).toThrow("lifecycle_workspace_mismatch");
        object.rowPatch("gateway_async_operations", row, { status: "pending", meta: { progress: 1 } }, undefined, true);
        object.rowPatch("gateway_async_operations", row, { status: "completed" });
        const restarted = new WorkspaceRequestState(ctx, env);
        expect(restarted.rowGet("gateway_async_operations", row)?.row).toMatchObject({ status: "completed", native_id: "provider-job", meta: { progress: 1 } });
        expect(restarted.rowList("gateway_async_webhook_deliveries")).toHaveLength(3);
        const claim = { workspaceId: "staging:workspace", kind: "batch" as const, internalId: "job", deliveryKey: "batch.completed", claimToken: "first" };
        expect(restarted.webhookClaim("claim", claim)).toBe(true);
        expect(restarted.webhookClaim("claim", { ...claim, claimToken: "second" })).toBe(false);
        expect(() => restarted.webhookResult({ ...claim, claimToken: "second", attempt: {} })).toThrow("stale_webhook_delivery_claim");
        restarted.webhookResult({ ...claim, attempt: {}, deliveredAt: new Date().toISOString() });
        expect(restarted.webhookClaim("claim", claim)).toBe(false);
        expect(restarted.rowMarkBilled("batch", "job")).toBe(true);
        expect(restarted.rowMarkBilled("batch", "job")).toBe(false);
    });
    it("continues accounting projection when configuration refresh is unavailable", async () => {
        const { ctx, db } = harness(); db.exec("DELETE FROM request_state");
        const workspaceId = "00000000-0000-4000-8000-000000000001";
        const env = { ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "escrow", GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID: workspaceId,
            SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only",
            GATEWAY_PUBLIC_BASE_URL: "https://api-staging.phaseo.app", GATEWAY_INTERNAL_TEST_TOKEN: "fixture" } as GatewayBindings;
        const object = new WorkspaceRequestState(ctx, env);
        await object.initializeEscrow({ workspaceId, allocationId: "allocation", capNanos: 1000 });
        object.commitPublication(object.beginPublication(), Date.now() + 60_000);
        object.publishKey({ id: "key", kid: "normal123456", workspace_id: workspaceId, hash: "a".repeat(64), status: "active", soft_blocked: false, revision: 1, expires_at: null });
        object.reserve({ id: "one", keyId: "key", kind: "inference", amountNanos: 700 });
        const refreshLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", vi.fn(async (url, init) => {
            if (String(url).endsWith("/refresh")) throw new Error("offline");
            return Response.json(JSON.parse(init.body).p_event.sequence);
        }));
        try {
            await object.alarm();
            expect(object.pendingEvents()).toHaveLength(0);
            expect(object.projectionStatus()).toEqual({ sequence: 1, acknowledged: 1 });
            expect(refreshLog).toHaveBeenCalledWith("request_state_refresh_failed", { reason: "unavailable" });
        } finally { refreshLog.mockRestore(); }
    });
    it("persists file upload quotas and rejects duplicate provider submissions", () => {
        const { object, ctx, env } = harness();
        expect(object.fileClaim("one", 1)).toEqual({ ok: true, reason: null });
        expect(object.fileClaim("one", 1).reason).toBe("batch_file_upload_already_claimed");
        expect(object.fileClaim("huge", 21 * 1024 * 1024).reason).toBe("batch_file_too_large");
        for (let i = 1; i < 20; i++) expect(object.fileClaim(`file-${i}`, 1).ok).toBe(true);
        const restarted = new WorkspaceRequestState(ctx, env);
        expect(restarted.fileClaim("twenty-first", 1).reason).toBe("batch_file_hourly_quota_exceeded");
    });
    it("atomically creates, claims, extends and settles a realtime session across restart", () => {
        const { object, ctx, env } = harness();
        const row = { id: "id", session_id: "rt_test", workspace_id: "staging:workspace", key_id: "key", user_id: null,
            provider: "openai", model_id: "model", status: "created", expires_at: new Date(Date.now() + 60_000).toISOString(),
            reservation_prefix: "rt:test:", provider_client_secret_hash: "hash", estimated_cost_nanos: 0 } as RealtimeSessionRow;
        object.realtimeCreate({ row, holdNanos: 600, maxWorkspaceSessions: 8, maxKeySessions: 4, maxUserSessions: 1, maxCreationsPerMinute: 8 });
        expect(object.wallet().reservedNanos).toBe(600);
        expect(() => object.realtimeClaim(row.session_id, "wrong")).toThrow("realtime_relay_claim_conflict");
        expect(object.realtimeClaim(row.session_id, "hash").status).toBe("connecting");
        expect(() => object.realtimeClaim(row.session_id, "hash")).toThrow("realtime_relay_claim_conflict");
        object.realtimeExtend(row.session_id, "extension", 900, 300);
        expect(object.wallet().reservedNanos).toBe(900);
        const restarted = new WorkspaceRequestState(ctx, env);
        expect(() => restarted.realtimeSettle(row.session_id, 901, { status: "completed" })).toThrow("realtime_reservation_exceeded");
        expect(restarted.wallet().reservedNanos).toBe(900);
        expect(restarted.realtimeSettle(row.session_id, 700, { status: "completed", usage: {} }).session).toMatchObject({ captured_nanos: 700, released_nanos: 200 });
        expect(restarted.realtimeSettle(row.session_id, 700, { status: "completed" }).alreadyApplied).toBe(true);
        expect(restarted.wallet()).toMatchObject({ balanceNanos: 300, reservedNanos: 0 });
        expect(() => restarted.realtimeSettle(row.session_id, 0, { status: "completed" })).toThrow("realtime_settlement_conflict");
    });
    it("rolls realtime session creation back when its initial hold exceeds available credit", () => {
        const { object } = harness();
        const row = { session_id: "rt_rejected", workspace_id: "staging:workspace", key_id: "key", reservation_prefix: "rt:no:" } as RealtimeSessionRow;
        expect(() => object.realtimeCreate({ row, holdNanos: 1001, maxWorkspaceSessions: 8, maxKeySessions: 4, maxUserSessions: 1, maxCreationsPerMinute: 8 })).toThrow("realtime_hold_insufficient_funds");
        expect(object.rowGet("gateway_realtime_sessions", { session_id: row.session_id })).toBeNull();
        expect(object.wallet().sequence).toBe(0);
    });
    it("fences mutations durably and cannot commit an obsolete publication", async () => {
        const { ctx, db } = harness(); db.exec("DELETE FROM request_state");
        const workspaceId = "00000000-0000-4000-8000-000000000001";
        const env = { ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "escrow", GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID: workspaceId } as GatewayBindings;
        const object = new WorkspaceRequestState(ctx, env);
        await object.initializeEscrow({ workspaceId, allocationId: "allocation", capNanos: 1000 });
        object.publishKey({ id: "key", kid: "normal123456", workspace_id: workspaceId, hash: "a".repeat(64), status: "active", soft_blocked: false, revision: 1, expires_at: null });
        object.commitPublication(object.beginPublication(), Date.now() + 60_000);
        object.beginMutation("mutation-token-123456");
        const restarted = new WorkspaceRequestState(ctx, env);
        expect(() => restarted.key("normal123456")).toThrow("request_state_publication_pending");
        const older = restarted.beginPublication();
        expect(() => restarted.commitPublication(older, Date.now() + 60_000)).toThrow("publication_superseded");
        restarted.finishMutation("mutation-token-123456");
        const newer = restarted.beginPublication();
        expect(() => restarted.commitPublication(older, Date.now() + 60_000)).toThrow("publication_superseded");
        restarted.commitPublication(newer, Date.now() + 60_000);
        expect(restarted.key("normal123456")?.id).toBe("key");
        const again = new WorkspaceRequestState(ctx, env);
        again.beginMutation("mutation-token-123456");
        expect(again.publicationStatus()).toMatchObject({ dirty: false, pendingMutations: 0 });
    });
    it("uses the existing async and batch repository interfaces without database access", async () => {
        const { object } = harness();
        configureRuntime({ ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "synthetic", SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-only", WORKSPACE_REQUEST_STATE: { getByName: () => object } } as unknown as GatewayBindings);
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unexpected_network"); }));
        const checked = await withoutSupabase(async () => {
            const identity = { workspaceId: "staging:workspace", kind: "batch" as const, internalId: "batch_1" };
            await upsertAsyncOperation({ ...identity, provider: "openai", nativeId: "native_1", status: "in_progress", meta: {} });
            await patchAsyncOperationMeta({ ...identity, metaPatch: { rows: 1 } });
            await setAsyncOperationStatus({ ...identity, status: "completed", metaPatch: { charged: true } });
            expect((await getAsyncOperation(identity.workspaceId, identity.kind, identity.internalId))?.meta).toEqual({ rows: 1, charged: true });
            expect(await markAsyncOperationBilled(identity.workspaceId, identity.kind, identity.internalId)).toBe(true);
            expect(await markAsyncOperationBilled(identity.workspaceId, identity.kind, identity.internalId)).toBe(false);
            expect(await listTeamAsyncOperations({ workspaceId: identity.workspaceId, kind: "batch" })).toHaveLength(1);
            await saveBatchRequestRows({ workspaceId: identity.workspaceId, batchId: identity.internalId, rows: [{ provider: "openai", customId: "row_1", requestIndex: 0, status: "completed", costNanos: 12 }] });
            expect((await listBatchRequestRows({ workspaceId: identity.workspaceId, batchId: identity.internalId }))[0]).toMatchObject({ customId: "row_1", status: "completed", costNanos: 12 });
        });
        expect(checked.attempts).toBe(0);
    });
});
