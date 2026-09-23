import { LRUCache } from "lru-cache";

export type CacheValue<T> = {
    value: T;
    /** Absolute source deadline. Reads never extend this lease. */
    expiresAtMs: number;
    /** Advisory data only; ignored unless the reader explicitly permits SWR. */
    staleUntilMs?: number;
    version?: string;
};

export class CacheInvalidatedError extends Error {
    constructor() { super("Cache refill invalidated"); this.name = "CacheInvalidatedError"; }
}

export class CacheCapacityError extends Error {
    constructor() { super("Cache refill capacity exceeded"); this.name = "CacheCapacityError"; }
}

type Refill<T> = { promise: Promise<T>; invalidated: boolean };
type Options<T> = {
    namespace: string;
    maxEntries: number;
    maxBytes: number;
    maxEntryBytes: number;
    maxPending: number;
    /** Conservative retained-data estimate, including key; not exact JS heap. */
    sizeOf: (value: T, key: string) => number;
    now?: () => number;
};

/** Isolate-local, no timers, network, metrics exporter or unbounded key registry.
 * Only cache completed immutable data, never Responses, streams or I/O handles.
 * Workers loaders must consume their I/O in the originating request context.
 */
export class L1Cache<T> {
    private readonly entries: LRUCache<string, CacheValue<T>>;
    private readonly pending = new Map<string, Refill<T>>();
    private activeRefills = 0;
    private readonly now: () => number;
    private readonly counters = { hits: 0, misses: 0, staleHits: 0, coalesced: 0, loads: 0, errors: 0, evictions: 0, rejectedEntries: 0, rejectedRefills: 0, invalidations: 0 };

    constructor(private readonly options: Options<T>) {
        for (const limit of [options.maxEntries, options.maxBytes, options.maxEntryBytes, options.maxPending]) {
            if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError("Cache limits must be positive integers");
        }
        this.now = options.now ?? (() => Date.now());
        this.entries = new LRUCache({
            max: options.maxEntries,
            maxSize: options.maxBytes,
            maxEntrySize: options.maxEntryBytes,
            dispose: (_value, _key, reason) => { if (reason === "evict") this.counters.evictions++; },
        });
    }

    get(key: string): T | undefined {
        const entry = this.read(key, false);
        return entry?.value;
    }

    set(key: string, entry: CacheValue<T>): void {
        this.invalidate(key);
        this.admit(key, entry);
    }

    invalidate(key: string): void {
        this.entries.delete(key);
        const pending = this.pending.get(key);
        if (pending) { pending.invalidated = true; this.pending.delete(key); }
        this.counters.invalidations++;
    }

    clear(): void {
        this.entries.clear();
        for (const pending of this.pending.values()) pending.invalidated = true;
        this.pending.clear();
        // Invalidated I/O still counts until it settles: repeated invalidation
        // cannot bypass the refill limit or cause unbounded outstanding work.
        this.counters.invalidations++;
    }

    getOrLoad(key: string, load: () => Promise<CacheValue<T>>, options?: {
        /** Explicit opt-in; never use for authorization or financial authority. */
        staleWhileRevalidate: true;
        /** Attach refresh to the request's waitUntil; errors are counted locally. */
        defer: (work: Promise<unknown>) => void;
    }): Promise<T> {
        const entry = this.read(key, !!options);
        if (entry && entry.expiresAtMs > this.now()) return Promise.resolve(entry.value);
        if (entry && options) {
            options.defer(this.refill(key, load).catch(() => undefined));
            return Promise.resolve(entry.value);
        }
        return this.refill(key, load);
    }

    stats() {
        return { namespace: this.options.namespace, ...this.counters, entries: this.entries.size, bytes: this.entries.calculatedSize, pending: this.activeRefills };
    }

    private read(key: string, allowStale: boolean): CacheValue<T> | undefined {
        const entry = this.entries.get(key);
        const now = this.now();
        if (entry && entry.expiresAtMs > now) { this.counters.hits++; return entry; }
        if (entry && (entry.staleUntilMs ?? entry.expiresAtMs) > now) {
            if (allowStale) { this.counters.staleHits++; return entry; }
        } else if (entry) this.entries.delete(key);
        this.counters.misses++;
        return undefined;
    }

    private admit(key: string, entry: CacheValue<T>): void {
        const deadline = entry.staleUntilMs ?? entry.expiresAtMs;
        if (!Number.isFinite(entry.expiresAtMs) || !Number.isFinite(deadline) || deadline < entry.expiresAtMs || deadline <= this.now()) {
            this.counters.rejectedEntries++;
            return;
        }
        const bytes = this.options.sizeOf(entry.value, key);
        if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > Math.min(this.options.maxEntryBytes, this.options.maxBytes)) {
            this.counters.rejectedEntries++;
            return;
        }
        // The owner may reuse its envelope; that must not extend our lease.
        this.entries.set(key, { ...entry }, { size: bytes });
    }

    private refill(key: string, load: () => Promise<CacheValue<T>>): Promise<T> {
        const existing = this.pending.get(key);
        if (existing) { this.counters.coalesced++; return existing.promise; }
        if (this.activeRefills >= this.options.maxPending) {
            this.counters.rejectedRefills++;
            return Promise.reject(new CacheCapacityError());
        }
        const refill = { invalidated: false } as Refill<T>;
        this.activeRefills++;
        this.counters.loads++;
        // Defer invocation until the token is installed, including sync throws.
        refill.promise = Promise.resolve().then(load).then((entry) => {
            if (refill.invalidated) throw new CacheInvalidatedError();
            this.admit(key, entry);
            return entry.value;
        }).catch((error: unknown) => { this.counters.errors++; throw error; }).finally(() => {
            this.activeRefills--;
            if (this.pending.get(key) === refill) this.pending.delete(key);
        });
        this.pending.set(key, refill);
        return refill.promise;
    }
}
