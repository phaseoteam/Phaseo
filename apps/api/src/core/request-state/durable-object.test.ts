import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayBindings } from "@/runtime/env.types";
import type { PublishedKey } from "./contracts";
import { digest } from "./snapshots";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {
    constructor(protected ctx: DurableObjectState, protected env: GatewayBindings) {}
} }));
import { WorkspaceRequestState } from "./durable-object";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function harness() {
    const db = new DatabaseSync(":memory:"); databases.push(db);
    const storage = {
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
});
