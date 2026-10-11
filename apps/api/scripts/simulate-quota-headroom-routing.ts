// Purpose: Show how routing shares traffic with a provider as it approaches a declared limit.
// How: Simulates isolates routing between a limited provider (A) and an unlimited one (B) of equal
//      score, with the coordinator's lease accounting, isolate-local saturation marks and the
//      projected-use routing penalty. Compares policies and prints JSON.
// Usage: pnpm exec tsx scripts/simulate-quota-headroom-routing.ts > out.json
//        QH_DIAG=<A's unpenalised share of its limit> prints projection accuracy instead.

import {
	QUOTA_HEADROOM,
	projectedQuotaUse,
	quotaHeadroomMultiplier,
	unusedLeaseAllowance,
} from "../src/core/provider-quota-headroom";

type Policy = {
	name: string;
	curve: { penaltyStart: number; penaltyFloor: number } | null;
	/** Lease lifetime once the projection reaches the penalty; unset keeps the normal lifetime. */
	nearLimitLeaseTtlMs?: number;
};

const PROPOSED_CURVE = { penaltyStart: QUOTA_HEADROOM.penaltyStart, penaltyFloor: QUOTA_HEADROOM.penaltyFloor };
const POLICIES: Policy[] = [
	{ name: "current", curve: null },
	{ name: "proposed", curve: PROPOSED_CURVE },
	{ name: "proposed + short leases", curve: PROPOSED_CURVE, nearLimitLeaseTtlMs: 10_000 },
	{ name: "late + short leases", curve: { penaltyStart: 0.85, penaltyFloor: 0.02 }, nearLimitLeaseTtlMs: 10_000 },
];

const LIMIT_RPM = 600;
const ISOLATES = 50;
const TICK_MS = 100;
const MINUTE = 60_000;
const LEASE = { ttlMs: 60_000, windowSkewMs: 2_000, minLifetimeMs: 3_000, shareDivisor: 4, reserveFraction: 0.02, minReserve: 2 };
const POOL = { topUpAt: 0.5, refreshAheadMs: 5_000, topUpBackoffMs: 1_000, targetCoverageMs: 20_000, minWantRequests: 4, demandBucketMs: 10_000 };
const SATURATED_MULTIPLIER = 1e-6;

type Report = { now: number; projected: number; counted: number; estimated: number; actual: number };
let DIAGNOSTICS: Report[] | null = null;
/** Requests actually sent to A in each minute (what the upstream sees). */
const actualByMinute = new Map<number, number>();

function rngFrom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poisson(mean: number, rng: () => number): number {
	const limit = Math.exp(-mean);
	let k = 0;
	let p = 1;
	do { k += 1; p *= rng(); } while (p > limit);
	return k - 1;
}

type Grant = { id: number; expiresAt: number; granted: number; used: number; projected: number };
type Outstanding = { window: number; granted: number; reported: number };
type Progress = { id: number; used: number };

/** Mirrors ProviderRateLimitDurableObject for one requests-per-minute limit. */
class Coordinator {
	window = 0;
	counted = 0;
	/** Estimated use of the previous minute; unknown until the first roll. */
	previous: number | null = null;
	private nextId = 1;
	private outstanding = new Map<number, Outstanding>();

	constructor(private readonly policy: Policy) {}

	private estimatedUse(window: number): number {
		let unused = 0;
		for (const lease of this.outstanding.values()) if (lease.window === window) unused += unusedLeaseAllowance(lease);
		return Math.max(0, this.counted - unused);
	}

	private roll(now: number) {
		const window = Math.floor(now / MINUTE);
		if (window === this.window) return;
		this.previous = window === this.window + 1 ? this.estimatedUse(this.window) : 0;
		this.window = window;
		this.counted = 0;
	}

	returnLease(grant: Grant, now: number) {
		this.roll(now);
		const lease = this.outstanding.get(grant.id);
		if (!lease) return;
		this.outstanding.delete(grant.id);
		if (lease.window === this.window) this.counted = Math.max(0, this.counted + grant.used - lease.granted);
	}

	recordRequest(now: number) { this.roll(now); this.counted += 1; }

	acquire(need: number, want: number, progress: Progress[], now: number): { grant: Grant | null; denied: boolean } {
		this.roll(now);
		for (const report of progress) {
			const lease = this.outstanding.get(report.id);
			if (lease) lease.reported = Math.max(lease.reported, report.used);
		}
		if (need > 0 && this.counted + need > LIMIT_RPM) return { grant: null, denied: true };
		const windowStartMs = this.window * MINUTE;
		const estimated = this.estimatedUse(this.window) + need;
		const projected = projectedQuotaUse([{ limit: LIMIT_RPM, used: estimated, previous: this.previous, windowMs: MINUTE, windowStartMs }], now);
		DIAGNOSTICS?.push({ now, projected, counted: this.counted + need, estimated, actual: actualByMinute.get(this.window) ?? 0 });
		const floor = Math.max(LEASE.minReserve, Math.ceil(LIMIT_RPM * LEASE.reserveFraction));
		const surplus = Math.floor(Math.max(0, LIMIT_RPM - this.counted - need - floor) / LEASE.shareDivisor);
		const extra = Math.min(Math.max(0, want - need), surplus);
		// Near a limit, shorter leases hand unused allowance back sooner.
		const ttlMs = this.policy.nearLimitLeaseTtlMs && this.policy.curve && projected >= this.policy.curve.penaltyStart
			? this.policy.nearLimitLeaseTtlMs
			: LEASE.ttlMs;
		const expiresAt = Math.min(now + ttlMs, windowStartMs + MINUTE - LEASE.windowSkewMs);
		const useful = extra >= 1 && expiresAt - now >= LEASE.minLifetimeMs;
		if (!useful) {
			if (need === 0) return { grant: null, denied: false };
			this.counted += need;
			return { grant: { id: 0, expiresAt: 0, granted: need, used: need, projected }, denied: false };
		}
		const id = this.nextId++;
		this.counted += need + extra;
		this.outstanding.set(id, { window: this.window, granted: need + extra, reported: need });
		return { grant: { id, expiresAt, granted: need + extra, used: need, projected }, denied: false };
	}
}

/** Mirrors LeasePool and the isolate-local saturation and projection state. */
class Isolate {
	private leases: Grant[] = [];
	private saturatedUntil = 0;
	private topUpPausedUntil = 0;
	private projection: { value: number; until: number } | null = null;
	private bucketStart = 0;
	private bucket = 0;
	private previousBucket = 0;

	constructor(private readonly coordinator: Coordinator) {}

	private noteDemand(now: number) {
		if (now - this.bucketStart >= POOL.demandBucketMs) {
			this.previousBucket = now - this.bucketStart >= 2 * POOL.demandBucketMs ? 0 : this.bucket;
			this.bucket = 0;
			this.bucketStart = now;
		}
		this.bucket += 1;
	}

	private want(now: number): number {
		const windowMs = POOL.demandBucketMs + Math.max(1, now - this.bucketStart);
		const projected = Math.ceil((this.bucket + this.previousBucket) * POOL.targetCoverageMs / windowMs);
		return Math.max(POOL.minWantRequests, projected);
	}

	private progress(): Progress[] {
		return this.leases.map((lease) => ({ id: lease.id, used: lease.used }));
	}

	private remember(grant: Grant, now: number) {
		this.projection = { value: grant.projected, until: now + QUOTA_HEADROOM.ttlMs };
	}

	/** Returns expired and spent leases. */
	sweep(now: number) {
		this.leases = this.leases.filter((lease) => {
			if (lease.expiresAt > now && lease.used < lease.granted) return true;
			this.coordinator.returnLease(lease, now);
			return false;
		});
	}

	/** Routing weight of A relative to B's 1, from what this isolate knows. */
	weight(policy: Policy, now: number): number {
		if (this.saturatedUntil > now) return SATURATED_MULTIPLIER;
		if (!policy.curve || !this.projection || this.projection.until <= now) return 1;
		return quotaHeadroomMultiplier(this.projection.value, policy.curve);
	}

	private needsTopUp(now: number): boolean {
		if (now < this.topUpPausedUntil || this.leases.length === 0) return false;
		const granted = this.leases.reduce((sum, lease) => sum + lease.granted, 0);
		const used = this.leases.reduce((sum, lease) => sum + lease.used, 0);
		const lasting = this.leases.some((lease) => lease.expiresAt - now > POOL.refreshAheadMs);
		return used >= granted * POOL.topUpAt || !lasting;
	}

	/** Charges an attempt on A; returns whether the coordinator refused it (it is sent anyway). */
	charge(now: number): boolean {
		this.noteDemand(now);
		this.sweep(now);
		const lease = this.leases.find((held) => held.used < held.granted);
		if (lease) {
			lease.used += 1;
			if (this.needsTopUp(now)) {
				const topUp = this.coordinator.acquire(0, this.want(now), this.progress(), now);
				if (topUp.grant) {
					this.leases.push(topUp.grant);
					this.remember(topUp.grant, now);
				} else {
					this.topUpPausedUntil = now + POOL.topUpBackoffMs;
				}
			}
			return false;
		}
		const result = this.coordinator.acquire(1, this.want(now), this.progress(), now);
		if (result.denied) {
			this.saturatedUntil = (Math.floor(now / MINUTE) + 1) * MINUTE;
			this.coordinator.recordRequest(now);
			return true;
		}
		if (result.grant!.expiresAt !== 0) this.leases.push(result.grant!);
		this.remember(result.grant!, now);
		return false;
	}
}

type Second = { t: number; demand: number; sentA: number; refusedA: number; weightA: number };

function run(policy: Policy, demandRpm: (t: number) => number, durationMs: number, seed: number, isolateCount = ISOLATES): Second[] {
	const rng = rngFrom(seed);
	const coordinator = new Coordinator(policy);
	const isolates = Array.from({ length: isolateCount }, () => new Isolate(coordinator));
	actualByMinute.clear();
	const seconds: Second[] = [];
	let current: Second = { t: 0, demand: 0, sentA: 0, refusedA: 0, weightA: 0 };
	let weightSamples = 0;
	for (let now = 0; now < durationMs; now += TICK_MS) {
		if (now % 1000 === 0 && now > 0) {
			current.weightA = weightSamples ? current.weightA / weightSamples : 1;
			seconds.push(current);
			current = { t: now / 1000, demand: 0, sentA: 0, refusedA: 0, weightA: 0 };
			weightSamples = 0;
		}
		// Like LeasePool, isolates return expired leases only when they next admit in the scope.
		const arrivals = poisson(demandRpm(now) / 60 / (1000 / TICK_MS), rng);
		for (let index = 0; index < arrivals; index += 1) {
			const isolate = isolates[Math.floor(rng() * isolateCount)];
			const weight = isolate.weight(policy, now);
			current.weightA += weight;
			weightSamples += 1;
			current.demand += 1;
			// Saturated candidates are ordered behind B, which is always available here.
			if (weight === SATURATED_MULTIPLIER) continue;
			if (rng() < weight / (weight + 1)) {
				current.sentA += 1;
				const minute = Math.floor(now / MINUTE);
				actualByMinute.set(minute, (actualByMinute.get(minute) ?? 0) + 1);
				if (isolate.charge(now)) current.refusedA += 1;
			}
		}
	}
	current.weightA = weightSamples ? current.weightA / weightSamples : 1;
	seconds.push(current);
	return seconds;
}

function perMinute(seconds: Second[]) {
	const minutes = new Map<number, { demand: number; sentA: number }>();
	for (const second of seconds) {
		const minute = Math.floor(second.t / 60);
		const entry = minutes.get(minute) ?? { demand: 0, sentA: 0 };
		entry.demand += second.demand;
		entry.sentA += second.sentA;
		minutes.set(minute, entry);
	}
	return [...minutes.values()];
}

function steadyState(policy: Policy, naturalShareOfLimit: number, seed: number, isolateCount = ISOLATES) {
	// B and A have equal scores, so unpenalised A receives half of the demand.
	const demand = 2 * naturalShareOfLimit * LIMIT_RPM;
	const seconds = run(policy, () => demand, 12 * MINUTE, seed, isolateCount);
	const settled = seconds.filter((second) => second.t >= 120);
	const minutes = perMinute(settled).slice(0, -1);
	const sentA = minutes.reduce((sum, minute) => sum + minute.sentA, 0) / minutes.length;
	const overshoot = minutes.reduce((sum, minute) => sum + Math.max(0, minute.sentA - LIMIT_RPM), 0) / minutes.length;
	// Swing: spread of A's share between 5-second buckets.
	const buckets: number[] = [];
	for (let index = 0; index + 5 <= settled.length; index += 5) {
		const slice = settled.slice(index, index + 5);
		const total = slice.reduce((sum, second) => sum + second.demand, 0);
		if (total > 0) buckets.push(slice.reduce((sum, second) => sum + second.sentA, 0) / total);
	}
	const mean = buckets.reduce((sum, value) => sum + value, 0) / buckets.length;
	const deviation = Math.sqrt(buckets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / buckets.length);
	return {
		naturalShareOfLimit,
		useOfLimit: sentA / LIMIT_RPM,
		overshootPerMinute: overshoot,
		meanShare: mean,
		shareSwing: deviation,
		minShare: Math.min(...buckets),
		maxShare: Math.max(...buckets),
	};
}

if (process.env.QH_DIAG) {
	for (const isolateCount of [5, 50]) {
		DIAGNOSTICS = [];
		run(POLICIES[0], () => 2 * Number(process.env.QH_DIAG) * LIMIT_RPM, 6 * MINUTE, 3, isolateCount);
		console.log(`${isolateCount} isolates`);
		for (let minute = 2; minute < 5; minute += 1) {
			const reports = DIAGNOSTICS.filter((report) => Math.floor(report.now / MINUTE) === minute);
			const phase = (from: number, to: number) => {
				const slice = reports.filter((report) => report.now % MINUTE >= from * 1000 && report.now % MINUTE < to * 1000);
				const mean = (key: keyof Report) => slice.reduce((sum, report) => sum + report[key], 0) / Math.max(1, slice.length);
				return `${from}-${to}s p=${mean("projected").toFixed(2)} actual=${mean("actual").toFixed(0)} est=${mean("estimated").toFixed(0)} counted=${mean("counted").toFixed(0)}`;
			};
			console.log(`  minute ${minute}: end-of-window ${((actualByMinute.get(minute) ?? 0) / LIMIT_RPM).toFixed(2)} | ${[[0, 15], [15, 30], [30, 45], [45, 60]]
				.map(([from, to]) => phase(from, to)).join(" | ")}`);
		}
	}
	process.exit(0);
}

const rampMinutes = 10;
// A's unpenalised share rises from 0.25x to 2.5x its limit.
const ramp = (t: number) => 2 * LIMIT_RPM * (0.25 + 2.25 * Math.min(1, t / (rampMinutes * MINUTE)));
const timelines = Object.fromEntries(POLICIES.map((policy) => [policy.name, run(policy, ramp, (rampMinutes + 3) * MINUTE, 7)
	.map((second) => ({ t: second.t, demand: second.demand, sentA: second.sentA, refusedA: second.refusedA, weightA: Number(second.weightA.toFixed(4)) }))]));
const shares = [0.5, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 4];
const sweep = Object.fromEntries(POLICIES.map((policy) => [policy.name, shares.map((share) => steadyState(policy, share, 11))]));
const fewIsolates = Object.fromEntries(POLICIES.map((policy) => [policy.name, shares.map((share) => steadyState(policy, share, 13, 5))]));
const curve = Array.from({ length: 121 }, (_, index) => {
	const projected = index / 100;
	return { projected, ...Object.fromEntries(POLICIES.filter((policy) => policy.curve)
		.map((policy) => [policy.name, quotaHeadroomMultiplier(projected, policy.curve!)])) };
});

console.log(JSON.stringify({ limitRpm: LIMIT_RPM, isolates: ISOLATES, policies: POLICIES, curve, sweep, fewIsolates, timelines }));
