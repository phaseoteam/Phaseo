// Purpose: Isolate-side cache of allowance leases granted by a coordinating Durable Object.
// Why: Awaiting a global Durable Object before every request adds 5-250 ms and caps throughput.
// How: The object grants each isolate a slice of the remaining allowance. Requests are admitted
//      from the slice synchronously; the slice is topped up in the background and only an empty
//      (or near-cap) slice awaits the object. Unused slices are returned when they expire.
//
// Invariants:
// - The coordinator counts a slice as consumed when it grants it, so the sum of all slices never
//   exceeds the remaining allowance. Admission from a slice can therefore never exceed a cap.
// - A lease is admitted from only until `expiresAt` (the coordinator bounds it by the window end
//   minus a clock-skew margin). Usage is reported back once, when the lease is returned.
// - Settlements (actual usage, releases) are applied locally while the lease is still held, and
//   are otherwise the caller's responsibility to send to the coordinator.

import { awaitShared } from "@core/shared-wait";

/** Two allowance dimensions: requests, and a scope-defined unit (tokens or cost nanos). */
export type LeaseVector = { requests: number; units: number };

export type LeaseGrant<M> = {
	id: string;
	/** Coordinator epoch ms after which the lease must not admit. `0` marks a single-use grant. */
	expiresAt: number;
	/** Granted requests; `null` when the dimension is unlimited for this scope. */
	requests: number | null;
	/** Granted units; `null` when the dimension is unlimited for this scope. */
	units: number | null;
	meta: M;
};

export type LeaseReturn = {
	id: string;
	usedRequests: number;
	usedUnits: number;
	/** Admissions not yet settled when the lease was returned (still in flight). */
	inFlightRequests: number;
};

export type LeaseAcquireResult<M, D> =
	| { ok: true; lease: LeaseGrant<M> }
	/** `denial: null` means nothing was granted for a background top-up. */
	| { ok: false; denial: D | null };

export type LeaseTransport<M, D> = {
	acquire(need: LeaseVector, want: LeaseVector, returns: LeaseReturn[]): Promise<LeaseAcquireResult<M, D>>;
	returnLeases(returns: LeaseReturn[]): Promise<void>;
};

export type LeaseTicket<M> = {
	/** Caller-supplied admission id; settlements are applied at most once per ticket. */
	id: string;
	leaseId: string;
	meta: M;
	requests: number;
	units: number;
	/** True when admitted from a held slice without awaiting the coordinator. */
	fromSlice: boolean;
};

export type LeaseAdmission<M, D> =
	| { allowed: true; ticket: LeaseTicket<M> }
	| { allowed: false; denial: D };

export type LeasePoolOptions = {
	/** Top up in the background once this fraction of the held allowance is used. */
	topUpAt?: number;
	/** Top up when held leases expire within this many milliseconds. */
	refreshAheadMs?: number;
	/** A lease should cover roughly this much of the isolate's observed demand. */
	targetCoverageMs?: number;
	minWantRequests?: number;
	maxWantRequests?: number;
	/** Pause background top-ups for this long after one grants nothing. */
	topUpBackoffMs?: number;
	/**
	 * "reserve" (default): admissions reserve `need.units` up front (provider tokens).
	 * "precheck": units are only known after the request (spend). A slice admits while its
	 * settled units plus an estimate for in-flight admissions stay below the grant.
	 */
	unitsMode?: "reserve" | "precheck";
	now?: () => number;
	background?: (promise: Promise<unknown>) => void;
};

type HeldLease<M> = {
	grant: LeaseGrant<M>;
	usedRequests: number;
	usedUnits: number;
	inFlightRequests: number;
};

const DEMAND_BUCKET_MS = 10_000;
const MAX_SETTLED_TICKETS = 20_000;
// Another request's acquire may never settle for this one (its I/O is cancelled when that
// request ends), so cold requests join it only briefly and stop treating it as busy later.
const SHARED_ACQUIRE_WAIT_MS = 1_000;
const STALE_COORDINATOR_CALL_MS = 10_000;

function fits(lease: HeldLease<unknown>, need: LeaseVector, precheck: boolean): boolean {
	const { requests, units } = lease.grant;
	if (requests !== null && lease.usedRequests + need.requests > requests) return false;
	// In precheck mode units are checked across all held leases (see tryAdmit).
	return precheck || units === null || lease.usedUnits + need.units <= units;
}

export class LeasePool<M, D> {
	private readonly held = new Map<string, HeldLease<M>>();
	private returns: LeaseReturn[] = [];
	private acquiring: Promise<unknown> | null = null;
	private acquiringSince = 0;
	private toppingUp: { since: number } | null = null;
	private topUpPausedUntil = 0;
	private readonly settled = new Set<string>();
	private demand = { bucketStart: 0, requests: 0, units: 0, previousRequests: 0, previousUnits: 0 };
	/** Moving average of settled units per request (precheck mode). */
	private unitsPerRequest = 0;
	private readonly options: Required<Omit<LeasePoolOptions, "now" | "background">> & Pick<LeasePoolOptions, "background">;
	private readonly now: () => number;

	constructor(options: LeasePoolOptions = {}) {
		this.now = options.now ?? Date.now;
		this.options = {
			topUpAt: options.topUpAt ?? 0.5,
			refreshAheadMs: options.refreshAheadMs ?? 5_000,
			targetCoverageMs: options.targetCoverageMs ?? 20_000,
			minWantRequests: options.minWantRequests ?? 4,
			maxWantRequests: options.maxWantRequests ?? 10_000,
			topUpBackoffMs: options.topUpBackoffMs ?? 1_000,
			unitsMode: options.unitsMode ?? "reserve",
			background: options.background,
		};
		this.demand.bucketStart = this.now();
	}

	/** Admits from a held slice without awaiting, or returns null. */
	tryAdmit(id: string, need: LeaseVector): LeaseTicket<M> | null {
		const now = this.now();
		this.sweep(now);
		const precheck = this.options.unitsMode === "precheck";
		if (precheck) {
			// Units are only settled after a request, so one slice can overrun its grant; pooling the
			// held slices lets the others absorb that, keeping the isolate within its total grant.
			let granted = 0, used = 0, inFlight = 0, limited = false;
			for (const lease of this.held.values()) {
				if (lease.grant.expiresAt <= now || lease.grant.units === null) continue;
				limited = true;
				granted += lease.grant.units;
				used += lease.usedUnits;
				inFlight += lease.inFlightRequests;
			}
			if (limited && used + inFlight * this.unitsPerRequest >= granted) return null;
		}
		let chosen: HeldLease<M> | null = null;
		let chosenSpare = -Infinity;
		for (const lease of this.held.values()) {
			if (lease.grant.expiresAt <= now || !fits(lease, need, precheck)) continue;
			if (!precheck) { chosen = lease; break; }
			// Charge the slice with the most unsettled room, so its coordinator hold stays accurate.
			const spare = lease.grant.units === null ? Infinity
				: lease.grant.units - lease.usedUnits - lease.inFlightRequests * this.unitsPerRequest;
			if (spare > chosenSpare) { chosen = lease; chosenSpare = spare; }
		}
		if (chosen) {
			const lease = chosen;
			lease.usedRequests += need.requests;
			lease.usedUnits += need.units;
			lease.inFlightRequests += need.requests;
			this.observe(need, now);
			return { id, leaseId: lease.grant.id, meta: lease.grant.meta, requests: need.requests, units: need.units, fromSlice: true };
		}
		return null;
	}

	/**
	 * Admits from a held slice when possible (no await); otherwise awaits one coordinator grant.
	 * Coordinator errors propagate so the caller can choose to fail open or closed.
	 */
	async admit(id: string, need: LeaseVector, transport: LeaseTransport<M, D>): Promise<LeaseAdmission<M, D>> {
		const local = this.tryAdmit(id, need);
		if (local) {
			this.afterAdmission(transport);
			return { allowed: true, ticket: local };
		}
		if (this.acquiring) {
			// Concurrent cold requests share the first grant before asking for their own.
			await awaitShared(this.acquiring, SHARED_ACQUIRE_WAIT_MS);
			const shared = this.tryAdmit(id, need);
			if (shared) {
				this.afterAdmission(transport);
				return { allowed: true, ticket: shared };
			}
		}
		if (this.options.unitsMode === "precheck") {
			// Nothing held can admit: hand it all back with this request so the coordinator decides
			// on exact usage instead of counting this isolate's unusable remainders as held.
			for (const lease of [...this.held.values()]) this.close(lease);
		}
		const returns = this.takeReturns();
		const request = transport.acquire(need, this.want(need), returns);
		this.acquiring = request;
		this.acquiringSince = this.now();
		let result: LeaseAcquireResult<M, D>;
		try {
			result = await request;
		} catch (error) {
			this.returns.push(...returns);
			throw error;
		} finally {
			if (this.acquiring === request) this.acquiring = null;
		}
		if ("denial" in result) {
			if (result.denial === null) throw new Error("lease_coordinator_returned_empty_admission");
			return { allowed: false, denial: result.denial };
		}
		const ticket = this.install(result.lease, id, need);
		this.afterAdmission(transport);
		return { allowed: true, ticket };
	}

	/**
	 * Applies a settlement to a still-held lease. Returns true when handled locally (including
	 * repeated settlements of the same ticket); false when the caller must notify the coordinator.
	 */
	settle(ticket: Pick<LeaseTicket<M>, "id" | "leaseId" | "requests">, delta: LeaseVector, opts: { final?: boolean } = {}): boolean {
		if (this.settled.has(ticket.id)) return true;
		const lease = this.held.get(ticket.leaseId);
		if (!lease) return false;
		lease.usedRequests = Math.max(0, lease.usedRequests + delta.requests);
		lease.usedUnits = Math.max(0, lease.usedUnits + delta.units);
		if (this.options.unitsMode === "precheck" && delta.units > 0) this.learnUnits(delta.units);
		if (opts.final !== false) {
			lease.inFlightRequests = Math.max(0, lease.inFlightRequests - ticket.requests);
			this.markSettled(ticket.id);
		}
		return true;
	}

	/** Feeds units settled outside a held lease into demand sizing (precheck mode). */
	learnUnits(units: number): void {
		if (!(units > 0) || !Number.isFinite(units)) return;
		this.unitsPerRequest = this.unitsPerRequest === 0 ? units : this.unitsPerRequest * 0.8 + units * 0.2;
		this.demand.units += units;
	}

	/** Records that a ticket was settled through the coordinator, so later local settles are ignored. */
	markSettled(ticketId: string): void {
		this.settled.add(ticketId);
		if (this.settled.size > MAX_SETTLED_TICKETS) {
			const oldest = this.settled.values().next();
			if (!oldest.done) this.settled.delete(oldest.value);
		}
	}

	isSettled(ticketId: string): boolean {
		return this.settled.has(ticketId);
	}

	holds(leaseId: string): boolean {
		return this.held.has(leaseId);
	}

	/** Sends returns for expired leases (and any queued returns) in the background. */
	flushReturns(transport: Pick<LeaseTransport<M, D>, "returnLeases">): void {
		const now = this.now();
		this.sweep(now);
		if (!this.returns.length || this.busy(now)) return;
		this.dispatch(transport.returnLeases(this.takeReturns()));
	}

	/** Returns every held lease now (used on configuration changes and in tests). */
	drain(): LeaseReturn[] {
		for (const lease of this.held.values()) this.close(lease);
		return this.takeReturns();
	}

	snapshot(): Array<{ id: string; requests: number | null; units: number | null; usedRequests: number; usedUnits: number; expiresAt: number }> {
		return [...this.held.values()].map((lease) => ({
			id: lease.grant.id,
			requests: lease.grant.requests,
			units: lease.grant.units,
			usedRequests: lease.usedRequests,
			usedUnits: lease.usedUnits,
			expiresAt: lease.grant.expiresAt,
		}));
	}

	private install(grant: LeaseGrant<M>, id: string, need: LeaseVector): LeaseTicket<M> {
		const now = this.now();
		this.observe(need, now);
		const ticket = { id, leaseId: grant.id, meta: grant.meta, requests: need.requests, units: need.units, fromSlice: false };
		if (grant.expiresAt > now) {
			this.held.set(grant.id, {
				grant,
				usedRequests: need.requests,
				usedUnits: need.units,
				inFlightRequests: need.requests,
			});
		}
		return ticket;
	}

	private close(lease: HeldLease<M>): void {
		this.held.delete(lease.grant.id);
		this.returns.push({
			id: lease.grant.id,
			usedRequests: lease.usedRequests,
			usedUnits: lease.usedUnits,
			inFlightRequests: lease.inFlightRequests,
		});
	}

	private sweep(now: number): void {
		for (const lease of this.held.values()) {
			if (lease.grant.expiresAt <= now) this.close(lease);
		}
	}

	private takeReturns(): LeaseReturn[] {
		const returns = this.returns;
		this.returns = [];
		return returns;
	}

	private observe(need: LeaseVector, now: number): void {
		const elapsed = now - this.demand.bucketStart;
		if (elapsed >= DEMAND_BUCKET_MS) {
			const skipped = elapsed >= 2 * DEMAND_BUCKET_MS;
			this.demand = {
				bucketStart: now,
				requests: 0,
				units: 0,
				previousRequests: skipped ? 0 : this.demand.requests,
				previousUnits: skipped ? 0 : this.demand.units,
			};
		}
		this.demand.requests += need.requests;
		this.demand.units += need.units;
	}

	/** Demand-sized request: enough for `targetCoverageMs` of recent traffic, never less than `need`. */
	private want(need: LeaseVector): LeaseVector {
		const windowMs = DEMAND_BUCKET_MS + Math.max(1, this.now() - this.demand.bucketStart);
		const recentRequests = this.demand.requests + this.demand.previousRequests;
		const recentUnits = this.demand.units + this.demand.previousUnits;
		const projected = Math.ceil(recentRequests * this.options.targetCoverageMs / windowMs);
		const requests = Math.max(need.requests, Math.min(this.options.maxWantRequests,
			Math.max(this.options.minWantRequests * Math.max(1, need.requests), projected)));
		const unitsPerRequest = recentRequests > 0 ? recentUnits / recentRequests : need.units / Math.max(1, need.requests);
		const units = Math.max(need.units, Math.ceil(unitsPerRequest * requests));
		return {
			requests,
			units: Number.isSafeInteger(units) ? units : Number.MAX_SAFE_INTEGER,
		};
	}

	private needsTopUp(now: number): boolean {
		let grantedRequests = 0, grantedUnits = 0, spareRequests = 0, spareUnits = 0;
		let limitedRequests = false, limitedUnits = false, lasting = false;
		for (const lease of this.held.values()) {
			const { requests, units, expiresAt } = lease.grant;
			const lastsLonger = expiresAt > now + this.options.refreshAheadMs;
			if (lastsLonger) lasting = true;
			if (requests !== null) {
				limitedRequests = true;
				grantedRequests += requests;
				if (lastsLonger) spareRequests += Math.max(0, requests - lease.usedRequests);
			}
			if (units !== null) {
				limitedUnits = true;
				grantedUnits += units;
				if (lastsLonger) spareUnits += Math.max(0, units - lease.usedUnits);
			}
		}
		if (!lasting) return true;
		const threshold = 1 - this.options.topUpAt;
		return (limitedRequests && spareRequests < grantedRequests * threshold) ||
			(limitedUnits && spareUnits < grantedUnits * threshold);
	}

	private afterAdmission(transport: LeaseTransport<M, D>): void {
		const now = this.now();
		if (!this.busy(now) && now >= this.topUpPausedUntil && this.needsTopUp(now)) {
			const marker = { since: now };
			this.toppingUp = marker;
			const returns = this.takeReturns();
			const recent = this.want({ requests: 0, units: 0 });
			const topUp = transport.acquire({ requests: 0, units: 0 }, recent, returns)
				.then((result) => {
					if ("lease" in result && result.lease.expiresAt > this.now()) {
						this.held.set(result.lease.id, { grant: result.lease, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 });
					} else {
						this.topUpPausedUntil = this.now() + this.options.topUpBackoffMs;
					}
				}, (error) => {
					this.returns.push(...returns);
					this.topUpPausedUntil = this.now() + this.options.topUpBackoffMs;
					throw error;
				})
				.finally(() => { if (this.toppingUp === marker) this.toppingUp = null; });
			this.dispatch(topUp);
			return;
		}
		if (this.returns.length && !this.busy(now)) {
			const returns = this.takeReturns();
			this.dispatch(transport.returnLeases(returns));
		}
	}

	/** A coordinator call is in flight, ignoring calls that have gone unanswered for too long. */
	private busy(now: number): boolean {
		return (this.acquiring !== null && now - this.acquiringSince < STALE_COORDINATOR_CALL_MS) ||
			(this.toppingUp !== null && now - this.toppingUp.since < STALE_COORDINATOR_CALL_MS);
	}

	private dispatch(promise: Promise<unknown>): void {
		const guarded = promise.catch((error) => {
			console.warn("lease_pool_background_failed", { error: error instanceof Error ? error.message : String(error) });
		});
		if (this.options.background) this.options.background(guarded);
	}
}
