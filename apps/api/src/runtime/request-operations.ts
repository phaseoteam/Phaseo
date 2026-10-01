import { AsyncLocalStorage } from "node:async_hooks";

export type Operation = "kvRead" | "kvWrite" | "kvDelete" | "kvList"
    | "supabaseRead" | "supabaseMutation" | "supabaseRpc"
    | "healthRpc" | "healthDropped" | "quotaRpc" | "cacheRead" | "cacheWrite";
type Counts = Partial<Record<Operation, number>>;
const scope = new AsyncLocalStorage<RequestOperations>();

/** Fixed-cardinality counters only: never retain keys, URLs, credentials or bodies. */
export class RequestOperations {
    readonly total: Counts = {};
    readonly beforeDispatch: Counts = {};
    readonly startedAt = performance.now();
    dispatchMs: number | null = null;
    readonly pending = new Set<Promise<unknown>>();
    backgroundOverflow = false;
    private finish!: () => void;
    readonly finished = new Promise<void>(resolve => { this.finish = resolve; });

    count(operation: Operation, count = 1) {
        this.total[operation] = (this.total[operation] ?? 0) + count;
        if (this.dispatchMs === null) this.beforeDispatch[operation] = (this.beforeDispatch[operation] ?? 0) + count;
    }
    dispatch() { this.dispatchMs ??= performance.now() - this.startedAt; }
    complete() { this.finish(); }
    track(promise: Promise<unknown>) {
        // Tracking must never become an unbounded second work queue.
        if (this.pending.size >= 128) { this.backgroundOverflow = true; return; }
        this.pending.add(promise);
        void promise.then(() => this.pending.delete(promise), () => this.pending.delete(promise));
    }
    async drain() {
        // Tasks may enqueue children. A bounded number of rounds cannot hide
        // incomplete accounting: the snapshot explicitly marks remaining work.
        for (let round = 0; round < 16 && this.pending.size; round++) {
            await Promise.allSettled([...this.pending]);
        }
    }
    snapshot() {
        return { total: { ...this.total }, beforeDispatch: { ...this.beforeDispatch },
            beforeDispatchMs: this.dispatchMs, pendingBackground: this.pending.size,
            complete: !this.backgroundOverflow && this.pending.size === 0 };
    }
}

export function currentRequestOperations() { return scope.getStore(); }
export function withRequestOperations<T>(metrics: RequestOperations, run: () => T): T { return scope.run(metrics, run); }
export function countOperation(operation: Operation, count = 1) { scope.getStore()?.count(operation, count); }
export function markProviderDispatch() { scope.getStore()?.dispatch(); }

const kvWrappers = new WeakMap<KVNamespace, KVNamespace>();
export function instrumentKv(namespace: KVNamespace): KVNamespace {
    const existing = kvWrappers.get(namespace);
    if (existing) return existing;
    const wrapped = new Proxy(namespace, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
                if (property === "get" || property === "getWithMetadata") {
                    countOperation("kvRead", Array.isArray(args[0]) ? args[0].length : 1);
                } else if (property === "put") countOperation("kvWrite");
                else if (property === "delete") countOperation("kvDelete");
                else if (property === "list") countOperation("kvList");
                // Bind native receiver; preserve overloads, thrown errors and promises.
                return Reflect.apply(value, target, args);
            };
        },
    });
    kvWrappers.set(namespace, wrapped);
    return wrapped;
}

export function countSupabaseOperation(input: RequestInfo | URL, init?: RequestInit) {
    if (!scope.getStore()) return;
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // POST RPCs may read or mutate. Keep them separate rather than guessing
    // from their names and claiming a zero-read dispatch path incorrectly.
    countOperation(url.pathname.includes("/rpc/") ? "supabaseRpc"
        : method === "GET" || method === "HEAD" ? "supabaseRead" : "supabaseMutation");
}

export function shouldSampleOperations(raw: string | undefined, random = Math.random()): boolean {
    const rate = Number(raw ?? 0);
    return Number.isFinite(rate) && rate > 0 && rate <= 1 && random < rate;
}
