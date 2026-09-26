import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { decideFreeQuota, freeQuotaSettings, initialFreeQuota, parseFreeQuotaState, type FreeQuotaState } from "./free-model-quota";
import { FreeModelFeeJournal } from "./free-model-fee-journal";
import type { FreeModelReservationIdentity } from "./free-model-reservations";

/** Included quota: singleton counter plus at most 1,500 pending reservations.
 * No alarms, timers or network calls. Unknown outcomes stay pending until reset.
 * Paid fee recovery is lazy and separate from this fast path.
 * Admission and completion atomically persist their counter/reservation changes.
 * Default output gates confirm persistence before an RPC response is sent. */
export class FreeModelQuotaDurableObject extends DurableObject<GatewayBindings> {
    private quota: FreeQuotaState;
    private fees?: FreeModelFeeJournal;

    private feeJournal() { return this.fees ??= new FreeModelFeeJournal(this.ctx.storage, this.env); }

    prepareFee(identity: FreeModelReservationIdentity, policyVersion: number) {
        if (this.env.GATEWAY_FREE_MODEL_OVERAGE_ENABLED !== "true" || !this.quota.allowOverage
            || policyVersion !== this.quota.policyVersion) return { allowed: false as const, reason: "policy_changed" };
        return this.feeJournal().prepare(identity);
    }
    finishFee(identity: FreeModelReservationIdentity, outcome: "capture" | "release") {
        return this.feeJournal().finish(identity, outcome);
    }
    feeStatus() { return this.feeJournal().status(); }
    feeReviews() { return this.feeJournal().reviews(); }
    retryReviewedFee(workspaceId: string, requestId: string, expectedAttempts: number) {
        return this.feeJournal().retryReviewed(workspaceId, requestId, expectedAttempts);
    }
    async alarm() { await this.feeJournal().alarm(); }

    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS free_quota (id INTEGER PRIMARY KEY CHECK(id = 1), state TEXT NOT NULL)");
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS free_quota_pending (id TEXT PRIMARY KEY, day INTEGER NOT NULL)");
        const row = ctx.storage.sql.exec<{ state: string }>("SELECT state FROM free_quota WHERE id = 1").toArray()[0];
        this.quota = row ? parseFreeQuotaState(row.state) : initialFreeQuota(Date.now());
    }

    private persist(next: FreeQuotaState): void {
        // No await between transition, write and memory update. No external I/O
        // can interleave. Storage failure propagates; no allowUnconfirmed writes.
        this.ctx.storage.sql.exec("INSERT INTO free_quota (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state", JSON.stringify(next));
        this.quota = next;
    }

    admit() {
        const { decision, next } = decideFreeQuota(this.quota, Date.now());
        // Do not charge overage while an in-flight request could still return an
        // included slot. A short retry preserves the successful-only boundary.
        if ((decision.allowed === true && decision.mode === "overage") || (decision.allowed === false && decision.reason === "daily_limit")) {
            const pending = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM free_quota_pending WHERE day = ?", this.quota.day).one().n;
            if (pending > 0) return { allowed: false as const, reason: "daily_limit" as const, retryAfterSeconds: 3 };
        }
        if (next) {
            const reservationId = decision.allowed && decision.mode === "included" ? crypto.randomUUID() : undefined;
            this.ctx.storage.transactionSync(() => {
                if (next.day > this.quota.day) this.ctx.storage.sql.exec("DELETE FROM free_quota_pending");
                if (reservationId) this.ctx.storage.sql.exec("INSERT INTO free_quota_pending (id, day) VALUES (?, ?)", reservationId, next.day);
                this.ctx.storage.sql.exec("INSERT INTO free_quota (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state", JSON.stringify(next));
            });
            this.quota = next;
            if (decision.allowed && reservationId) return { ...decision, reservationId };
        }
        return decision;
    }

    finishIncluded(reservationId: string, success: boolean) {
        if (typeof reservationId !== "string" || reservationId.length > 64 || typeof success !== "boolean") throw new Error("invalid_free_quota_completion");
        let next = this.quota;
        this.ctx.storage.transactionSync(() => {
            const row = this.ctx.storage.sql.exec<{ day: number }>("DELETE FROM free_quota_pending WHERE id = ? RETURNING day", reservationId).toArray()[0];
            if (row && !success && row.day === this.quota.day) {
                next = { ...this.quota, used: Math.max(0, this.quota.used - 1) };
                this.ctx.storage.sql.exec("UPDATE free_quota SET state = ? WHERE id = 1", JSON.stringify(next));
            }
        });
        this.quota = next;
        return { settled: true as const };
    }

    getSettings() {
        const settings = freeQuotaSettings(this.quota, Date.now());
        const pending = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM free_quota_pending WHERE day = ?", Math.floor(Math.max(Date.now(), this.quota.updatedAt) / 86_400_000)).one().n;
        return { ...settings, requestsUsedToday: Math.max(0, settings.requestsUsedToday - pending), requestsPending: pending };
    }

    setOverage(enabled: boolean, expectedVersion: number) {
        if (typeof enabled !== "boolean" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
            throw new Error("invalid_free_model_policy");
        }
        // Reject stale browser tabs/retries so an old enable cannot undo a later disable.
        if (expectedVersion !== this.quota.policyVersion) return { updated: false, settings: this.getSettings() };
        if (enabled !== this.quota.allowOverage) {
            this.persist({ ...this.quota, allowOverage: enabled, policyVersion: this.quota.policyVersion + 1 });
        }
        return { updated: true, settings: this.getSettings() };
    }
}
