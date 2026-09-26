import type { GatewayBindings } from "@/runtime/env.types";
import { configureRuntime, clearRuntime } from "@/runtime/env";
import { FreeModelReservationIdentitySchema, reserveFreeModelOverage, finalizeFreeModelOverage,
    type FreeModelReservationIdentity } from "./free-model-reservations";

type Outcome = "capture" | "release";
type Entry = { id: string; identity: string; state: "preparing" | "held" | Outcome | "review";
    outcome: Outcome | null; attempts: number; due: number | null };
const MAX_ENTRIES = 128;
const MAX_ATTEMPTS = 5;
const OUTCOME_DEADLINE_MS = 15 * 60_000;

/** Lazy, paid-overage-only journal in the existing owner coordinator. Included
 * admissions never create this table or schedule alarms. Unknown outcomes are
 * retained for review, not guessed into a charge/refund. One bounded row per
 * unresolved fee; reaching capacity stops overage instead of growing storage.
 */
export class FreeModelFeeJournal {
    private readonly active = new Map<string, Promise<unknown>>();

    constructor(private readonly storage: DurableObjectStorage, private readonly env: GatewayBindings) {
        storage.sql.exec(`CREATE TABLE IF NOT EXISTS free_fee_journal (
            id TEXT PRIMARY KEY, identity TEXT NOT NULL, state TEXT NOT NULL,
            outcome TEXT, attempts INTEGER NOT NULL, due INTEGER)`);
    }

    private identity(input: FreeModelReservationIdentity) {
        const identity = FreeModelReservationIdentitySchema.parse(input);
        return { identity, id: `${identity.workspaceId}:${identity.requestId}`, json: JSON.stringify(identity) };
    }

    private get(id: string): Entry | undefined {
        return this.storage.sql.exec<Entry>("SELECT * FROM free_fee_journal WHERE id = ?", id).toArray()[0];
    }

    private verify(entry: Entry | undefined, identity: string) {
        if (entry && entry.identity !== identity) throw new Error("free_model_fee_identity_conflict");
    }

    private capacity() {
        if (this.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM free_fee_journal").one().count >= MAX_ENTRIES) {
            throw new Error("free_model_fee_recovery_capacity");
        }
    }

    // SQLite + alarm are one transaction: no durable hold/outcome can outlive its
    // recovery wakeup because a Worker disappears between these two writes.
    private async change(write: () => void) {
        await this.storage.transaction(async () => {
            write();
            const next = this.storage.sql.exec<{ due: number | null }>("SELECT MIN(due) AS due FROM free_fee_journal").one().due;
            if (next === null) await this.storage.deleteAlarm();
            else await this.storage.setAlarm(Math.max(Date.now() + 1_000, next));
        });
    }

    private async exclusive<T>(id: string, run: () => Promise<T>): Promise<T> {
        // Bound waiting work too. A caller retries with the same immutable ID;
        // it cannot queue unlimited promises behind a stalled database request.
        if (this.active.has(id)) throw new Error("free_model_fee_operation_pending");
        if (this.active.size >= MAX_ENTRIES) throw new Error("free_model_fee_recovery_capacity");
        const pending = run();
        this.active.set(id, pending);
        try { return await pending; } finally { this.active.delete(id); }
    }

    private async source<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
        configureRuntime(this.env);
        const abort = new AbortController();
        let deadline!: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => { abort.abort(); reject(new Error("free_model_fee_source_unconfirmed")); }, 5_000);
        });
        try { return await Promise.race([run(abort.signal), timeout]); }
        finally { clearTimeout(deadline); clearRuntime(); }
    }

    async prepare(input: FreeModelReservationIdentity) {
        const { identity, id, json } = this.identity(input);
        return this.exclusive(id, async () => {
            const existing = this.get(id);
            this.verify(existing, json);
            if (existing) {
                // Never redispatch on ambiguous/restarted preparation. The
                // gateway owns request-level admission deduplication.
                throw new Error("free_model_fee_preparation_already_exists");
            }
            await this.change(() => {
                this.capacity();
                this.storage.sql.exec("INSERT INTO free_fee_journal VALUES (?, ?, 'preparing', NULL, 0, ?)",
                    id, json, Date.now() + OUTCOME_DEADLINE_MS);
            });
            const result = await this.source(signal => reserveFreeModelOverage(identity, signal));
            if (!result.applied && !result.alreadyApplied) {
                // A validated definitive denial created no hold. Transport or
                // malformed confirmation throws above and retains the journal.
                await this.change(() => this.storage.sql.exec("DELETE FROM free_fee_journal WHERE id = ?", id));
                return { allowed: false as const, reason: result.status };
            }
            await this.change(() => this.storage.sql.exec("UPDATE free_fee_journal SET state = 'held' WHERE id = ?", id));
            return { allowed: true as const };
        });
    }

    async finish(input: FreeModelReservationIdentity, outcome: Outcome) {
        const { identity, id, json } = this.identity(input);
        if (outcome !== "capture" && outcome !== "release") throw new Error("invalid_free_model_settlement_outcome");
        return this.exclusive(id, async () => {
            const entry = this.get(id);
            this.verify(entry, json);
            if (entry?.outcome && entry.outcome !== outcome) throw new Error("free_model_fee_outcome_conflict");
            if (entry && entry.attempts >= MAX_ATTEMPTS) return { settled: false, review: true };
            // Persist the definitive decision before any debit/release. A replay
            // may follow a committed RPC whose acknowledgement was lost.
            await this.change(() => {
                if (!entry) this.capacity();
                this.storage.sql.exec(
                `INSERT INTO free_fee_journal VALUES (?, ?, ?, ?, 0, ?)
                 ON CONFLICT(id) DO UPDATE SET state = excluded.state, outcome = excluded.outcome, due = excluded.due`,
                id, json, outcome, outcome, Date.now() + 30_000);
            });
            return this.deliver(id, identity, outcome);
        });
    }

    private async deliver(id: string, identity: FreeModelReservationIdentity, outcome: Outcome) {
        const entry = this.get(id);
        if (!entry || entry.outcome !== outcome) throw new Error("free_model_fee_outcome_conflict");
        if (entry.attempts >= MAX_ATTEMPTS) return { settled: false, review: true };
        // Count before I/O, so crashes cannot reset the retry budget.
        await this.change(() => this.storage.sql.exec(
            "UPDATE free_fee_journal SET attempts = attempts + 1, due = ? WHERE id = ?",
            Date.now() + Math.min(300_000, 30_000 * 2 ** entry.attempts), id));
        try {
            await this.source(signal => finalizeFreeModelOverage(identity, outcome, signal));
            await this.change(() => this.storage.sql.exec("DELETE FROM free_fee_journal WHERE id = ?", id));
            return { settled: true, review: false };
        } catch {
            if (entry.attempts + 1 >= MAX_ATTEMPTS) await this.review(id);
            return { settled: false, review: entry.attempts + 1 >= MAX_ATTEMPTS };
        }
    }

    private async review(id: string) {
        await this.change(() => this.storage.sql.exec("UPDATE free_fee_journal SET state = 'review', due = NULL WHERE id = ?", id));
        console.error("free_model_fee_review_required");
    }

    async alarm() {
        // At most eight source RPCs/wakeup, five attempts/fee; idle and review-only
        // coordinators have no alarm. Unknown outcome performs no financial RPC.
        const due = this.storage.sql.exec<Entry>(
            "SELECT * FROM free_fee_journal WHERE due <= ? ORDER BY due LIMIT 8", Date.now()).toArray();
        for (const row of due) {
            if (this.active.has(row.id)) continue;
            await this.exclusive(row.id, async () => {
                const current = this.get(row.id);
                if (!current || current.due === null || current.due > Date.now()) return;
                if (!current.outcome || current.attempts >= MAX_ATTEMPTS) return this.review(row.id);
                await this.deliver(row.id, FreeModelReservationIdentitySchema.parse(JSON.parse(current.identity)), current.outcome);
            });
        }
        await this.change(() => {});
    }

    status() {
        return this.storage.sql.exec<{ state: string; count: number }>(
            "SELECT state, COUNT(*) AS count FROM free_fee_journal GROUP BY state").toArray();
    }

    reviews() {
        return this.storage.sql.exec<Entry>("SELECT * FROM free_fee_journal WHERE state = 'review' ORDER BY id LIMIT 128")
            .toArray().map(row => ({ identity: FreeModelReservationIdentitySchema.parse(JSON.parse(row.identity)),
                outcome: row.outcome, attempts: row.attempts }));
    }

    /** Explicit operator retry, never an instruction to choose a financial outcome.
     * Exactly one source call, no new alarms. The attempt fence rejects stale tabs
     * and duplicate submissions; the lifetime ceiling remains bounded too. */
    async retryReviewed(workspaceId: string, requestId: string, expectedAttempts: number) {
        const id = `${workspaceId}:${requestId}`;
        return this.exclusive(id, async () => {
            const row = this.get(id);
            if (!row || row.state !== "review" || !row.outcome || row.attempts !== expectedAttempts
                || !Number.isSafeInteger(expectedAttempts) || expectedAttempts < 0 || expectedAttempts >= 32) {
                throw new Error("free_model_fee_review_conflict");
            }
            const identity = FreeModelReservationIdentitySchema.parse(JSON.parse(row.identity));
            // Keep state=review across crashes, including a commit/lost response.
            await this.change(() => this.storage.sql.exec("UPDATE free_fee_journal SET attempts = attempts + 1, due = NULL WHERE id = ?", id));
            try {
                await this.source(signal => finalizeFreeModelOverage(identity, row.outcome!, signal));
                await this.change(() => this.storage.sql.exec("DELETE FROM free_fee_journal WHERE id = ?", id));
                return { settled: true, review: false };
            } catch { return { settled: false, review: true }; }
        });
    }
}
