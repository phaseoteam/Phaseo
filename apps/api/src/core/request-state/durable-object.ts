import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { RequestLedger, type StateStore, type WalletState, type LedgerEvent } from "./ledger";
import { snapshotSlot, validatePublishedKey, type PublishedKey, type SnapshotReference } from "./contracts";
import { digest } from "./snapshots";

export class WorkspaceRequestState extends DurableObject<GatewayBindings> {
    private readonly store: StateStore;
    private readonly ledger: RequestLedger;

    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS request_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        this.store = {
            get: <T>(key: string): T | undefined => {
                const row = ctx.storage.sql.exec<{ value: string }>("SELECT value FROM request_state WHERE key = ?", key).toArray()[0];
                return row ? JSON.parse(row.value) as T : undefined;
            },
            put: (key, value) => { ctx.storage.sql.exec(
                "INSERT INTO request_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                key, JSON.stringify(value)); },
        };
        this.ledger = new RequestLedger(this.store);
    }

    private transaction<T>(operation: () => T): T {
        return this.ctx.storage.transactionSync(operation);
    }

    initializeSynthetic(workspaceId: string, allocationId: string, balanceNanos: number): WalletState {
        if (this.env.ENV !== "staging" || !workspaceId.startsWith("staging:")) throw new Error("synthetic_state_staging_only");
        return this.transaction(() => this.ledger.initialize({ workspaceId, allocationId, balanceNanos, mode: "synthetic" }));
    }

    publishKey(key: PublishedKey): void {
        this.transaction(() => {
            const wallet = this.ledger.wallet();
            validatePublishedKey(key, wallet.workspaceId);
            const previous = this.store.get<PublishedKey>(`key:${key.id}`);
            if (previous) {
                if (previous.kid !== key.kid || previous.hash !== key.hash) throw new Error("key_identity_immutable");
                if (previous.revision > key.revision) throw new Error("stale_key_publication");
                if (previous.revision === key.revision) {
                    if (JSON.stringify(previous) !== JSON.stringify(key)) throw new Error("key_revision_conflict");
                    return;
                }
                if (previous.status === "revoked" && key.status !== "revoked") throw new Error("revoked_key_cannot_reactivate");
            }
            const kidOwner = this.store.get<string>(`kid:${key.kid}`);
            if (kidOwner && kidOwner !== key.id) throw new Error("key_kid_conflict");
            this.store.put(`key:${key.id}`, key);
            this.store.put(`kid:${key.kid}`, key.id);
        });
    }

    key(kid: string): PublishedKey | null {
        const id = this.store.get<string>(`kid:${kid}`);
        return id ? this.store.get<PublishedKey>(`key:${id}`) ?? null : null;
    }

    private assertKey(id: string): PublishedKey {
        const key = this.store.get<PublishedKey>(`key:${id}`);
        if (!key || key.status !== "active" || key.soft_blocked ||
            (key.expires_at !== null && Date.parse(key.expires_at) <= Date.now())) throw new Error("key_not_active");
        return key;
    }

    async publishSnapshot(input: {
        apiKeyId: string; model: string; endpoint: string; testingMode: boolean;
        reference: SnapshotReference; sealed: string;
    }): Promise<void> {
        if (input.sealed.length > 2 * 1024 * 1024 || await digest(input.sealed) !== input.reference.digest ||
            input.reference.validUntil <= Date.now() || !Number.isSafeInteger(input.reference.revision) ||
            input.reference.revision < 1) throw new Error("invalid_snapshot_publication");
        this.transaction(() => {
            this.assertKey(input.apiKeyId);
            const slot = snapshotSlot(input.apiKeyId, input.model, input.endpoint, input.testingMode);
            const previous = this.store.get<SnapshotReference>(`snapshot:${slot}`);
            if (previous && previous.revision >= input.reference.revision) {
                if (JSON.stringify(previous) === JSON.stringify(input.reference)) return;
                throw new Error("stale_snapshot_publication");
            }
            this.store.put(`blob:${input.reference.digest}`, input.sealed);
            this.store.put(`snapshot:${slot}`, input.reference);
            this.store.put(`policy:${input.apiKeyId}`, input.reference);
        });
    }

    preflight(input: { apiKeyId: string; model: string; endpoint: string; testingMode: boolean }) {
        this.assertKey(input.apiKeyId);
        const reference = this.store.get<SnapshotReference>(`snapshot:${snapshotSlot(input.apiKeyId, input.model, input.endpoint, input.testingMode)}`);
        if (!reference || reference.validUntil <= Date.now()) throw new Error("request_snapshot_not_published");
        return { reference, wallet: this.ledger.wallet() };
    }

    policy(apiKeyId: string) {
        this.assertKey(apiKeyId);
        const reference = this.store.get<SnapshotReference>(`policy:${apiKeyId}`);
        if (!reference || reference.validUntil <= Date.now()) throw new Error("request_policy_not_published");
        return reference;
    }

    blob(hash: string): string {
        const raw = this.store.get<string>(`blob:${hash}`);
        if (!raw) throw new Error("request_snapshot_not_published");
        return raw;
    }

    reserve(input: Parameters<RequestLedger["reserve"]>[0]) {
        return this.transaction(() => { this.assertKey(input.keyId); return this.ledger.reserve(input); });
    }
    // Completion remains possible after a key is revoked: revocation blocks new
    // spend, but cannot strand an existing hold or erase the payment obligation.
    settle(id: string, amountNanos: number) { return this.transaction(() => this.ledger.settle(id, amountNanos)); }
    capture(id: string) { return this.transaction(() => this.ledger.capture(id)); }
    charge(id: string, amountNanos: number) { return this.transaction(() => this.ledger.charge(id, amountNanos)); }
    release(id: string) { return this.transaction(() => this.ledger.release(id)); }
    wallet() { return this.ledger.wallet(); }

    pendingEvents(limit = 100): LedgerEvent[] {
        const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 1));
        return this.ctx.storage.sql.exec<{ value: string }>(
            "SELECT value FROM request_state WHERE key >= 'outbox:' AND key < 'outbox;' ORDER BY key LIMIT ?", bounded,
        ).toArray().map(row => JSON.parse(row.value) as LedgerEvent);
    }
}
