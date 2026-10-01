import { AsyncLocalStorage } from "node:async_hooks";
import type { StreamObservation } from "@/core/stream-observation";

export type Operation = "kvRead" | "kvWrite" | "kvDelete" | "kvList"
    | "supabaseRead" | "supabaseMutation" | "supabaseRpc"
    | "healthRpc" | "healthDropped" | "quotaRpc" | "settlementEnqueue" | "cacheRead" | "cacheWrite";
type Counts = Partial<Record<Operation, number>>;
type KvOperation = "kvRead" | "kvWrite" | "kvDelete" | "kvList";
type KvPurpose = "auth" | "credit" | "sticky" | "context" | "health" | "other";
type KvCounts = Partial<Record<KvPurpose, Partial<Record<KvOperation, number>>>>;
export type SettlementOutcome = "pending" | "confirmed" | "recovery_queued" | "unresolved";
const scope = new AsyncLocalStorage<RequestOperations>();
// Lazily initialized during a request: Workers disallow random I/O at module load.
// This identifies module reuse only, not a customer, POP or physical isolate.
let runtimeInstanceId: string | undefined;

function kvPurpose(key: unknown): KvPurpose {
    if (typeof key !== "string") return "other";
    if (key.startsWith("gateway:key:") || key.startsWith("gateway:keyver:")) return "auth";
    if (key.startsWith("gateway:credit:")) return "credit";
    if (key.startsWith("gateway:routing:sticky:")) return "sticky";
    if (key.startsWith("gw:health:")) return "health";
    if (["gateway:context:", "gateway:static:", "gateway:dynamic:", "gateway:preset:"]
        .some(prefix => key.startsWith(prefix))) return "context";
    return "other";
}

/** Fixed-cardinality counters only: never retain keys, URLs, credentials or bodies. */
export class RequestOperations {
    readonly total: Counts = {};
    readonly beforeDispatch: Counts = {};
    private readonly kvByPurpose: KvCounts = {};
    private readonly runtimeInstanceId = runtimeInstanceId ??= crypto.randomUUID();
    readonly startedAt = performance.now();
    dispatchMs: number | null = null;
    readonly pending = new Set<Promise<unknown>>();
    backgroundOverflow = false;
    // Request-finalizer evidence, not a durable ledger or a count of debits.
    // Re-entry may recover an unresolved attempt; retain the latest outcome.
    private settlement: { state: SettlementOutcome; directAttempts: number } | undefined;
    recordSettlement(outcome: SettlementOutcome) {
        this.settlement ??= { state: outcome, directAttempts: 0 };
        this.settlement.state = outcome;
    }
    recordSettlementAttempt() {
        this.recordSettlement("pending");
        this.settlement!.directAttempts++;
    }
	private stream: StreamObservation | undefined;
	recordStream(value: StreamObservation) {
		if (this.stream) return;
		this.stream = Object.freeze({
			state: value.state, committed: value.committed, deliveredFrames: value.deliveredFrames,
			deliveredBytes: value.deliveredBytes, downstreamDisconnected: value.downstreamDisconnected,
			sawFinalUsage: value.sawFinalUsage, finishReason: value.finishReason, errorOrigin: value.errorOrigin,
			firstFrameMs: value.firstFrameMs, firstOutputObservedMs: value.firstOutputObservedMs, durationMs: value.durationMs,
		});
	}
    private finish!: () => void;
    readonly finished = new Promise<void>(resolve => { this.finish = resolve; });

    count(operation: Operation, count = 1) {
        this.total[operation] = (this.total[operation] ?? 0) + count;
        if (this.dispatchMs === null) this.beforeDispatch[operation] = (this.beforeDispatch[operation] ?? 0) + count;
    }
    countKv(operation: KvOperation, key: unknown) {
        this.count(operation);
        const counts = this.kvByPurpose[kvPurpose(key)] ??= {};
        counts[operation] = (counts[operation] ?? 0) + 1;
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
            runtimeInstanceId: this.runtimeInstanceId,
            kvByPurpose: Object.fromEntries(Object.entries(this.kvByPurpose).map(([purpose, counts]) => [purpose, { ...counts }])),
            beforeDispatchMs: this.dispatchMs, pendingBackground: this.pending.size,
            complete: !this.backgroundOverflow && this.pending.size === 0,
            ...(this.settlement ? { settlement: { ...this.settlement } } : {}),
            ...(this.stream ? { stream: { ...this.stream } } : {}) };
    }
}

export function currentRequestOperations() { return scope.getStore(); }
export function withRequestOperations<T>(metrics: RequestOperations, run: () => T): T { return scope.run(metrics, run); }
export function countOperation(operation: Operation, count = 1) { scope.getStore()?.count(operation, count); }
export function markProviderDispatch() { scope.getStore()?.dispatch(); }
export function recordStreamObservation(observation: StreamObservation) { scope.getStore()?.recordStream(observation); }
export function recordSettlement(outcome: SettlementOutcome) { scope.getStore()?.recordSettlement(outcome); }
export function recordSettlementAttempt() { scope.getStore()?.recordSettlementAttempt(); }

const kvWrappers = new WeakMap<KVNamespace, KVNamespace>();
export function instrumentKv(namespace: KVNamespace): KVNamespace {
    const existing = kvWrappers.get(namespace);
    if (existing) return existing;
    const wrapped = new Proxy(namespace, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
                const record = scope.getStore();
                if (record) {
                    if (property === "get" || property === "getWithMetadata") {
                        if (Array.isArray(args[0])) {
                            for (const key of args[0]) record.countKv("kvRead", key);
                        } else record.countKv("kvRead", args[0]);
                    } else if (property === "put") record.countKv("kvWrite", args[0]);
                    else if (property === "delete") record.countKv("kvDelete", args[0]);
                    // A list can span purposes; do not inspect user-supplied options.
                    else if (property === "list") record.countKv("kvList", undefined);
                }
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
