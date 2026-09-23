import type { HealthObservation, HealthReceipt } from "./health-evidence";

type Deliver = (events: HealthObservation[]) => Promise<Array<HealthReceipt | null>>;
type Entry = { event: HealthObservation; resolve: (receipt: HealthReceipt | null | undefined) => void };
type Batch = { entries: Entry[]; deliver: Deliver; timer?: ReturnType<typeof setTimeout>; key: string };

/** Bounded advisory micro-batches, not a durable message queue. Only immutable
 * event/receipt data crosses request contexts; no Response/stream is retained. */
export class HealthBatcher {
    private readonly queued = new Map<string, Batch>();
    private active = 0;
    private readonly counters = { batches: 0, observations: 0, dropped: 0, failed: 0 };
    constructor(private readonly delayMs = 1000) {}

    enqueue(key: string, event: HealthObservation, deliver: Deliver): Promise<HealthReceipt | null | undefined> {
        let batch = this.queued.get(key);
        if (!batch) {
            // Includes in-flight RPC batches, not just queued timers.
            if (this.active >= 32) { this.counters.dropped++; return Promise.resolve(undefined); }
            batch = { key, entries: [], deliver };
            this.active++; this.queued.set(key, batch);
            const scheduled = batch;
            batch.timer = setTimeout(() => { void this.flush(scheduled); }, this.delayMs);
        }
        const selected = batch;
        const result = new Promise<HealthReceipt | null | undefined>(resolve => {
            selected.entries.push({ event: { ...event }, resolve });
        });
        this.counters.observations++;
        if (batch.entries.length >= 32) void this.flush(batch);
        return result;
    }

    /** Deterministic tests/simulators can advance pending work without wall time. */
    async flushQueued(): Promise<void> { await Promise.all([...this.queued.values()].map(batch => this.flush(batch))); }
    stats() { return { ...this.counters, active: this.active, queued: this.queued.size }; }

    private async flush(batch: Batch): Promise<void> {
        if (this.queued.get(batch.key) !== batch) return;
        this.queued.delete(batch.key);
        clearTimeout(batch.timer);
        this.counters.batches++;
        try {
            const receipts = await batch.deliver(batch.entries.map(entry => entry.event));
            if (!Array.isArray(receipts) || receipts.length !== batch.entries.length) throw new Error("Health batch receipt mismatch");
            batch.entries.forEach((entry, index) => entry.resolve(receipts[index]));
        } catch {
            this.counters.failed += batch.entries.length;
            for (const entry of batch.entries) entry.resolve(undefined);
        } finally { this.active--; }
    }
}

export const healthBatcher = new HealthBatcher();
