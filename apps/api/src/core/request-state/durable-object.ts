import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { RequestLedger, type StateStore, type WalletState, type LedgerEvent } from "./ledger";
import { snapshotSlot, validatePublishedKey, type PublishedKey, type SnapshotReference } from "./contracts";
import { digest } from "./snapshots";
import { projectAccountingEvent, projectLifecycleRow } from "./projection";
import { LifecycleRows, type LifecycleRow, type RowFilter, type RowTable } from "./rows";
import { WebhookState } from "./webhook-state";
import type { PublicationTarget } from "./publisher";
import { RealtimeState, type RealtimeCreation } from "./realtime-state";

export class WorkspaceRequestState extends DurableObject<GatewayBindings> {
    private readonly store: StateStore;
    private readonly ledger: RequestLedger;
    private readonly rows: LifecycleRows;
    private readonly webhooks: WebhookState;
    private readonly realtime: RealtimeState;

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
        this.rows = new LifecycleRows(ctx.storage.sql, () => this.ledger.wallet().workspaceId);
        this.webhooks = new WebhookState(this.rows, () => this.ledger.wallet().workspaceId);
        this.realtime = new RealtimeState(this.rows, this.ledger, this.store);
    }

    private transaction<T>(operation: () => T): T {
        return this.ctx.storage.transactionSync(operation);
    }

    initializeSynthetic(workspaceId: string, allocationId: string, balanceNanos: number): WalletState {
        if (this.env.ENV !== "staging" || !workspaceId.startsWith("staging:")) throw new Error("synthetic_state_staging_only");
        return this.transaction(() => this.ledger.initialize({ workspaceId, allocationId, balanceNanos, mode: "synthetic" }));
    }

    async initializeEscrow(input: { workspaceId: string; allocationId: string; capNanos: number }): Promise<WalletState> {
        if (this.env.ENV !== "staging" || this.env.GATEWAY_REQUEST_STATE_MODE !== "escrow" ||
            input.workspaceId !== this.env.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID ||
            !/^[0-9a-f-]{36}$/.test(input.workspaceId)) throw new Error("escrow_workspace_not_allowed");
        const wallet = this.transaction(() => this.ledger.initialize({ workspaceId: input.workspaceId,
            allocationId: input.allocationId, balanceNanos: input.capNanos, mode: "escrow" }));
        // The initializer is called only after the SQL allocation succeeds. The
        // recurring alarm is persisted before any admission may succeed.
        await this.ctx.storage.setAlarm(Date.now() + 5_000);
        this.store.put("projection:enabled", true);
        return wallet;
    }

    async alarm(): Promise<void> {
        const wallet = this.ledger.wallet();
        if (wallet.mode !== "escrow" || this.env.ENV !== "staging" ||
            wallet.workspaceId !== this.env.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID) return;
        // Schedule first: a long outage must not exhaust automatic alarm retries
        // and leave a durable outbox stranded forever.
        await this.ctx.storage.setAlarm(Date.now() + 5_000);
        const origin = this.env.GATEWAY_PUBLIC_BASE_URL;
        // Refresh failure fences new admissions through the publication lease,
        // but must not strand accounting for requests already admitted.
        if (origin && this.env.GATEWAY_INTERNAL_TEST_TOKEN) {
            try {
                const refreshed = await fetch(`${origin}/internal/request-state/refresh`, { method: "POST",
                    headers: { "x-internal-token": this.env.GATEWAY_INTERNAL_TEST_TOKEN }, signal: AbortSignal.timeout(60_000) });
                if (!refreshed.ok) console.error("request_state_refresh_failed", { status: refreshed.status });
            } catch {
                console.error("request_state_refresh_failed", { reason: "unavailable" });
            }
        }
        for (const event of this.pendingEvents()) {
            const sequence = await projectAccountingEvent(this.env, event);
            this.transaction(() => {
                const previous = this.store.get<number>("projection:ack") ?? 0;
                if (sequence !== previous + 1) throw new Error("projection_ack_sequence_gap");
                this.store.put("projection:ack", sequence);
                this.ctx.storage.sql.exec("DELETE FROM request_state WHERE key = ?", `outbox:${String(sequence).padStart(16, "0")}`);
            });
        }
        for (const event of this.rows.pending()) {
            await projectLifecycleRow(this.env, event);
            this.rows.acknowledge(event);
        }
    }

    projectionStatus() {
        return { sequence: this.ledger.wallet().sequence, acknowledged: this.store.get<number>("projection:ack") ?? 0 };
    }
    publicationStatus() {
        return { dirty: this.store.get<boolean>("publication:dirty") ?? true,
            validUntil: this.store.get<number>("publication:validUntil") ?? 0,
            pendingMutations: (this.store.get<string[]>("publication:mutations") ?? []).length,
            targets: this.store.get<PublicationTarget[]>("publication:targets") ?? [] };
    }
    setPublicationTargets(targets: PublicationTarget[]) {
        if (targets.length < 1 || targets.length > 32) throw new Error("invalid_publication_targets");
        this.store.put("publication:targets", targets);
        this.store.put("publication:dirty", true);
    }

    rowGet(table: RowTable, identity: LifecycleRow) { return this.rows.get(table, identity); }
    rowList(table: RowTable, filter?: RowFilter) { return this.rows.list(table, filter); }
    rowPut(table: RowTable, row: LifecycleRow, expectedRevision?: number) {
        return this.transaction(() => this.rows.put(table, row, expectedRevision));
    }
    rowPatch(table: RowTable, identity: LifecycleRow, patch: LifecycleRow, expectedRevision?: number, mergeMeta = false) {
        return this.transaction(() => this.rows.patch(table, identity, patch, expectedRevision, mergeMeta));
    }
    rowMarkBilled(kind: string, internalId: string): boolean {
        return this.transaction(() => {
            const identity = { kind, internal_id: internalId };
            const current = this.rows.get("gateway_async_operations", identity);
            if (!current || current.row.billed_at) return false;
            this.rows.patch("gateway_async_operations", identity, { billed_at: new Date().toISOString(), next_reconcile_at: null,
                reconcile_locked_at: null, reconcile_locked_by: null, last_reconcile_error: null }, current.revision);
            return true;
        });
    }
    webhookClaim(...args: Parameters<WebhookState["claim"]>) { return this.transaction(() => this.webhooks.claim(...args)); }
    webhookResult(args: Parameters<WebhookState["result"]>[0]) { return this.transaction(() => this.webhooks.result(args)); }
    realtimeCreate(input: RealtimeCreation) { return this.transaction(() => { this.assertKey(input.row.key_id!); return this.realtime.create(input); }); }
    realtimeClaim(sessionId: string, hash: string) { return this.transaction(() => { const row = this.realtime.get(sessionId); this.assertKey(row.key_id!); return this.realtime.claim(sessionId, hash); }); }
    realtimeGet(sessionId: string) { return this.realtime.get(sessionId); }
    realtimeExtend(...args: Parameters<RealtimeState["extend"]>) { return this.transaction(() => { this.assertKey(this.realtime.get(args[0]).key_id!); return this.realtime.extend(...args); }); }
    realtimeSettle(...args: Parameters<RealtimeState["settle"]>) { return this.transaction(() => this.realtime.settle(...args)); }
    fileClaim(uploadId: string, bytes: number): { ok: boolean; reason: string | null } {
        return this.transaction(() => {
            this.assertPublicationReady();
            if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("invalid_batch_file_upload_claim");
            if (bytes > 20 * 1024 * 1024) return { ok: false, reason: "batch_file_too_large" };
            const wallet = this.ledger.wallet();
            if (wallet.balanceNanos <= wallet.reservedNanos) return { ok: false, reason: "insufficient_funds" };
            if (this.rows.get("gateway_batch_file_uploads", { upload_id: uploadId })) return { ok: false, reason: "batch_file_upload_already_claimed" };
            const now = Date.now();
            const recent = this.rows.list("gateway_batch_file_uploads", { order: "created_at", limit: 1000 }).filter(r => Date.parse(String(r.row.created_at)) >= now - 86_400_000);
            if (recent.filter(r => Date.parse(String(r.row.created_at)) >= now - 3_600_000).length >= 20) return { ok: false, reason: "batch_file_hourly_quota_exceeded" };
            if (recent.reduce((sum, r) => sum + Number(r.row.bytes), 0) + bytes > 100 * 1024 * 1024) return { ok: false, reason: "batch_file_daily_bytes_exceeded" };
            this.rows.put("gateway_batch_file_uploads", { workspace_id: wallet.workspaceId, upload_id: uploadId, bytes, status: "claimed" }, 0);
            return { ok: true, reason: null };
        });
    }
    claimReconciliation(args: { kind: string; statuses?: (string | null)[]; workerId?: string; leaseSeconds?: number; limit?: number }) {
        return this.transaction(() => {
            const now = Date.now();
            const rows = this.rows.list("gateway_async_operations", { equals: { kind: args.kind, billed_at: null },
                statuses: args.statuses, order: "updated_at", ascending: true, limit: 1000 });
            const claimed: LifecycleRow[] = [];
            const leaseMs = Math.max(30, Math.min(3600, args.leaseSeconds ?? 120)) * 1000;
            for (const current of rows) {
                if (!current.row.next_reconcile_at || Date.parse(String(current.row.next_reconcile_at)) > now ||
                    Date.parse(String(current.row.reconcile_locked_at)) > now - leaseMs) continue;
                const next = this.rows.patch("gateway_async_operations", current.row, { reconcile_locked_at: new Date(now).toISOString(),
                    reconcile_locked_by: args.workerId ?? "edge-reconciler", reconcile_attempts: Number(current.row.reconcile_attempts ?? 0) + 1 }, current.revision)!;
                claimed.push(next.row);
                if (claimed.length >= Math.min(1000, Math.max(1, args.limit ?? 100))) break;
            }
            return claimed;
        });
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
        this.assertPublicationReady();
        const id = this.store.get<string>(`kid:${kid}`);
        return id ? this.store.get<PublishedKey>(`key:${id}`) ?? null : null;
    }
    publicationKeys(): PublishedKey[] {
        return this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM request_state WHERE key >= 'key:' AND key < 'key;' ORDER BY key LIMIT 101").toArray()
            .map(row => JSON.parse(row.value) as PublishedKey);
    }

    private assertKey(id: string): PublishedKey {
        this.assertPublicationReady();
        const key = this.store.get<PublishedKey>(`key:${id}`);
        if (!key || key.status !== "active" || key.soft_blocked ||
            (key.expires_at !== null && Date.parse(key.expires_at) <= Date.now())) throw new Error("key_not_active");
        return key;
    }

    private assertPublicationReady(): void {
        if (this.ledger.wallet().mode !== "escrow") return;
        if ((this.store.get<string[]>("publication:mutations") ?? []).length || this.store.get<boolean>("publication:dirty") ||
            (this.store.get<number>("publication:validUntil") ?? 0) <= Date.now()) throw new Error("request_state_publication_pending");
    }
    beginMutation(token: string): void {
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(token)) throw new Error("invalid_mutation_token");
        this.transaction(() => {
            // A timed-out begin may arrive after its finish. Do not resurrect a
            // completed fence; keep the tombstone across object restarts.
            if (this.store.get<boolean>(`mutation:finished:${token}`)) return;
            const tokens = this.store.get<string[]>("publication:mutations") ?? [];
            if (!tokens.includes(token)) {
                if (tokens.length >= 16) throw new Error("too_many_pending_mutations");
                this.store.put("publication:mutations", [...tokens, token]);
            }
            this.store.put("publication:dirty", true);
        });
    }
    finishMutation(token: string): void {
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(token)) throw new Error("invalid_mutation_token");
        this.transaction(() => {
            this.store.put(`mutation:finished:${token}`, true);
            this.store.put("publication:mutations", (this.store.get<string[]>("publication:mutations") ?? []).filter(value => value !== token));
            this.store.put("publication:dirty", true);
        });
    }
    beginPublication(): number {
        return this.transaction(() => {
            const revision = (this.store.get<number>("publication:revision") ?? 0) + 1;
            this.store.put("publication:revision", revision);
            this.store.put("publication:dirty", true);
            return revision;
        });
    }
    commitPublication(revision: number, validUntil: number): void {
        this.transaction(() => {
            if (this.store.get<number>("publication:revision") !== revision || (this.store.get<string[]>("publication:mutations") ?? []).length) throw new Error("publication_superseded");
            if (!Number.isSafeInteger(validUntil) || validUntil <= Date.now()) throw new Error("publication_expired");
            this.store.put("publication:validUntil", validUntil);
            this.store.put("publication:dirty", false);
        });
    }

    async publishSnapshot(input: {
        apiKeyId: string; model: string; endpoint: string; testingMode: boolean;
        reference: SnapshotReference; sealed: string;
    }): Promise<void> {
        if (input.sealed.length > 2 * 1024 * 1024 || await digest(input.sealed) !== input.reference.digest ||
            input.reference.validUntil <= Date.now() || !Number.isSafeInteger(input.reference.revision) ||
            input.reference.revision < 1) throw new Error("invalid_snapshot_publication");
        this.transaction(() => {
            // Publication runs while admission is fenced; validate key identity
            // without requiring the old published lease to be live.
            const key = this.store.get<PublishedKey>(`key:${input.apiKeyId}`);
            if (!key || key.status !== "active") throw new Error("key_not_active");
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
        return this.transaction(() => {
            this.assertKey(input.keyId);
            if (this.ledger.wallet().mode === "escrow" && !this.store.get("projection:enabled")) throw new Error("allocation_not_ready");
            return this.ledger.reserve(input);
        });
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
