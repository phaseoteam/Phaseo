// Purpose: Deliver an isolate's spend records to the workspace's SpendLimit coordinator.
//
// Owner rule: never under-count; a bounded over-count is allowed; memory is bounded; no request path
// waits on delivery.
//
// INVARIANTS
//  S1. One drain loop per workspace, run in the background. Records wait in a bounded map keyed by
//      billing id: a replacement total coalesces into the latest one (a final wins), an ordinary
//      record is idempotent, and a release rides with the record of its request.
//  S2. A batch holds at most MAX_BATCH records (the coordinator applies no more per call), after
//      protocol conversion too (conversion never adds records).
//  S3. A record leaves the map, advances its acknowledged total and releases its slot only once a
//      response acknowledges it: the coordinator reports how many it applied (absent: all, which an
//      older coordinator always does within MAX_BATCH). A record changed while in flight stays.
//  S4. Every call has a timeout; a failure or timeout keeps the batch and retries with backoff.
//      Retries are idempotent: replacement totals; ordinary records keyed by billing id; protocol-1
//      increases with ids derived from their totals, computed against acknowledged totals only.
//  S5. Past MAX_PENDING records, the oldest fold into one aggregate record per key carrying their
//      full totals (an over-count, never dropped); their releases are not sent, so their slots stay
//      held until their lease holds end (an over-count).
//  S6. A protocol-2 batch answered without protocol 2 (a rolled-back coordinator) is acknowledged for
//      nothing: the loop switches to protocol 1 and sends it again as increases over acknowledged
//      totals (an over-count of what the old coordinator kept), releasing slots after that.

import { SPEND_LIMIT_RECORD_PROTOCOL, type SpendRecordEntry, type SpendRecordResult } from "@core/spend-limits.shared";

/** Records per coordinator call: the coordinator applies at most this many. */
export const MAX_BATCH = 100;
/** Records waiting per workspace; past it the oldest fold into per-key aggregates. */
export const MAX_PENDING = 10_000;
export const RECORD_TIMEOUT_MS = 10_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 60_000] as const;
const MAX_ACKNOWLEDGED = 10_000;

export type RecordStub = {
	record(workspaceId: string, entries: SpendRecordEntry[]): Promise<SpendRecordResult>;
	release(workspaceId: string, leaseId: string, admissionId: string): Promise<void>;
};

export type SenderDeps = {
	stub(workspaceId: string): RecordStub | null;
	protocol(workspaceId: string): number;
	noteProtocol(workspaceId: string, protocol: unknown): void;
	/** The coordinator saw contention: hand back these keys' unused slices. */
	drainKeys(workspaceId: string, keyIds: string[]): Promise<void>;
	background(promise: Promise<unknown>): void;
	/** Delay before a first send, so records arriving together share a call. */
	batchDelayMs: number;
};

type Pending = { entry: SpendRecordEntry; version: number };
type Overflow = { keyId: string; cost: number; requests: number };
type Sender = {
	pending: Map<string, Pending>;
	/** Aggregates of folded records, by their own id; `open` is the one still collecting per key. */
	overflow: Map<string, Overflow>;
	open: Map<string, string>;
	draining: Promise<void> | null;
	scheduled: boolean;
	failures: number;
	retryAt: number;
};

function withTimeout<T>(promise: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("spend_limit_record_timeout")), RECORD_TIMEOUT_MS);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The latest of two records for one billing id (S1). */
function coalesce(previous: SpendRecordEntry | undefined, next: SpendRecordEntry): SpendRecordEntry {
	if (!previous) return next;
	const release = previous.releaseAdmissionId ?? next.releaseAdmissionId ?? null;
	let kept: SpendRecordEntry;
	if (!previous.replace || !next.replace) kept = next.replace ? next : previous;
	else if (previous.final) kept = previous;
	else if (next.final) kept = next;
	else kept = next.costNanos >= previous.costNanos ? next : previous;
	return release ? { ...kept, releaseAdmissionId: release } : kept;
}

export function createRecordSender(deps: SenderDeps) {
	const senders = new Map<string, Sender>();
	// Charged totals a coordinator acknowledged, per billing id of a stream charged in steps (S4).
	const acknowledged = new Map<string, number>();
	let versions = 0;
	let overflowIds = 0;

	function senderFor(workspaceId: string): Sender {
		let sender = senders.get(workspaceId);
		if (!sender) {
			sender = { pending: new Map(), overflow: new Map(), open: new Map(), draining: null, scheduled: false, failures: 0, retryAt: 0 };
			senders.set(workspaceId, sender);
		}
		return sender;
	}

	function commitTotals(totals: Map<string, number | null>): void {
		for (const [id, total] of totals) {
			acknowledged.delete(id);
			if (total === null) continue;
			acknowledged.set(id, total);
			if (acknowledged.size > MAX_ACKNOWLEDGED) {
				const oldest = acknowledged.keys().next();
				if (!oldest.done) acknowledged.delete(oldest.value);
			}
		}
	}

	/** Folds the oldest waiting record into its key's open aggregate (S5). */
	function foldOldest(workspaceId: string, sender: Sender): void {
		const oldest = sender.pending.entries().next();
		if (oldest.done) return;
		const [id, { entry }] = oldest.value;
		sender.pending.delete(id);
		let aggregateId = sender.open.get(entry.keyId);
		if (!aggregateId) {
			aggregateId = `${workspaceId}:overflow:${++overflowIds}`;
			sender.open.set(entry.keyId, aggregateId);
			sender.overflow.set(aggregateId, { keyId: entry.keyId, cost: 0, requests: 0 });
		}
		const aggregate = sender.overflow.get(aggregateId)!;
		aggregate.cost += Math.max(0, Math.round(Number(entry.costNanos) || 0));
		if (!entry.replace || entry.final) aggregate.requests += Math.max(0, Math.trunc(Number(entry.requests) || 0));
	}

	function enqueue(workspaceId: string, entry: SpendRecordEntry): void {
		const sender = senderFor(workspaceId);
		const id = entry.billingRequestId;
		const previous = sender.pending.get(id);
		sender.pending.set(id, { entry: coalesce(previous?.entry, entry), version: ++versions });
		if (!previous && sender.pending.size > MAX_PENDING) foldOldest(workspaceId, sender);
		schedule(workspaceId, sender, sender.pending.size >= MAX_BATCH ? 0 : deps.batchDelayMs);
	}

	function schedule(workspaceId: string, sender: Sender, delayMs: number): void {
		if (sender.scheduled || sender.draining) return;
		sender.scheduled = true;
		deps.background(new Promise((resolve) => setTimeout(resolve, Math.max(delayMs, sender.retryAt - Date.now(), 0)))
			.then(() => {
				sender.scheduled = false;
				return drain(workspaceId, false);
			}));
	}

	function drain(workspaceId: string, force: boolean): Promise<void> {
		const sender = senderFor(workspaceId);
		if (sender.draining) return sender.draining;
		sender.draining = (async () => {
			while (sender.pending.size || sender.overflow.size) {
				if (!force && Date.now() < sender.retryAt) break;
				const delivered = await sendBatch(workspaceId, sender);
				if (!delivered) {
					sender.failures += 1;
					sender.retryAt = Date.now() + BACKOFF_MS[Math.min(sender.failures, BACKOFF_MS.length) - 1];
					break;
				}
				sender.failures = 0;
				sender.retryAt = 0;
			}
		})().finally(() => {
			sender.draining = null;
			if (sender.pending.size || sender.overflow.size) schedule(workspaceId, sender, 0);
			else senders.delete(workspaceId);
		});
		return sender.draining;
	}

	/** Sends one batch (S2–S6). False when it should be retried later. */
	async function sendBatch(workspaceId: string, sender: Sender): Promise<boolean> {
		const stub = deps.stub(workspaceId);
		if (!stub) {
			sender.pending.clear();
			sender.overflow.clear();
			sender.open.clear();
			return true;
		}
		type Item = { id: string; version: number | null; entry: SpendRecordEntry };
		const items: Item[] = [];
		for (const [id, aggregate] of sender.overflow) {
			if (items.length >= MAX_BATCH) break;
			// Sent from now on: later folds for its key start a new aggregate.
			if (sender.open.get(aggregate.keyId) === id) sender.open.delete(aggregate.keyId);
			items.push({ id, version: null, entry: { keyId: aggregate.keyId, billingRequestId: id, requestId: id, costNanos: aggregate.cost, requests: aggregate.requests } });
		}
		for (const [id, { entry, version }] of sender.pending) {
			if (items.length >= MAX_BATCH) break;
			items.push({ id, version, entry });
		}
		const current = deps.protocol(workspaceId) >= SPEND_LIMIT_RECORD_PROTOCOL;
		// Wire records, each with the item it came from; protocol 1 also returns releases to send after.
		const wire: SpendRecordEntry[] = [];
		const source: number[] = [];
		const totals = new Map<string, number | null>();
		const releases: Array<{ item: number; leaseId: string; admissionId: string }> = [];
		items.forEach((item, index) => {
			const entry = item.entry;
			if (current) {
				wire.push(entry);
				source.push(index);
				if (entry.replace) totals.set(entry.billingRequestId, entry.final ? null : entry.costNanos);
				return;
			}
			const { releaseAdmissionId, replace, final, revision: _revision, ...plain } = entry;
			if (releaseAdmissionId && entry.leaseId) releases.push({ item: index, leaseId: entry.leaseId, admissionId: releaseAdmissionId });
			if (!replace) {
				wire.push(plain);
				source.push(index);
				return;
			}
			const id = entry.billingRequestId;
			const delta = Math.max(0, entry.costNanos - (acknowledged.get(id) ?? 0));
			if (final) {
				wire.push({ ...plain, billingRequestId: `${id}:final`, costNanos: delta, requests: entry.requests });
				source.push(index);
				totals.set(id, null);
			} else if (delta > 0) {
				wire.push({ ...plain, billingRequestId: `${id}:+${entry.costNanos}`, costNanos: delta, requests: 0 });
				source.push(index);
				totals.set(id, entry.costNanos);
			}
		});
		let result: SpendRecordResult | null = null;
		if (wire.length) {
			try {
				result = await withTimeout(stub.record(workspaceId, wire));
			} catch {
				return false;
			}
			deps.noteProtocol(workspaceId, result?.protocol);
			// A rolled-back coordinator kept at most the first record of each id: acknowledge nothing (S6).
			if (current && (result?.protocol ?? 1) < SPEND_LIMIT_RECORD_PROTOCOL) return true;
		}
		const applied = typeof result?.applied === "number" ? Math.max(0, Math.min(wire.length, result.applied)) : wire.length;
		// Items acknowledged: those whose wire records were all applied, and those that needed none
		// (a checkpoint already acknowledged) once every earlier record was applied.
		const firstUnapplied = applied < wire.length ? source[applied] : items.length;
		for (let index = 0; index < Math.min(items.length, firstUnapplied); index += 1) {
			const item = items[index];
			if (item.version === null) {
				sender.overflow.delete(item.id);
				continue;
			}
			if (sender.pending.get(item.id)?.version === item.version) sender.pending.delete(item.id);
			const total = totals.get(item.id);
			if (total !== undefined) commitTotals(new Map([[item.id, total]]));
		}
		// Only once its cost is acknowledged: a slot released first would let an admission through uncounted.
		for (const release of releases) {
			if (release.item >= firstUnapplied) continue;
			try {
				await withTimeout(stub.release(workspaceId, release.leaseId, release.admissionId));
			} catch {
				// Not released: the slot stays held until its lease hold ends (an over-count).
			}
		}
		if (result?.drainKeyIds?.length) await deps.drainKeys(workspaceId, result.drainKeyIds);
		return true;
	}

	return {
		enqueue,
		/** Sends everything waiting now, retries included (tests and shutdown paths). */
		async flush(): Promise<void> {
			for (const workspaceId of [...senders.keys()]) {
				const sender = senders.get(workspaceId);
				if (!sender) continue;
				if (sender.draining) await sender.draining;
				sender.retryAt = 0;
				await drain(workspaceId, true);
			}
		},
		reset(): void {
			senders.clear();
			acknowledged.clear();
		},
		/** Records waiting for a workspace (diagnostics and tests). */
		waiting(workspaceId: string): number {
			const sender = senders.get(workspaceId);
			return sender ? sender.pending.size + sender.overflow.size : 0;
		},
	};
}
