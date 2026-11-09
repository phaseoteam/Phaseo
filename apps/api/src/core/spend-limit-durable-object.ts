// Purpose: Coordinate API-key spend/request caps, department budgets, blocking spend guardrails and
//          workspace budgets for one workspace. A department budget counts the cost of every key the
//          seed lists for the department (private.department_budget_key_departments), like a shared
//          key cost limit. A spend guardrail counter (private.spend_guardrail_usage) is counted the
//          same way over its keys: every key an assignment covers when shared, one key when each_key.
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
import { createClient, type GatewaySupabaseClient } from "@/runtime/supabase-client";
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
	/** Absent from seeds written before department budgets could block. */
	department_budgets?: Array<{
		id: string;
		department_id: string;
		department_name: string | null;
		interval: KeyWindow;
		limit_nanos: number;
		/** Successful gateway_requests cost of `key_ids` in the window, less excluded request ids. */
		usage_nanos: number;
		window_start: string;
		reset_at: string | null;
		/** Every key whose cost counts toward the department. */
		key_ids: string[];
	}> | null;
	/** Blocking spend guardrail counters. Absent from seeds written before spend guardrails. */
	guardrail_budgets?: Array<{
		guardrail_id: string;
		guardrail_name: string | null;
		counting: "shared" | "each_key";
		/** 'department:<id>', 'member:<id>', 'key:<id>' or 'workspace:' (one per assignment), or 'key:<id>' for each_key. */
		counter: string;
		interval: KeyWindow;
		limit_nanos: number;
		usage_nanos: number;
		window_start: string;
		reset_at: string | null;
		key_ids: string[];
	}> | null;
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

/**
 * A department budget or a blocking spend guardrail counter: counted like a key cost limit, over
 * every key of the department or counter.
 */
type DepartmentBudgetState = {
	id: string;
	source: "department" | "guardrail";
	/** The department, or the guardrail for guardrail counters. */
	departmentId: string;
	departmentName: string | null;
	counting?: "shared" | "each_key";
	interval: KeyWindow;
	limit: number;
	/** Seeded usage (excluding recorded spend not yet in the seed, as for keys). */
	base: number;
	windowStart: number;
	resetAt: string | null;
	keyIds: Set<string>;
};

type Pending = {
	billingRequestId: string;
	requestId: string;
	keyId: string;
	cost: number;
	requests: number;
	at: number;
	recordedAt: number;
	/**
	 * Its audit row exists (the seed returned it among the excluded rows), so the next seed does not
	 * exclude it. That says nothing about whether a published seed counts its spend: the entry is
	 * counted from memory until a seed that did not exclude its ids is published (handoff), then dropped.
	 */
	persisted: boolean;
	/**
	 * A stream charged at drain checkpoints: `cost` is its charged total so far, raised by each
	 * checkpoint and set by the final record. It follows the ordinary pending lifecycle; once it
	 * expires, the seed counts the request's charge row (no longer excluded) instead.
	 */
	stepped?: { final: boolean };
	/**
	 * Opened by a record other than the request's first checkpoint (checkpoint 1 was lost, or a
	 * one-off charge settled as a final): the seed in use may already count its charge row. It
	 * counts from memory at once all the same (a brief over-count, never an under-count), and a
	 * seed that excludes its ids is loaded at once.
	 */
	awaitingSeed?: boolean;
	/**
	 * Being handed to the database: it expired, its period ended, or it did not fit in the exclusion
	 * list. The next seed does not exclude it, and it keeps counting from memory (the published seed
	 * still excludes it) until that seed is published, which drops it in the same step. A failed load
	 * leaves it counting. Later records for it are ignored.
	 */
	retiring?: "expired" | "period_ended" | "overflow";
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
/**
 * The seed contract this coordinator speaks (gateway_spend_limit_seed p_contract_version, DEFAULT
 * 1). Version 2: a held request is excluded by both its request and billing ids, and the coordinator
 * keeps counting it after the seed returns its audit row (until a seed that does not exclude it), so
 * the seed may leave that audit row out of workspace spend too. The previous coordinator (version 1,
 * still serving between the migrations and the Worker deploy) stops counting an entry once its audit
 * row is returned, so the SQL keeps the version-1 behaviour for it.
 */
export const SPEND_LIMIT_SEED_CONTRACT_VERSION = 2;
/** Loads per seed when held entries go stale, or new ones are recorded, while it loads. */
const MAX_SEED_ATTEMPTS = 3;

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
	private departmentBudgets: DepartmentBudgetState[] = [];
	private workspaceAvgCost = 0;
	private readonly pending = new Map<string, Pending>();
	private readonly seen = new Set<string>();
	private readonly leases = new Map<string, Lease>();
	private readonly drainUntil = new Map<string, number>();
	private sweepAt = 0;
	private supabase: GatewaySupabaseClient | null = null;

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

		const departments = this.departmentsOf(keyId, windows);
		const denial = this.keyDenial(keyId, key, windows, now) ?? this.departmentDenial(departments, now) ??
			this.budgetDenial(windows, now);
		if (denial) {
			if (!requests) return { ok: false, denial: null };
			// Ask isolates holding slices of this allowance to return them early. Workspace and
			// department budgets and shared spend guardrails are shared by many keys, so every key drains.
			const shared = denial.gate.reason?.startsWith("workspace_") || denial.gate.reason?.startsWith("department_") ||
				(denial.gate.reason?.startsWith("guardrail_") && denial.gate.guardrailCounting !== "each_key");
			if (denial.contended) this.drainUntil.set(shared ? "*" : keyId, now + SPEND_LEASE.drainMs);
			return { ok: false, denial };
		}

		const meta: SpendLeaseMeta = { keyId, buckets: this.buckets(keyId, key, windows), unlimited: false };
		// Leases never outlive the seeded UTC day, so their holds apply to the windows they used.
		const dayEnd = windows.daily + DAY_MS - SPEND_LEASE.windowSkewMs;
		const requestLimits = KEY_WINDOWS.filter((window) => key.limits[window].requests > 0);
		const costLimited = KEY_WINDOWS.some((window) => key.limits[window].cost > 0) || this.budgets.length > 0 ||
			departments.length > 0;
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
			// Slices of every key of a department count against its budget (departmentHolds).
			for (const budget of departments) {
				const used = this.departmentUsage(budget) + this.departmentHolds(budget);
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
		if (this.seed && this.unpersistedIdCount() >= SPEND_LEASE.maxExcludedRequestIds) this.reseedInBackground();
		return { duplicates, drainKeyIds: [...drainKeyIds] };
	}

	private recordOne(entry: SpendRecordEntry, now: number): boolean {
		if (!entry || typeof entry.billingRequestId !== "string" || !entry.billingRequestId ||
			typeof entry.keyId !== "string" || !entry.keyId) {
			console.warn("spend_limit_invalid_record", { workspaceId: this.workspaceId });
			return false;
		}
		const existing = this.pending.get(entry.billingRequestId);
		const replace = entry.replace === true;
		const final = replace && entry.final === true;
		let awaitingSeed = false;
		if (replace) {
			if (!existing) {
				// A record for an entry this coordinator held before (expired, retired at a period end,
				// or settled) is ignored: its charge row is no longer excluded, and the seed counts it.
				if (this.seen.has(entry.billingRequestId)) return false;
				// Any other record opens the entry at its total: the first checkpoint, or a later one or
				// the final when checkpoint 1 never arrived (or was reordered after the final, which a
				// held final entry then ignores).
				awaitingSeed = !(entry.revision === 1 && !final);
			} else {
				if (!existing.stepped || existing.keyId !== entry.keyId || existing.stepped.final || existing.retiring) return false;
				// A checkpoint only raises the charged total (delivery can reorder checkpoints); the final
				// record sets it, lower or 0 included, and nothing changes it after that.
				const cost = final ? nonNegative(entry.costNanos) : Math.max(existing.cost, nonNegative(entry.costNanos));
				if (!final && cost === existing.cost) return false;
				// The final also sets how many successful requests it is (0 for a charged cancellation or a
				// failure): the request slot the checkpoints held is given back, the charged cost is kept.
				const requests = final ? nonNegative(entry.requests) : existing.requests;
				const lease = entry.leaseId ? this.leases.get(entry.leaseId) : undefined;
				if (lease && lease.keyId === entry.keyId) {
					lease.consumed = Math.max(0, lease.consumed + cost - existing.cost);
					lease.successes = Math.max(0, lease.successes + requests - existing.requests);
					this.settleIfDone(lease);
				}
				existing.requests = requests;
				existing.cost = cost;
				existing.recordedAt = now;
				existing.stepped = { final };
				return true;
			}
		}
		if (this.seen.has(entry.billingRequestId) || existing) return false;
		this.markSeen(entry.billingRequestId);
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
			...(replace ? { stepped: { final } } : {}),
			...(awaitingSeed ? { awaitingSeed: true } : {}),
		});
		if (awaitingSeed) this.reseedInBackground();
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

	private markSeen(billingRequestId: string): void {
		this.seen.add(billingRequestId);
		if (this.seen.size > MAX_SEEN_IDS) {
			const oldest = this.seen.values().next();
			if (!oldest.done) this.seen.delete(oldest.value);
		}
	}

	/**
	 * Before a seed's exclusions are built: entries past the pending TTL, and stepped entries whose
	 * day, week or month has ended since they opened, are marked retiring (later records for them are
	 * ignored). The seed being built does not exclude them, so it counts their spend (each debit at
	 * its own time); until it is published they keep counting from memory, in every window.
	 */
	private retireStaleEntries(now: number): void {
		for (const entry of this.pending.values()) {
			if (entry.retiring) continue;
			const stale = this.staleness(entry, now);
			if (!stale) continue;
			entry.retiring = stale;
			if (stale === "period_ended") this.markSeen(entry.billingRequestId);
		}
	}

	private staleness(entry: Pending, now: number): "expired" | "period_ended" | null {
		if (entry.persisted || entry.retiring) return null;
		if (now - entry.recordedAt > SPEND_LEASE.pendingTtlMs) return "expired";
		if (!entry.stepped) return null;
		const opened = windowStarts(entry.at);
		const current = windowStarts(now);
		return opened.daily !== current.daily || opened.weekly !== current.weekly || opened.monthly !== current.monthly
			? "period_ended"
			: null;
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
			p_contract_version: SPEND_LIMIT_SEED_CONTRACT_VERSION,
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
		// An entry opened while this seed loaded is not excluded by it yet.
		if ([...this.pending.values()].some((entry) => entry.awaitingSeed)) this.reseedInBackground();
	}

	private async runSeed(extraKeyId: string | null): Promise<void> {
		const workspaceId = this.workspaceId!;
		// Keys idle for a while are forgotten and seeded again on their next request.
		const activeSince = Date.now() - SPEND_LEASE.keyIdleMs;
		for (const [keyId, key] of this.keys) if (key.lastUsedAt < activeSince && keyId !== extraKeyId) this.keys.delete(keyId);
		const keyIds = [...new Set([...this.keys.keys(), ...(extraKeyId ? [extraKeyId] : [])])];
		const chunks: string[][] = [];
		for (let index = 0; index < Math.max(1, keyIds.length); index += SPEND_LEASE.maxKeysPerSeed) {
			chunks.push(keyIds.slice(index, index + SPEND_LEASE.maxKeysPerSeed));
		}
		for (let attempt = 1; ; attempt += 1) {
			// Exclude recorded spend whose row may not be visible yet; it is counted from memory.
			// Spend already confirmed persisted is not excluded: the seed counts it, so it is dropped.
			this.retireStaleEntries(Date.now());
			const excluded = this.excludeFromSeed(workspaceId);
			const exclude = excluded.flatMap((entry) => entry.ids);
			// Held entries this seed does not exclude: it counts their spend, so they are handed off
			// when it is published (audit row found, or retiring).
			const includedBySeed = [...this.pending.values()].filter((entry) => entry.persisted || entry.retiring);
			const heldAtStart = new Set(this.pending.keys());
			const seeds: SpendLimitSeed[] = [];
			for (const chunk of chunks) seeds.push(await this.loadSeed(workspaceId, chunk, exclude));
			// An entry this seed excluded that expired or reached a period end while it loaded would be
			// counted by neither the seed nor memory once retired. It stays held until a seed that does
			// not exclude it is published: load again now, or keep it for the next seed to retire.
			// An entry recorded while it loaded is not excluded, but the seed may already count its row:
			// load again with it excluded, rather than count it twice. After the last attempt both are
			// kept (over-counted, never lost) until the next seed.
			const now = Date.now();
			const stale = excluded.some(({ entry }) => this.staleness(entry, now));
			const addedWhileLoading = [...this.pending.keys()].some((id) => !heldAtStart.has(id));
			if (attempt < MAX_SEED_ATTEMPTS && (stale || addedWhileLoading)) continue;
			chunks.forEach((chunk, index) => this.applySeed(seeds[index], chunk, includedBySeed));
			for (const { entry } of excluded) delete entry.awaitingSeed;
			return;
		}
	}

	/**
	 * Contract with gateway_spend_limit_seed: it skips gateway_requests rows whose request_id is
	 * listed and gateway_request_charges rows whose request_id (the billing id) is listed; that
	 * spend is counted from memory instead. Every entry lists both ids: an ordinary request's charge
	 * row (under its billing id) lands before its audit row, and a stepped request's charge row is
	 * updated at each checkpoint. The cap (the SQL rejects more) counts ids, not entries.
	 * Entries past it (newest first; the oldest are most likely persisted already) are handed to the
	 * seed instead, which counts their rows.
	 */
	private excludeFromSeed(workspaceId: string): Array<{ entry: Pending; ids: string[] }> {
		const unpersisted = [...this.pending.values()].filter((entry) => !entry.persisted && !entry.retiring)
			.sort((left, right) => right.recordedAt - left.recordedAt);
		const excluded: Array<{ entry: Pending; ids: string[] }> = [];
		const excludedIds = new Set<string>();
		let dropped = 0;
		for (const entry of unpersisted) {
			const ids = [...new Set([entry.requestId, entry.billingRequestId])].filter((id) => !excludedIds.has(id));
			if (excludedIds.size + ids.length > SPEND_LEASE.maxExcludedRequestIds) {
				// Handed to this seed like an expired entry: it counts from memory until the seed is published.
				entry.retiring = "overflow";
				dropped += 1;
				continue;
			}
			for (const id of ids) excludedIds.add(id);
			excluded.push({ entry, ids });
		}
		if (dropped) console.warn("spend_limit_exclusion_overflow", { workspaceId, dropped });
		return excluded;
	}

	private applySeed(seed: SpendLimitSeed, chunk: string[], includedBySeed: Pending[]): void {
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
		// Older seeds have no department budgets: nothing to enforce for departments.
		this.departmentBudgets = (Array.isArray(seed.department_budgets) ? seed.department_budgets : [])
			.filter((budget) => KEY_WINDOWS.includes(budget?.interval))
			.map((budget): DepartmentBudgetState => ({
				id: String(budget.id),
				source: "department",
				departmentId: String(budget.department_id),
				departmentName: typeof budget.department_name === "string" ? budget.department_name : null,
				interval: budget.interval,
				limit: nonNegative(budget.limit_nanos),
				base: nonNegative(budget.usage_nanos),
				windowStart: parse(budget.window_start),
				resetAt: budget.reset_at ?? null,
				keyIds: new Set((Array.isArray(budget.key_ids) ? budget.key_ids : []).map(String)),
			}))
			.filter((budget) => budget.limit > 0);
		// Blocking spend guardrail counters are enforced like department budgets.
		for (const counter of Array.isArray(seed.guardrail_budgets) ? seed.guardrail_budgets : []) {
			if (!KEY_WINDOWS.includes(counter?.interval)) continue;
			const limit = nonNegative(counter.limit_nanos);
			if (limit <= 0) continue;
			this.departmentBudgets.push({
				id: `guardrail:${counter.guardrail_id}:${counter.counter}`,
				source: "guardrail",
				departmentId: String(counter.guardrail_id),
				departmentName: typeof counter.guardrail_name === "string" ? counter.guardrail_name : null,
				counting: counter.counting === "each_key" ? "each_key" : "shared",
				interval: counter.interval,
				limit,
				base: nonNegative(counter.usage_nanos),
				windowStart: parse(counter.window_start),
				resetAt: counter.reset_at ?? null,
				keyIds: new Set((Array.isArray(counter.key_ids) ? counter.key_ids : []).map(String)),
			});
		}
		if (!this.workspaceAvgCost) {
			const averages = [...this.keys.values()].map((key) => key.avgCost).filter((value) => value > 0);
			if (averages.length) this.workspaceAvgCost = averages.reduce((sum, value) => sum + value, 0) / averages.length;
		}
		const chunkKeys = new Set(chunk);
		for (const entry of includedBySeed) {
			// Not excluded from this seed, which counts its spend: stop tracking it separately.
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
			if (entry.keyId === keyId && (entry.retiring || entry.at >= windows[window])) {
				requests += entry.requests;
				cost += entry.cost;
			}
		}
		return { requests, cost };
	}

	private budgetUsage(budget: BudgetState): number {
		let usage = budget.statusUsage;
		for (const entry of this.pending.values()) {
			// Every held entry counts until a published seed counts it (a brief over-count is allowed,
			// an under-count is not).
			if (budget.windowStart === null || entry.retiring || entry.at >= budget.windowStart) usage += entry.cost;
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

	/** Department budgets `keyId` counts toward in the seeded windows. */
	private departmentsOf(keyId: string, windows: WindowStarts): DepartmentBudgetState[] {
		return this.departmentBudgets.filter((budget) => budget.keyIds.has(keyId) && budget.windowStart === windows[budget.interval]);
	}

	/** Same accounting as keyUsage, over every key of the department. */
	private departmentUsage(budget: DepartmentBudgetState): number {
		let usage = budget.base;
		for (const entry of this.pending.values()) {
			if (budget.keyIds.has(entry.keyId) && (entry.retiring || entry.at >= budget.windowStart)) usage += entry.cost;
		}
		return usage;
	}

	private departmentHolds(budget: DepartmentBudgetState): number {
		let total = 0;
		for (const lease of this.leases.values()) {
			if (!budget.keyIds.has(lease.keyId) || lease.starts[budget.interval] !== budget.windowStart || !this.alive(lease)) continue;
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

	/**
	 * A department budget the key counts toward is used up (or its remainder is held by slices),
	 * with the same pre-check semantics as workspace budgets: admit while usage is below the limit.
	 */
	private departmentDenial(departments: DepartmentBudgetState[], now: number): SpendDenial | null {
		if (!departments.length) return null;
		const order: Record<KeyWindow, number> = { daily: 1, weekly: 2, monthly: 3 };
		const states = departments
			.map((budget) => ({ budget, usage: this.departmentUsage(budget), held: this.departmentHolds(budget) }))
			.sort((left, right) => order[left.budget.interval] - order[right.budget.interval] ||
				(left.budget.departmentName ?? "").localeCompare(right.budget.departmentName ?? "") ||
				left.budget.departmentId.localeCompare(right.budget.departmentId));
		const pick = states.find((state) => state.usage >= state.budget.limit) ??
			states.find((state) => state.usage + state.held >= state.budget.limit);
		if (!pick) return null;
		const guardrail = pick.budget.source === "guardrail";
		return {
			contended: pick.usage < pick.budget.limit,
			gate: {
				ok: false,
				reason: guardrail
					? `guardrail_${pick.budget.interval}_spend_limit_reached`
					: `department_${pick.budget.interval}_cost_budget_reached`,
				resetAt: pick.budget.resetAt ?? iso(windowEnd(pick.budget.interval, pick.budget.windowStart)),
				now: iso(now),
				limitWindow: pick.budget.interval,
				limitMetric: "cost",
				currentValue: pick.usage,
				limitValue: pick.budget.limit,
				...(guardrail
					? { guardrailId: pick.budget.departmentId, guardrailName: pick.budget.departmentName, guardrailCounting: pick.budget.counting ?? "shared" }
					: { departmentId: pick.budget.departmentId, departmentName: pick.budget.departmentName }),
			},
		};
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

	/** Ids the next seed must exclude: each held entry needs its request id and its billing id. */
	private unpersistedIdCount(): number {
		let count = 0;
		for (const entry of this.pending.values()) {
			if (!entry.persisted && !entry.retiring) count += entry.requestId === entry.billingRequestId ? 1 : 2;
		}
		return count;
	}
}
