import type { HealthObservation, HealthReceipt } from "./health-evidence";

type Deliver = (events: HealthObservation[]) => Promise<Array<HealthReceipt | null>>;
type Batch = { events: HealthObservation[]; deliver: Deliver; timer?: ReturnType<typeof setTimeout>; key: string;
    start: () => void; result: Promise<Array<HealthReceipt | null> | undefined> };

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
            let start!: () => void;
            const ready = new Promise<void>(resolve => { start = resolve; });
            // Register delivery in the creating request's context. A later
            // request can wake it, but must not take over its timer/RPC lifetime.
            const created: Batch = { key, events: [], deliver, start,
                result: ready.then(() => this.flush(created)) };
            batch = created;
            this.active++; this.queued.set(key, created);
            created.timer = setTimeout(start, this.delayMs);
        }
        const index = batch.events.push({ ...event }) - 1;
        this.counters.observations++;
        if (batch.events.length >= 32) {
            this.queued.delete(key);
            batch.start();
        }
        // Share the delivery promise, not independently resolved promises that
        // leave no I/O dependency for another request's lifetime tracking.
        return batch.result.then(receipts => receipts?.[index]);
    }

    /** Deterministic tests/simulators can advance pending work without wall time. */
    async flushQueued(): Promise<void> {
        const batches = [...this.queued.values()];
        for (const batch of batches) { this.queued.delete(batch.key); batch.start(); }
        await Promise.all(batches.map(batch => batch.result));
    }
    stats() { return { ...this.counters, active: this.active, queued: this.queued.size }; }

    private async flush(batch: Batch): Promise<Array<HealthReceipt | null> | undefined> {
        if (this.queued.get(batch.key) === batch) this.queued.delete(batch.key);
        clearTimeout(batch.timer);
        this.counters.batches++;
        try {
            const receipts = await batch.deliver([...batch.events]);
            if (!Array.isArray(receipts) || receipts.length !== batch.events.length) throw new Error("Health batch receipt mismatch");
            return receipts;
        } catch {
            this.counters.failed += batch.events.length;
            return undefined;
        } finally { this.active--; }
    }
}

export const healthBatcher = new HealthBatcher();
