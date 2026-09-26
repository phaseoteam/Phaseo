import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { decideFreeQuota, freeQuotaSettings, initialFreeQuota, parseFreeQuotaState, type FreeQuotaState } from "./free-model-quota";
import { FreeModelFeeJournal } from "./free-model-fee-journal";
import type { FreeModelReservationIdentity } from "./free-model-reservations";

/** Included quota: one singleton row, no alarms, timers or network calls.
 * Paid fee recovery is lazy and separate from this fast path.
 * Warm admission reads memory; each acceptance writes exactly one row.
 * Default output gates confirm persistence before an RPC response is sent. */
export class FreeModelQuotaDurableObject extends DurableObject<GatewayBindings> {
    private quota: FreeQuotaState;
    private fees?: FreeModelFeeJournal;

    private feeJournal() { return this.fees ??= new FreeModelFeeJournal(this.ctx.storage, this.env); }

    prepareFee(identity: FreeModelReservationIdentity) { return this.feeJournal().prepare(identity); }
    finishFee(identity: FreeModelReservationIdentity, outcome: "capture" | "release") {
        return this.feeJournal().finish(identity, outcome);
    }
    feeStatus() { return this.feeJournal().status(); }
    async alarm() { await this.feeJournal().alarm(); }

    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS free_quota (id INTEGER PRIMARY KEY CHECK(id = 1), state TEXT NOT NULL)");
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
        if (next) this.persist(next);
        return decision;
    }

    getSettings() { return freeQuotaSettings(this.quota, Date.now()); }

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
