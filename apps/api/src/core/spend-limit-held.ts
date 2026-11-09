// Purpose: The spend the SpendLimit coordinator counts from memory, and the one rule for when a
//          published seed takes it over.
//
// Owner rule: never under-count; a bounded over-count is allowed; memory is bounded.
//
// INVARIANTS
//  I1. Usage = what the published seed counts + what this ledger counts. For every billing id, the
//      ledger's count plus the published seed's count is at least what Postgres holds for it, for
//      cost and for successful requests alike.
//  I2. Each id has two parts settled independently: cost, and successful requests. A part has a
//      total (what records reported), a base (what a published seed may already count) and the
//      record sequence of its last change. The ledger counts total − base.
//  I3. Phase "held": the next seed excludes both of its ids (request id and billing id), so its base
//      is 0. Phase "handoff": the next seed does not exclude it (its audit row landed, it expired,
//      its period ended, it did not fit in the exclusion list, or a record arrived after it was
//      already taken over).
//  I4. The one takeover rule: when a seed whose read started at sequence R is published, each part
//      of a handoff entry whose last change has sequence ≤ R is taken over (base := total). An entry
//      with both parts taken over is dropped; its totals are remembered as the base of a later record.
//  I5. Entering "handoff" stamps fresh sequences (after any read already started), so a read that
//      excluded an entry can never take it over.
//  I6. A debit commits before its record arrives. So a record that arrives after a read started may
//      be missing from that read (I4 keeps it), and a debit made in a window arrives in that window:
//      an entry counts in the windows containing its occurrence or its last cost increase. The
//      aggregate keeps no times, so it counts in every window.
//  I7. Records only raise a handoff part. A held part may be set lower by its final record (the seed
//      excludes it, so the ledger is its only count).
//  I8. Checkpoints settle cost only. Successful requests are settled by a final or an ordinary record
//      (the SQL counts successful request rows, not charges, and an in-flight request is held by its
//      lease, not by its checkpoints).
//  I9. Bounds, enforced on every record batch and at every read: held ids ≤ the seed's exclusion
//      limit (past it the oldest are handed off), handoff entries ≤ MAX_HANDOFF_ENTRIES (past it the
//      oldest fold into the aggregate), aggregate keys ≤ MAX_AGGREGATE_KEYS (past it into one list
//      counted against every key) with ≤ MAX_SEGMENTS segments each, remembered totals ≤
//      MAX_REMEMBERED, seen ids ≤ MAX_SEEN_IDS. Aggregate segments follow I4 with the sequence of
//      their newest addition; additions after a read started go to a new segment.

import { SPEND_LEASE, windowStarts, type SpendRecordEntry } from "@core/spend-limits.shared";

/** Handoff entries kept one by one; past this the oldest fold into the aggregate. */
export const MAX_HANDOFF_ENTRIES = 2_500;
/** Keys with their own aggregate list; past this a key's list folds into the workspace-wide one. */
export const MAX_AGGREGATE_KEYS = 64;
/** Segments per aggregate list (the two oldest merge past it, keeping the later sequence). */
const MAX_SEGMENTS = 4;
/** Totals remembered after a takeover; the oldest are forgotten (a later record then counts in full). */
export const MAX_REMEMBERED = 10_000;
const MAX_SEEN_IDS = 50_000;
/** Aggregate list counted against every key, department and budget. */
export const WORKSPACE_AGGREGATE = "*";

type Part = { total: number; base: number; seq: number };
type Reason = "audited" | "expired" | "period_ended" | "overflow" | "late";

export type HeldEntry = {
	billingRequestId: string;
	requestId: string;
	keyId: string;
	/** When the spend occurred (the request row's time). */
	at: number;
	/** When the last record raising its cost arrived (I6). */
	increasedAt: number;
	/** When the last record changing it arrived (pending TTL). */
	recordedAt: number;
	cost: Part;
	requests: Part;
	phase: "held" | "handoff";
	reason?: Reason;
	/** A stream charged at drain checkpoints; `final` once its final record arrived. */
	stepped?: { final: boolean };
	/** Opened by a record other than checkpoint 1: the seed in use may already count its charge row. */
	awaitingSeed?: boolean;
};

type Segment = { cost: number; requests: number; seq: number };

/** What a record changes outside the ledger (the lease it was admitted from, cost averages). */
export type RecordOutcome = {
	changed: boolean;
	keyId: string;
	leaseId: string | null;
	consumedDelta: number;
	successesDelta: number;
	releaseAdmissionId: string | null;
	sample: { cost: number; requests: number } | null;
	awaitingSeed: boolean;
};

const counted = (part: Part) => Math.max(0, part.total - part.base);

function nonNegative(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export class HeldSpend {
	readonly entries = new Map<string, HeldEntry>();
	readonly aggregate = new Map<string, Segment[]>();
	readonly remembered = new Map<string, { keyId: string; cost: number; requests: number }>();
	private readonly seen = new Set<string>();
	private seq = 0;
	/** Sequence at the latest read start: aggregate additions after it open a new segment. */
	private lastReadSeq = 0;

	private next(): number {
		return ++this.seq;
	}

	private change(part: Part, total: number): boolean {
		if (total === part.total) return false;
		part.total = total;
		part.seq = this.next();
		return true;
	}

	/** Applies one record (I2, I7, I8). Returns null for an invalid or duplicate record. */
	record(record: SpendRecordEntry, now: number): RecordOutcome {
		const id = record.billingRequestId;
		const replace = record.replace === true;
		const final = replace && record.final === true;
		const cost = nonNegative(record.costNanos);
		const requests = nonNegative(record.requests);
		const release = typeof record.releaseAdmissionId === "string" && record.releaseAdmissionId ? record.releaseAdmissionId : null;
		const outcome: RecordOutcome = {
			changed: false, keyId: record.keyId, leaseId: record.leaseId ?? null, consumedDelta: 0, successesDelta: 0,
			releaseAdmissionId: null, sample: null, awaitingSeed: false,
		};
		// A request's successes and release settle with its final (or ordinary) record, whatever the ledger keeps.
		const settles = !replace || final;
		const existing = this.entries.get(id);
		if (existing) {
			if (existing.keyId !== record.keyId || !replace || !existing.stepped || existing.stepped.final) return outcome;
			const before = existing.cost.total;
			if (existing.phase === "held") {
				this.change(existing.cost, final ? cost : Math.max(before, cost));
				if (final) this.change(existing.requests, requests);
			} else {
				this.change(existing.cost, Math.max(before, cost));
				if (final) this.change(existing.requests, Math.max(existing.requests.total, requests));
			}
			if (existing.cost.total > before) existing.increasedAt = now;
			if (final) existing.stepped.final = true;
			existing.recordedAt = now;
			outcome.changed = final || existing.cost.total !== before;
			outcome.consumedDelta = existing.cost.total - before;
		} else if (this.seen.has(id)) {
			// Already taken over (or folded, or retired): only a replacement record can report more.
			if (!replace) return outcome;
			const known = this.remembered.get(id);
			if (known && known.keyId !== record.keyId) return outcome;
			const costBase = known?.cost ?? 0;
			const requestsBase = known?.requests ?? 0;
			const requestsTotal = final ? Math.max(requests, requestsBase) : requestsBase;
			if (cost > costBase || requestsTotal > requestsBase) {
				this.entries.set(id, {
					billingRequestId: id, requestId: requestIdOf(record), keyId: record.keyId, at: now, increasedAt: now, recordedAt: now,
					cost: { total: Math.max(cost, costBase), base: costBase, seq: this.next() },
					requests: { total: requestsTotal, base: requestsBase, seq: this.next() },
					phase: "handoff", reason: "late", stepped: { final },
				});
				outcome.changed = true;
				outcome.consumedDelta = Math.max(0, cost - costBase);
			}
		} else {
			this.markSeen(id);
			const awaitingSeed = replace && !(record.revision === 1 && !final);
			const at = Number.isFinite(record.occurredAtMs) ? Number(record.occurredAtMs) : now;
			this.entries.set(id, {
				billingRequestId: id, requestId: requestIdOf(record), keyId: record.keyId, at, increasedAt: now, recordedAt: now,
				cost: { total: cost, base: 0, seq: this.next() },
				requests: { total: settles ? requests : 0, base: 0, seq: this.next() },
				phase: "held",
				...(replace ? { stepped: { final } } : {}),
				...(awaitingSeed ? { awaitingSeed: true } : {}),
			});
			outcome.changed = true;
			outcome.consumedDelta = cost;
			outcome.awaitingSeed = awaitingSeed;
		}
		// Credited once, by the record that settled it: a replay changes nothing and credits nothing
		// (the lease then keeps holding the slot until its hold ends, an over-count).
		if (settles && outcome.changed) {
			outcome.successesDelta = requests;
			outcome.releaseAdmissionId = release;
			if (requests > 0) outcome.sample = { cost, requests };
		}
		return outcome;
	}

	markSeen(id: string): void {
		this.seen.add(id);
		if (this.seen.size > MAX_SEEN_IDS) {
			const oldest = this.seen.values().next();
			if (!oldest.done) this.seen.delete(oldest.value);
		}
	}

	/** Why a held entry should be handed off now, if it should. */
	staleness(entry: HeldEntry, now: number): Reason | null {
		if (entry.phase !== "held") return null;
		if (now - entry.recordedAt > SPEND_LEASE.pendingTtlMs) return "expired";
		if (!entry.stepped) return null;
		const opened = windowStarts(entry.at);
		const current = windowStarts(now);
		return opened.daily !== current.daily || opened.weekly !== current.weekly || opened.monthly !== current.monthly
			? "period_ended"
			: null;
	}

	/** I3 → handoff, with fresh sequences (I5). */
	private handOff(entry: HeldEntry, reason: Reason): void {
		entry.phase = "handoff";
		entry.reason = reason;
		entry.cost.seq = this.next();
		entry.requests.seq = this.next();
		delete entry.awaitingSeed;
	}

	/** Hands off held entries that expired or whose period ended. */
	markStale(now: number): void {
		for (const entry of this.entries.values()) {
			const stale = this.staleness(entry, now);
			if (stale) this.handOff(entry, stale);
		}
	}

	private heldNewestFirst(): HeldEntry[] {
		return [...this.entries.values()].filter((entry) => entry.phase === "held")
			.sort((left, right) => right.recordedAt - left.recordedAt);
	}

	/** The ids the next seed must exclude (both ids of every held entry), within the seed's limit (I9). */
	exclusions(): { ids: string[]; entries: HeldEntry[]; overflowed: number } {
		const ids = new Set<string>();
		const entries: HeldEntry[] = [];
		let overflowed = 0;
		for (const entry of this.heldNewestFirst()) {
			const own = [entry.requestId, entry.billingRequestId].filter((id) => !ids.has(id));
			if (ids.size + own.length > SPEND_LEASE.maxExcludedRequestIds) {
				this.handOff(entry, "overflow");
				overflowed += 1;
				continue;
			}
			for (const id of own) ids.add(id);
			entries.push(entry);
		}
		return { ids: [...ids], entries, overflowed };
	}

	/** Ids held entries need excluded. */
	heldIdCount(): number {
		let count = 0;
		for (const entry of this.entries.values()) {
			if (entry.phase === "held") count += entry.requestId === entry.billingRequestId ? 1 : 2;
		}
		return count;
	}

	awaitingSeed(): boolean {
		for (const entry of this.entries.values()) if (entry.awaitingSeed) return true;
		return false;
	}

	/** A read starts: records from here may be missing from it. */
	beginRead(): number {
		this.lastReadSeq = this.seq;
		return this.seq;
	}

	/**
	 * A seed whose read started at `readSeq` is published (I4). `excluded` are the ids it excluded,
	 * `audited` the request ids whose audit rows it returned.
	 */
	publish(readSeq: number, excluded: Set<string>, audited: Set<string>): void {
		for (const entry of [...this.entries.values()]) {
			if (entry.phase === "handoff") {
				if (entry.cost.seq <= readSeq) entry.cost.base = entry.cost.total;
				if (entry.requests.seq <= readSeq) entry.requests.base = entry.requests.total;
				if (counted(entry.cost) === 0 && counted(entry.requests) === 0 && entry.cost.seq <= readSeq && entry.requests.seq <= readSeq) {
					this.entries.delete(entry.billingRequestId);
					this.remember(entry);
				}
				continue;
			}
			if (excluded.has(entry.billingRequestId)) delete entry.awaitingSeed;
			// Its audit row exists: the next seed counts the request, so stop excluding it.
			if (audited.has(entry.requestId)) this.handOff(entry, "audited");
		}
		for (const [key, segments] of this.aggregate) {
			const kept = segments.filter((segment) => segment.seq > readSeq);
			if (kept.length) this.aggregate.set(key, kept);
			else this.aggregate.delete(key);
		}
	}

	private remember(entry: HeldEntry): void {
		this.remembered.delete(entry.billingRequestId);
		this.remembered.set(entry.billingRequestId, { keyId: entry.keyId, cost: entry.cost.total, requests: entry.requests.total });
		if (this.remembered.size > MAX_REMEMBERED) {
			const oldest = this.remembered.keys().next();
			if (!oldest.done) this.remembered.delete(oldest.value);
		}
	}

	/** I9, applied on every record batch and at every read. */
	enforceBounds(): void {
		const held = this.heldNewestFirst();
		let ids = 0;
		for (const entry of held) {
			const own = entry.requestId === entry.billingRequestId ? 1 : 2;
			if (ids + own > SPEND_LEASE.maxExcludedRequestIds) this.handOff(entry, "overflow");
			else ids += own;
		}
		const handoff = [...this.entries.values()].filter((entry) => entry.phase === "handoff");
		if (handoff.length > MAX_HANDOFF_ENTRIES) {
			handoff.sort((left, right) => left.recordedAt - right.recordedAt);
			for (const entry of handoff.slice(0, handoff.length - MAX_HANDOFF_ENTRIES)) {
				this.addAggregate(entry.keyId, counted(entry.cost), counted(entry.requests));
				this.entries.delete(entry.billingRequestId);
			}
		}
		while (this.aggregate.size > MAX_AGGREGATE_KEYS + (this.aggregate.has(WORKSPACE_AGGREGATE) ? 1 : 0)) {
			const [key, segments] = [...this.aggregate.entries()].find(([candidate]) => candidate !== WORKSPACE_AGGREGATE)!;
			this.aggregate.delete(key);
			for (const segment of segments) this.addSegment(WORKSPACE_AGGREGATE, segment);
		}
	}

	private addAggregate(keyId: string, cost: number, requests: number): void {
		if (cost <= 0 && requests <= 0) return;
		// A fresh sequence: only a read that starts after the fold takes it over (I5).
		this.addSegment(this.aggregate.has(keyId) || this.aggregate.size < MAX_AGGREGATE_KEYS ? keyId : WORKSPACE_AGGREGATE,
			{ cost, requests, seq: this.next() });
	}

	private addSegment(key: string, segment: Segment): void {
		const segments = this.aggregate.get(key) ?? [];
		const last = segments.at(-1);
		// Additions since the latest read started share a segment; earlier ones stay apart (I9).
		if (last && last.seq > this.lastReadSeq && segment.seq > this.lastReadSeq) {
			last.cost += segment.cost;
			last.requests += segment.requests;
			last.seq = Math.max(last.seq, segment.seq);
		} else {
			segments.push({ ...segment });
			segments.sort((left, right) => left.seq - right.seq);
		}
		while (segments.length > MAX_SEGMENTS) {
			const [first, second] = segments.splice(0, 2);
			segments.unshift({ cost: first.cost + second.cost, requests: first.requests + second.requests, seq: Math.max(first.seq, second.seq) });
		}
		this.aggregate.set(key, segments);
	}

	private countsIn(entry: HeldEntry, windowStart: number | null): boolean {
		return windowStart === null || entry.at >= windowStart || entry.increasedAt >= windowStart;
	}

	private aggregateOf(key: string): { cost: number; requests: number } {
		let cost = 0;
		let requests = 0;
		for (const segment of this.aggregate.get(key) ?? []) {
			cost += segment.cost;
			requests += segment.requests;
		}
		return { cost, requests };
	}

	/** One key's usage in the window starting at `windowStart`. */
	keyUsage(keyId: string, windowStart: number): { cost: number; requests: number } {
		let cost = 0;
		let requests = 0;
		for (const entry of this.entries.values()) {
			if (entry.keyId !== keyId || !this.countsIn(entry, windowStart)) continue;
			cost += counted(entry.cost);
			requests += counted(entry.requests);
		}
		for (const key of [keyId, WORKSPACE_AGGREGATE]) {
			const folded = this.aggregateOf(key);
			cost += folded.cost;
			requests += folded.requests;
		}
		return { cost, requests };
	}

	/** Cost of every key in the window (null: lifetime), or of the keys in `keyIds`. */
	cost(windowStart: number | null, keyIds?: Set<string>): number {
		let cost = 0;
		for (const entry of this.entries.values()) {
			if (keyIds && !keyIds.has(entry.keyId)) continue;
			if (this.countsIn(entry, windowStart)) cost += counted(entry.cost);
		}
		for (const key of this.aggregate.keys()) {
			if (keyIds && key !== WORKSPACE_AGGREGATE && !keyIds.has(key)) continue;
			cost += this.aggregateOf(key).cost;
		}
		return cost;
	}
}

function requestIdOf(record: SpendRecordEntry): string {
	return typeof record.requestId === "string" && record.requestId ? record.requestId : record.billingRequestId;
}
