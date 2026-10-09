// Purpose: Coordinate API-key spend/request caps and workspace budgets for one workspace.
// Why: Capped keys currently bypass the cached gateway context and recount day/week/month usage
//      in Postgres on every request.
// How: One object per workspace seeds usage from `gateway_spend_limit_seed`, keeps hot counters
//      in memory, adds idempotent spend records, and grants isolates leases (slices of the
//      remaining allowance, counted as held until the isolate settles them).
//
// Accounting model (per window):
//   committed = seeded usage + recorded spend not yet in the seed
//   held      = granted-but-unsettled lease allowance
//   An admission is allowed only while committed + held leaves room for it, so leases can never
//   jointly exceed a cap. Cost uses the existing pre-check semantics: a request is admitted while
//   usage is below the limit (its own cost is unknown until it completes).
//
// Storage: only leases are persisted (one insert per grant, one delete when settled or expired),
// so a restarted object never re-grants allowance an isolate may still be using. Counters,
// recorded spend and lease progress live in memory: after a restart the object reseeds from
// Postgres and treats persisted leases as fully held, which can only over-count (never under-count)
// until they are settled or expire.

import { DurableObject } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GatewayBindings } from "@/runtime/env.types";
import type { GateCheck } from "@pipeline/before/types";
import type { LeaseAcquireResult, LeaseReturn, LeaseVector } from "@core/lease-pool";
import {
	DAY_MS,
	KEY_WINDOWS,
	SPEND_LEASE,
	windowEnd,
	windowStarts,
	type BudgetInterval,
	type KeyWindow,
	type SpendDenial,
	type SpendLeaseMeta,
	type SpendRecordEntry,
	type SpendRecordResult,
	type WindowStarts,
} from "@core/spend-limits.shared";

type Usage = { requests: number; cost: number };

export type SpendLimitSeed = {
	now: string;
	day_start: string;
	week_start: string;
	month_start: string;
	keys: Array<{
		key_id: string;
		active: boolean;
		soft_blocked: boolean;
		limited: boolean;
		limits: Record<KeyWindow, { requests: number | null; cost_nanos: number | null }>;
		used: Record<KeyWindow, { requests: number; cost_nanos: number }> | null;
	}>;
	budget_status: {
		ok?: boolean;
		budgets?: Array<{
			id: string;
			interval: BudgetInterval;
			limit_nanos: number;
			usage_nanos: number;
			window_start: string | null;
			reset_at: string | null;
		}>;
	} | null;
	excluded_rows: Array<{ request_id: string; key_id: string | null; success: boolean; cost_nanos: number; created_at: string }>;
};

type KeyState = {
	found: boolean;
	softBlocked: boolean;
	limited: boolean;
	limits: Record<KeyWindow, Usage>;
	base: Record<KeyWindow, Usage>;
	avgCost: number;
	lastUsedAt: number;
};

type BudgetState = {
	id: string;
	interval: BudgetInterval;
	limit: number;
	statusUsage: number;
	windowStart: number | null;
	resetAt: string | null;
};

type Pending = {
	billingRequestId: string;
	requestId: string;
	keyId: string;
	cost: number;
	requests: number;
	at: number;
	recordedAt: number;
	/** The gateway_requests row exists: budget status already includes it. */
	persisted: boolean;
};

type Lease = {
	id: string;
	keyId: string;
	/** Granted requests (null: unlimited). Reduced to the used amount when returned. */
	requests: number | null;
	/** Granted cost nanos (null: unlimited). Set to the used amount when returned. */
	cost: number | null;
	successes: number;
	consumed: number;
	released: Set<string>;
	starts: WindowStarts;
	expiresAt: number;
	/** No further admissions: returned, or a single-admission grant. */
	closed: boolean;
	/** The remaining hold is dropped after this time. */
	holdUntil: number;
	persisted: boolean;
};

type LeaseRow = {
	id: string;
	key_id: string;
	requests: number | null;
	cost: number | null;
	day_start: number;
	week_start: number;
	month_start: number;
	expires_at: number;
};

const ZERO: Usage = { requests: 0, cost: 0 };
const MAX_SEEN_IDS = 50_000;

function nonNegative(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function iso(ms: number): string {
	return new Date(ms).toISOString();
}

export class SpendLimitDurableObject extends DurableObject<GatewayBindings> {
	private workspaceId: string | null = null;
	private seed: { windows: WindowStarts; at: number } | null = null;
	private seeding: Promise<void> | null = null;
	private readonly keys = new Map<string, KeyState>();
	private budgets: BudgetState[] = [];
	private workspaceAvgCost = 0;
	private readonly pending = new Map<string, Pending>();
	private readonly seen = new Set<string>();
	private readonly leases = new Map<string, Lease>();
	private readonly drainUntil = new Map<string, number>();
	private sweepAt = 0;
	private supabase: SupabaseClient | null = null;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS leases (
					id TEXT PRIMARY KEY,
					key_id TEXT NOT NULL,
					requests INTEGER,
					cost INTEGER,
					day_start INTEGER NOT NULL,
					week_start INTEGER NOT NULL,
					month_start INTEGER NOT NULL,
					expires_at INTEGER NOT NULL
				)
			`);
			// Progress on these leases was lost with the previous instance: hold them in full.
			for (const row of this.ctx.storage.sql.exec<LeaseRow>("SELECT * FROM leases").toArray()) {
				this.leases.set(row.id, {
					id: row.id,
					keyId: row.key_id,
					requests: row.requests,
					cost: row.cost,
					successes: 0,
					consumed: 0,
					released: new Set(),
					starts: { daily: row.day_start, weekly: row.week_start, monthly: row.month_start },
					expiresAt: row.expires_at,
					closed: false,
					holdUntil: row.expires_at + SPEND_LEASE.expiryGraceMs,
					persisted: true,
				});
			}
		});
	}

	/**
	 * Admits one request for `keyId` (when `need.requests > 0`) and grants a lease for part of the
	 * remaining allowance. `need.requests === 0` is a background top-up that may grant nothing.
	 */
	async acquire(
		workspaceId: string,
		keyId: string,
		need: LeaseVector,
		want: LeaseVector,
		returns: LeaseReturn[],
		admissionId: string,
	): Promise<LeaseAcquireResult<SpendLeaseMeta, SpendDenial>> {
		this.bind(workspaceId);
		if (typeof keyId !== "string" || !keyId) throw new Error("spend_limit_key_required");
		await this.ensureFresh(keyId);
		const now = Date.now();
		this.applyReturns(returns);
		this.sweep(now);
		const windows = this.seed!.windows;
		const key = this.keys.get(keyId)!;
		key.lastUsedAt = now;
		const requests = need.requests > 0 ? 1 : 0;

		const denial = this.keyDenial(keyId, key, windows, now) ?? this.budgetDenial(windows, now);
		if (denial) {
			if (!requests) return { ok: false, denial: null };
			// Ask isolates holding slices of this allowance to return them early.
			if (denial.contended) this.drainUntil.set(denial.gate.reason?.startsWith("workspace_") ? "*" : keyId, now + SPEND_LEASE.drainMs);
			return { ok: false, denial };
		}

		const meta: SpendLeaseMeta = { keyId, buckets: this.buckets(keyId, key, windows), unlimited: false };
		// Leases never outlive the seeded UTC day, so their holds apply to the windows they used.
		const dayEnd = windows.daily + DAY_MS - SPEND_LEASE.windowSkewMs;
		const requestLimits = KEY_WINDOWS.filter((window) => key.limits[window].requests > 0);
		const costLimited = KEY_WINDOWS.some((window) => key.limits[window].cost > 0) || this.budgets.length > 0;
		if (!requestLimits.length && !costLimited) {
			// Nothing to enforce: a long, unpersisted lease that admits everything.
			const expiresAt = Math.min(now + SPEND_LEASE.unlimitedTtlMs, dayEnd);
			return { ok: true, lease: { id: `${admissionId}:unlimited`, expiresAt, requests: null, units: null, meta: { ...meta, unlimited: true } } };
		}

		const avgCost = key.avgCost || this.workspaceAvgCost;
		const wantRequests = Math.max(requests, Math.min(10_000, nonNegative(want.requests)));
		let extraRequests: number | null = null;
		if (requestLimits.length) {
			extraRequests = Math.max(0, wantRequests - requests);
			for (const window of requestLimits) {
				const limit = key.limits[window].requests;
				const used = this.keyUsage(keyId, window, windows).requests + this.keyHolds(keyId, window, windows).requests + requests;
				const floor = Math.max(SPEND_LEASE.reserveRequests, Math.ceil(limit * SPEND_LEASE.reserveFraction));
				extraRequests = Math.min(extraRequests, Math.floor(Math.max(0, limit - used - floor) / SPEND_LEASE.shareDivisor));
			}
		}
		let grantCost: number | null = null;
		if (costLimited) {
			// At least one nano, so keys whose requests cost nothing still get a reusable slice.
			grantCost = Math.max(1, nonNegative(want.units), Math.ceil(avgCost * wantRequests));
			const costFloor = (limit: number) => Math.max(Math.ceil(limit * SPEND_LEASE.reserveFraction), Math.ceil(SPEND_LEASE.reserveAverageCosts * avgCost));
			for (const window of KEY_WINDOWS) {
				const limit = key.limits[window].cost;
				if (limit <= 0) continue;
				const used = this.keyUsage(keyId, window, windows).cost + this.keyHolds(keyId, window, windows).cost;
				grantCost = Math.min(grantCost, Math.floor(Math.max(0, limit - used - costFloor(limit)) / SPEND_LEASE.shareDivisor));
			}
			for (const budget of this.budgets) {
				const used = this.budgetUsage(budget) + this.budgetHolds(budget);
				grantCost = Math.min(grantCost, Math.floor(Math.max(0, budget.limit - used - costFloor(budget.limit)) / SPEND_LEASE.shareDivisor));
			}
		}
		const expiresAt = Math.min(now + SPEND_LEASE.ttlMs, dayEnd);
		// A cost slice smaller than an average request would only let its holder overrun it.
		const useful = (extraRequests === null || extraRequests >= 1) && (grantCost === null || grantCost >= Math.max(1, avgCost)) &&
			expiresAt - now >= SPEND_LEASE.minLifetimeMs;

		if (!useful) {
			if (!requests) return { ok: false, denial: null };
			// Admit this request alone. Its request slot stays held until it is recorded or released.
			const lease = this.createLease(`${admissionId}:single`, keyId, requestLimits.length ? 1 : null,
				costLimited ? 0 : null, windows, now, true);
			this.settleIfDone(lease);
			return { ok: true, lease: { id: lease.id, expiresAt: 0, requests: lease.requests, units: lease.cost, meta } };
		}
		const lease = this.createLease(`${admissionId}:lease`, keyId,
			extraRequests === null ? null : requests + extraRequests, grantCost, windows, expiresAt, false);
		return { ok: true, lease: { id: lease.id, expiresAt, requests: lease.requests, units: lease.cost, meta } };
	}

	/** Returns leases an isolate no longer admits from; their unused allowance becomes available. */
	async returnLeases(workspaceId: string, returns: LeaseReturn[]): Promise<void> {
		this.bind(workspaceId);
		this.applyReturns(returns);
	}

	/** One admission from `leaseId` failed or was not billed: release its request slot. Idempotent. */
	async release(workspaceId: string, leaseId: string, admissionId: string): Promise<void> {
		this.bind(workspaceId);
		const lease = this.leases.get(leaseId);
		if (!lease || typeof admissionId !== "string") return;
		lease.released.add(admissionId);
		this.settleIfDone(lease);
	}

	/**
	 * Adds the spend of successful requests. Idempotent on `billingRequestId`. Returns the keys
	 * whose isolates should hand back their slices because a cap is contended.
	 */
	async record(workspaceId: string, entries: SpendRecordEntry | SpendRecordEntry[]): Promise<SpendRecordResult> {
		this.bind(workspaceId);
		const now = Date.now();
		const list = (Array.isArray(entries) ? entries : [entries]).slice(0, 100);
		let duplicates = 0;
		const drainKeyIds = new Set<string>();
		for (const entry of list) {
			if (!this.recordOne(entry, now)) duplicates += 1;
			if (entry && this.draining(entry.keyId, now)) drainKeyIds.add(entry.keyId);
		}
		if (this.seed && this.unpersistedCount() >= SPEND_LEASE.maxExcludedRequestIds) this.reseedInBackground();
		return { duplicates, drainKeyIds: [...drainKeyIds] };
	}

	private recordOne(entry: SpendRecordEntry, now: number): boolean {
		if (!entry || typeof entry.billingRequestId !== "string" || !entry.billingRequestId ||
			typeof entry.keyId !== "string" || !entry.keyId) {
			console.warn("spend_limit_invalid_record", { workspaceId: this.workspaceId });
			return false;
		}
		if (this.seen.has(entry.billingRequestId) || this.pending.has(entry.billingRequestId)) return false;
		this.seen.add(entry.billingRequestId);
		if (this.seen.size > MAX_SEEN_IDS) {
			const oldest = this.seen.values().next();
			if (!oldest.done) this.seen.delete(oldest.value);
		}
		const cost = nonNegative(entry.costNanos);
		const requests = nonNegative(entry.requests);
		const at = Number.isFinite(entry.occurredAtMs) ? Number(entry.occurredAtMs) : now;
		this.pending.set(entry.billingRequestId, {
			billingRequestId: entry.billingRequestId,
			requestId: typeof entry.requestId === "string" && entry.requestId ? entry.requestId : entry.billingRequestId,
			keyId: entry.keyId,
			cost,
			requests,
			at,
			recordedAt: now,
			persisted: false,
		});
		const lease = entry.leaseId ? this.leases.get(entry.leaseId) : undefined;
		if (lease && lease.keyId === entry.keyId) {
			lease.successes += requests;
			lease.consumed += cost;
			this.settleIfDone(lease);
		}
		if (requests > 0) {
			const perRequest = cost / requests;
			const key = this.keys.get(entry.keyId);
			if (key) key.avgCost = key.avgCost ? key.avgCost * 0.9 + perRequest * 0.1 : perRequest;
			this.workspaceAvgCost = this.workspaceAvgCost ? this.workspaceAvgCost * 0.9 + perRequest * 0.1 : perRequest;
		}
		return true;
	}

	/** Reads seed data. Overridden in tests. */
	protected async loadSeed(workspaceId: string, keyIds: string[], excludeRequestIds: string[]): Promise<SpendLimitSeed> {
		this.supabase ??= createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: { autoRefreshToken: false, persistSession: false },
		});
		const { data, error } = await this.supabase.rpc("gateway_spend_limit_seed", {
			p_workspace_id: workspaceId,
			p_key_ids: keyIds,
			p_exclude_request_ids: excludeRequestIds,
		});
		if (error) throw new Error(`spend_limit_seed_failed:${error.message ?? "unknown"}`);
		return data as SpendLimitSeed;
	}

	private bind(workspaceId: string): void {
		if (typeof workspaceId !== "string" || !workspaceId) throw new Error("spend_limit_workspace_required");
		if (this.workspaceId && this.workspaceId !== workspaceId) throw new Error("spend_limit_workspace_mismatch");
		this.workspaceId = workspaceId;
	}

	/**
	 * A seed covering this key, from the current UTC day, that is not too old. A seed reporting the
	 * previous day is accepted only if it was read after midnight (Postgres clock slightly behind).
	 */
	private isFresh(keyId: string, now = Date.now()): boolean {
		if (this.seed === null || !this.keys.has(keyId) || now - this.seed.at > SPEND_LEASE.maxSeedAgeMs) return false;
		const today = windowStarts(now).daily;
		return this.seed.windows.daily >= today ||
			(this.seed.at >= today && now - today <= SPEND_LEASE.midnightToleranceMs);
	}

	private async ensureFresh(keyId: string): Promise<void> {
		if (!this.isFresh(keyId)) {
			// First use, a new UTC day, a new key, or a seed that could not be refreshed in the background.
			await this.reseed(keyId);
			if (!this.isFresh(keyId)) throw new Error("spend_limit_seed_unavailable");
			return;
		}
		if (Date.now() - this.seed!.at > SPEND_LEASE.reseedMs) this.reseedInBackground();
	}

	private reseedInBackground(): void {
		if (this.seeding) return;
		this.reseed(null).catch((error) => {
			console.warn("spend_limit_reseed_failed", { error: error instanceof Error ? error.message : String(error) });
		});
	}

	private async reseed(extraKeyId: string | null): Promise<void> {
		while (this.seeding) {
			await this.seeding.catch(() => undefined);
			if (extraKeyId === null || this.isFresh(extraKeyId)) return;
		}
		const run = this.runSeed(extraKeyId);
		this.seeding = run;
		try {
			await run;
		} finally {
			if (this.seeding === run) this.seeding = null;
		}
	}

	private async runSeed(extraKeyId: string | null): Promise<void> {
		const workspaceId = this.workspaceId!;
		// Keys idle for a while are forgotten and seeded again on their next request.
		const activeSince = Date.now() - SPEND_LEASE.keyIdleMs;
		for (const [keyId, key] of this.keys) if (key.lastUsedAt < activeSince && keyId !== extraKeyId) this.keys.delete(keyId);
		const keyIds = [...new Set([...this.keys.keys(), ...(extraKeyId ? [extraKeyId] : [])])];
		// Exclude recorded spend whose row may not be visible yet; it is counted from memory.
		// Spend already confirmed persisted is not excluded: the seed counts it, so it is dropped.
		const unpersisted = [...this.pending.values()].filter((entry) => !entry.persisted)
			.sort((left, right) => right.recordedAt - left.recordedAt);
		if (unpersisted.length > SPEND_LEASE.maxExcludedRequestIds) {
			// Should not happen with a reseed per minute; the oldest are most likely persisted already.
			console.warn("spend_limit_exclusion_overflow", { workspaceId, dropped: unpersisted.length - SPEND_LEASE.maxExcludedRequestIds });
			for (const entry of unpersisted.slice(SPEND_LEASE.maxExcludedRequestIds)) this.pending.delete(entry.billingRequestId);
		}
		const excluded = unpersisted.slice(0, SPEND_LEASE.maxExcludedRequestIds);
		const exclude = [...new Set(excluded.map((entry) => entry.requestId))];
		const persistedBefore = [...this.pending.values()].filter((entry) => entry.persisted);
		const chunks: string[][] = [];
		for (let index = 0; index < Math.max(1, keyIds.length); index += SPEND_LEASE.maxKeysPerSeed) {
			chunks.push(keyIds.slice(index, index + SPEND_LEASE.maxKeysPerSeed));
		}
		for (const chunk of chunks) {
			const seed = await this.loadSeed(workspaceId, chunk, exclude);
			this.applySeed(seed, chunk, persistedBefore);
		}
		const now = Date.now();
		for (const entry of this.pending.values()) {
			if (!entry.persisted && now - entry.recordedAt > SPEND_LEASE.pendingTtlMs) this.pending.delete(entry.billingRequestId);
		}
	}

	private applySeed(seed: SpendLimitSeed, chunk: string[], persistedBefore: Pending[]): void {
		const parse = (value: string) => {
			const ms = Date.parse(value);
			if (!Number.isFinite(ms)) throw new Error("spend_limit_seed_invalid");
			return ms;
		};
		if (!seed || !Array.isArray(seed.keys)) throw new Error("spend_limit_seed_invalid");
		const windows = { daily: parse(seed.day_start), weekly: parse(seed.week_start), monthly: parse(seed.month_start) };
		const returned = new Set<string>();
		for (const row of seed.keys) {
			returned.add(row.key_id);
			const limits = {} as Record<KeyWindow, Usage>;
			const base = {} as Record<KeyWindow, Usage>;
			for (const window of KEY_WINDOWS) {
				limits[window] = { requests: nonNegative(row.limits?.[window]?.requests), cost: nonNegative(row.limits?.[window]?.cost_nanos) };
				base[window] = row.used
					? { requests: nonNegative(row.used[window]?.requests), cost: nonNegative(row.used[window]?.cost_nanos) }
					: { ...ZERO };
			}
			const previous = this.keys.get(row.key_id);
			const monthly = base.monthly;
			this.keys.set(row.key_id, {
				lastUsedAt: previous?.lastUsedAt ?? Date.now(),
				found: true,
				softBlocked: row.soft_blocked === true,
				limited: row.limited === true,
				limits,
				base,
				avgCost: previous?.avgCost || (monthly.requests > 0 ? monthly.cost / monthly.requests : 0),
			});
		}
		for (const keyId of chunk) {
			if (returned.has(keyId)) continue;
			// Not a key of this workspace: authentication rejects it, nothing to enforce here.
			this.keys.set(keyId, { lastUsedAt: this.keys.get(keyId)?.lastUsedAt ?? Date.now(), found: false, softBlocked: false, limited: false,
				limits: { daily: { ...ZERO }, weekly: { ...ZERO }, monthly: { ...ZERO } },
				base: { daily: { ...ZERO }, weekly: { ...ZERO }, monthly: { ...ZERO } }, avgCost: 0 });
		}
		this.budgets = (seed.budget_status?.budgets ?? []).map((budget) => ({
			id: String(budget.id),
			interval: budget.interval,
			limit: nonNegative(budget.limit_nanos),
			statusUsage: nonNegative(budget.usage_nanos),
			windowStart: budget.window_start ? parse(budget.window_start) : null,
			resetAt: budget.reset_at ?? null,
		})).filter((budget) => budget.limit > 0);
		if (!this.workspaceAvgCost) {
			const averages = [...this.keys.values()].map((key) => key.avgCost).filter((value) => value > 0);
			if (averages.length) this.workspaceAvgCost = averages.reduce((sum, value) => sum + value, 0) / averages.length;
		}
		const chunkKeys = new Set(chunk);
		for (const entry of persistedBefore) {
			// Counted by this seed: stop tracking it separately.
			if (chunkKeys.has(entry.keyId) || !this.keys.has(entry.keyId)) this.pending.delete(entry.billingRequestId);
		}
		const found = new Set((seed.excluded_rows ?? []).map((row) => row.request_id));
		for (const entry of this.pending.values()) {
			if (found.has(entry.requestId)) entry.persisted = true;
		}
		this.seed = { windows, at: Date.now() };
	}

	private keyUsage(keyId: string, window: KeyWindow, windows: WindowStarts): Usage {
		const base = this.keys.get(keyId)?.base[window] ?? ZERO;
		let requests = base.requests;
		let cost = base.cost;
		for (const entry of this.pending.values()) {
			if (entry.keyId === keyId && entry.at >= windows[window]) {
				requests += entry.requests;
				cost += entry.cost;
			}
		}
		return { requests, cost };
	}

	private budgetUsage(budget: BudgetState): number {
		let usage = budget.statusUsage;
		for (const entry of this.pending.values()) {
			if (!entry.persisted && (budget.windowStart === null || entry.at >= budget.windowStart)) usage += entry.cost;
		}
		return usage;
	}

	private holdOf(lease: Lease): Usage {
		return {
			requests: lease.requests === null ? 0 : Math.max(0, lease.requests - lease.successes - lease.released.size),
			cost: lease.cost === null ? 0 : Math.max(0, lease.cost - lease.consumed),
		};
	}

	private alive(lease: Lease, now = Date.now()): boolean {
		return now <= lease.holdUntil;
	}

	private keyHolds(keyId: string, window: KeyWindow, windows: WindowStarts): Usage {
		const total = { requests: 0, cost: 0 };
		for (const lease of this.leases.values()) {
			if (lease.keyId !== keyId || lease.starts[window] !== windows[window] || !this.alive(lease)) continue;
			const hold = this.holdOf(lease);
			total.requests += hold.requests;
			total.cost += hold.cost;
		}
		return total;
	}

	private budgetHolds(budget: BudgetState): number {
		let total = 0;
		for (const lease of this.leases.values()) {
			if (!this.alive(lease)) continue;
			if (budget.interval !== "lifetime" && lease.starts[budget.interval] !== budget.windowStart) continue;
			total += this.holdOf(lease).cost;
		}
		return total;
	}

	private buckets(keyId: string, key: KeyState, windows: WindowStarts): GateCheck["buckets"] {
		if (!key.limited) return null;
		const bucket = (window: KeyWindow) => {
			const usage = this.keyUsage(keyId, window, windows);
			return {
				windowStart: iso(windows[window]),
				requestsUsed: usage.requests,
				requestsLimit: key.limits[window].requests,
				costUsedNanos: usage.cost,
				costLimitNanos: key.limits[window].cost,
			};
		};
		return { daily: bucket("daily"), weekly: bucket("weekly"), monthly: bucket("monthly") };
	}

	/** Same precedence and reasons as the request-context key-limit check. */
	private keyDenial(keyId: string, key: KeyState, windows: WindowStarts, now: number): SpendDenial | null {
		if (!key.found) return null;
		const nowIso = iso(now);
		if (key.softBlocked) {
			return { contended: false, gate: { ok: false, reason: "key_limit_soft_blocked", resetAt: null, now: nowIso,
				limitWindow: null, limitMetric: "soft_blocked", currentValue: null, limitValue: null, buckets: this.buckets(keyId, key, windows) } };
		}
		if (!key.limited) return null;
		const checks: Array<[KeyWindow, "requests" | "cost"]> = [
			["daily", "requests"], ["weekly", "requests"], ["monthly", "requests"],
			["daily", "cost"], ["weekly", "cost"], ["monthly", "cost"],
		];
		const deny = (window: KeyWindow, metric: "requests" | "cost", current: number, contended: boolean): SpendDenial => ({
			contended,
			gate: {
				ok: false,
				reason: `${window}_${metric === "requests" ? "request" : "cost"}_limit_reached`,
				resetAt: iso(windowEnd(window, windows[window])),
				now: nowIso,
				limitWindow: window,
				limitMetric: metric,
				currentValue: current,
				limitValue: key.limits[window][metric],
				buckets: this.buckets(keyId, key, windows),
			},
		});
		for (const [window, metric] of checks) {
			const limit = key.limits[window][metric];
			if (limit <= 0) continue;
			const used = this.keyUsage(keyId, window, windows)[metric];
			if (used >= limit) return deny(window, metric, used, false);
		}
		for (const [window, metric] of checks) {
			const limit = key.limits[window][metric];
			if (limit <= 0) continue;
			const used = this.keyUsage(keyId, window, windows)[metric];
			const held = this.keyHolds(keyId, window, windows)[metric];
			if (metric === "requests" ? used + held + 1 > limit : used + held >= limit) return deny(window, metric, used, true);
		}
		return null;
	}

	/** Same reasons and shape as gateway_workspace_budget_status. */
	private budgetDenial(windows: WindowStarts, now: number): SpendDenial | null {
		if (!this.budgets.length) return null;
		const order: Record<BudgetInterval, number> = { daily: 1, weekly: 2, monthly: 3, lifetime: 4 };
		const states = this.budgets
			.filter((budget) => budget.interval === "lifetime" || budget.windowStart === windows[budget.interval] || budget.windowStart === null)
			.map((budget) => ({ budget, usage: this.budgetUsage(budget), held: this.budgetHolds(budget) }))
			.sort((left, right) => order[left.budget.interval] - order[right.budget.interval]);
		const list = states.map(({ budget, usage }) => ({
			id: budget.id,
			interval: budget.interval,
			limitNanos: budget.limit,
			usageNanos: usage,
			remainingNanos: Math.max(budget.limit - usage, 0),
			projectedUsageNanos: usage,
			exceeded: usage >= budget.limit,
			windowStart: budget.windowStart === null ? null : iso(budget.windowStart),
			resetAt: budget.resetAt,
		}));
		const pick = states.find((state) => state.usage >= state.budget.limit) ??
			states.find((state) => state.usage + state.held >= state.budget.limit);
		if (!pick) return null;
		return {
			contended: pick.usage < pick.budget.limit,
			gate: {
				ok: false,
				reason: `workspace_${pick.budget.interval}_cost_budget_reached`,
				resetAt: pick.budget.resetAt,
				now: iso(now),
				limitWindow: pick.budget.interval,
				limitMetric: "cost",
				currentValue: pick.usage,
				limitValue: pick.budget.limit,
				budgets: list,
			},
		};
	}

	private createLease(id: string, keyId: string, requests: number | null, cost: number | null,
		windows: WindowStarts, expiresAt: number, closed: boolean): Lease {
		const lease: Lease = { id, keyId, requests, cost, successes: 0, consumed: 0, released: new Set(),
			starts: { ...windows }, expiresAt, closed,
			holdUntil: closed ? Date.now() + SPEND_LEASE.inFlightHoldMs : expiresAt + SPEND_LEASE.expiryGraceMs,
			persisted: false };
		this.leases.set(id, lease);
		// Only open slices are persisted: after a restart they stay held until they expire. The
		// in-flight hold of a single admission is memory-only (the request-context check this
		// replaces never counted in-flight requests either).
		if (!closed && (requests !== null || cost !== null)) {
			this.ctx.storage.sql.exec("INSERT OR REPLACE INTO leases VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				id, keyId, requests, cost, windows.daily, windows.weekly, windows.monthly, expiresAt);
			lease.persisted = true;
		}
		return lease;
	}

	private applyReturns(returns: LeaseReturn[]): void {
		for (const returned of Array.isArray(returns) ? returns.slice(0, 64) : []) {
			const lease = returned && typeof returned.id === "string" ? this.leases.get(returned.id) : undefined;
			if (!lease || lease.closed) continue;
			lease.closed = true;
			lease.holdUntil = Date.now() + SPEND_LEASE.inFlightHoldMs;
			if (lease.persisted) {
				this.ctx.storage.sql.exec("DELETE FROM leases WHERE id = ?", lease.id);
				lease.persisted = false;
			}
			// Hold only what was used and is not yet recorded (successes or requests still running).
			if (lease.requests !== null) lease.requests = Math.min(lease.requests, nonNegative(returned.usedRequests));
			if (lease.cost !== null) lease.cost = nonNegative(returned.usedUnits);
			this.settleIfDone(lease);
		}
	}

	private settleIfDone(lease: Lease): void {
		if (!lease.closed) return;
		const hold = this.holdOf(lease);
		if (hold.requests > 0 || hold.cost > 0) return;
		this.forget(lease);
	}

	private forget(lease: Lease): void {
		this.leases.delete(lease.id);
		if (lease.persisted) this.ctx.storage.sql.exec("DELETE FROM leases WHERE id = ?", lease.id);
	}

	private sweep(now: number): void {
		if (now < this.sweepAt) return;
		this.sweepAt = now + 10_000;
		for (const lease of this.leases.values()) {
			if (!this.alive(lease, now)) this.forget(lease);
		}
	}

	private draining(keyId: string, now: number): boolean {
		return (this.drainUntil.get(keyId) ?? 0) > now || (this.drainUntil.get("*") ?? 0) > now;
	}

	private unpersistedCount(): number {
		let count = 0;
		for (const entry of this.pending.values()) if (!entry.persisted) count += 1;
		return count;
	}
}
