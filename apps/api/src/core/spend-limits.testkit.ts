// Shared by the spend-limit coordinator tests: a JavaScript model of gateway_spend_limit_seed and a
// coordinator that reads it. The PGlite contract tests pin the SQL itself.
import type { DatabaseSync } from "node:sqlite";
import { SpendLimitDurableObject, type SpendLimitSeed } from "./spend-limit-durable-object";
import { SPEND_LEASE } from "./spend-limits.shared";

export const WORKSPACE = "workspace-1";
export const KEY = "key-1";
export const DAY = 86_400_000;

export type Row = { requestId: string; keyId: string | null; success: boolean; cost: number; createdAt: number; billingId?: string };
export type KeyConfig = { workspaceId: string; softBlocked?: boolean; daily?: [number, number]; weekly?: [number, number]; monthly?: [number, number] };
export type Budget = { id: string; interval: "daily" | "weekly" | "monthly" | "lifetime"; limit: number; holds?: number };
export type DepartmentBudget = { id: string; departmentId: string; name: string; interval: "daily" | "weekly" | "monthly"; limit: number; keyIds: string[] };
export type GuardrailCounter = {
	guardrailId: string; name: string; counting: "shared" | "each_key"; counter: string;
	interval: "daily" | "weekly" | "monthly"; limit: number; keyIds: string[];
};

// A JavaScript model of gateway_spend_limit_seed (the PGlite contract test pins the SQL itself).
export class FakeDatabase {
	rows: Row[] = [];
	keys = new Map<string, KeyConfig>();
	budgets: Budget[] = [];
	departments: DepartmentBudget[] = [];
	/** Blocking spend guardrail counters (private.spend_guardrail_usage with action block). */
	guardrails: GuardrailCounter[] = [];
	/** Seeds as written before department budgets could block (no department_budgets field). */
	legacyShape = false;
	calls: Array<{ keyIds: string[]; exclude: string[] }> = [];
	/**
	 * Debit movements of charges (one per checkpoint, final or refund), each at its own time: counted
	 * unless the charge's billing id is excluded, or an audit row records it (billingId), which then
	 * counts it once instead.
	 */
	charges: Array<{ billingId: string; keyId: string; total: number; at: number }> = [];

	chargeCost(keyIds: string[] | null, start: number | null, exclude: string[]): { cost: number; requests: number } {
		const now = Date.now();
		const audited = new Set(this.rows.filter((row) => row.billingId && row.success && row.createdAt <= now).map((row) => row.billingId));
		const rows = this.charges.filter((row) => (keyIds === null || keyIds.includes(row.keyId)) && !exclude.includes(row.billingId) &&
			!audited.has(row.billingId) && (start === null || row.at >= start) && row.at <= now);
		// Charges are spend, not successful requests: requests come from successful request rows only.
		return { cost: rows.reduce((sum, row) => sum + row.total, 0), requests: 0 };
	}
	fail = false;
	/** Holds every seed read until resolved (a stalled Postgres call). */
	stall: Promise<void> | null = null;
	/** Run just before and just after each seed read (things that happen while a seed loads). */
	beforeRead: (() => Promise<void>) | null = null;
	afterRead: (() => Promise<void>) | null = null;

	static windows(now: number) {
		const date = new Date(now);
		const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
		const week = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
		const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
		return { daily: day, weekly: week, monthly: month };
	}

	usage(keyId: string, exclude: string[] = []) {
		const windows = FakeDatabase.windows(Date.now());
		const result = {} as Record<"daily" | "weekly" | "monthly", { requests: number; cost_nanos: number }>;
		for (const window of ["daily", "weekly", "monthly"] as const) {
			const rows = this.rows.filter((row) => row.keyId === keyId && row.success && row.createdAt >= windows[window] &&
				row.createdAt <= Date.now() && !exclude.includes(row.requestId));
			const charges = this.chargeCost([keyId], windows[window], exclude);
			result[window] = { requests: rows.length + charges.requests, cost_nanos: rows.reduce((sum, row) => sum + row.cost, 0) + charges.cost };
		}
		return result;
	}

	seed(workspaceId: string, keyIds: string[], exclude: string[]): SpendLimitSeed {
		this.calls.push({ keyIds: [...keyIds], exclude: [...exclude] });
		if (this.fail) throw new Error("database unavailable");
		// gateway_spend_limit_seed rejects more excluded ids than this.
		if (exclude.length > SPEND_LEASE.maxExcludedRequestIds) throw new Error("too_many_excluded_request_ids");
		const now = Date.now();
		const windows = FakeDatabase.windows(now);
		const iso = (ms: number) => new Date(ms).toISOString();
		const limit = (pair?: [number, number]) => ({ requests: pair?.[0] ?? null, cost_nanos: pair?.[1] ?? null });
		const keys = keyIds.flatMap((keyId) => {
			const key = this.keys.get(keyId);
			if (!key || key.workspaceId !== workspaceId) return [];
			const limited = [key.daily, key.weekly, key.monthly].some((pair) => pair && (pair[0] > 0 || pair[1] > 0));
			return [{
				key_id: keyId, active: true, soft_blocked: key.softBlocked === true, limited,
				limits: { daily: limit(key.daily), weekly: limit(key.weekly), monthly: limit(key.monthly) },
				used: limited ? this.usage(keyId, exclude) : null,
			}];
		});
		const budgets = this.budgets.map((budget) => {
			const start = budget.interval === "lifetime" ? null : windows[budget.interval];
			// Like the key buckets, less the spend the coordinator still counts from memory.
			const completed = this.rows.filter((row) => row.success && row.createdAt <= now && (start === null || row.createdAt >= start) &&
				!exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0) + this.chargeCost(null, start, exclude).cost;
			const end = budget.interval === "daily" ? start! + DAY : budget.interval === "weekly" ? start! + 7 * DAY : null;
			return {
				id: budget.id, interval: budget.interval, limit_nanos: budget.limit, usage_nanos: completed + (budget.holds ?? 0),
				window_start: start === null ? null : iso(start), reset_at: end === null ? null : iso(end),
			};
		});
		const department_budgets = this.departments.map((budget) => {
			const start = windows[budget.interval];
			const usage = this.rows.filter((row) => row.keyId !== null && budget.keyIds.includes(row.keyId) && row.success &&
				row.createdAt >= start && row.createdAt <= now && !exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0);
			const end = budget.interval === "daily" ? start + DAY : budget.interval === "weekly" ? start + 7 * DAY
				: Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);
			return {
				id: budget.id, department_id: budget.departmentId, department_name: budget.name, interval: budget.interval,
				limit_nanos: budget.limit, usage_nanos: usage, window_start: iso(start), reset_at: iso(end), key_ids: [...budget.keyIds],
			};
		});
		const guardrail_budgets = this.guardrails.map((counter) => {
			const start = windows[counter.interval];
			const usage = this.rows.filter((row) => row.keyId !== null && counter.keyIds.includes(row.keyId) && row.success &&
				row.createdAt >= start && row.createdAt <= now && !exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0) +
				this.chargeCost(counter.keyIds, start, exclude).cost;
			const end = counter.interval === "daily" ? start + DAY : counter.interval === "weekly" ? start + 7 * DAY
				: Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);
			return {
				guardrail_id: counter.guardrailId, guardrail_name: counter.name, counting: counter.counting, counter: counter.counter,
				interval: counter.interval, limit_nanos: counter.limit, usage_nanos: usage, window_start: iso(start), reset_at: iso(end),
				key_ids: [...counter.keyIds],
			};
		});
		return {
			now: iso(now), day_start: iso(windows.daily), week_start: iso(windows.weekly), month_start: iso(windows.monthly),
			keys,
			budget_status: { ok: true, budgets },
			...(this.legacyShape ? {} : { department_budgets, guardrail_budgets }),
			excluded_rows: this.rows.filter((row) => exclude.includes(row.requestId))
				.map((row) => ({ request_id: row.requestId, key_id: row.keyId, success: row.success, cost_nanos: row.cost, created_at: iso(row.createdAt) })),
		};
	}
}

/** A coordinator whose seed reads come from `database` (stalls, failures and read hooks included). */
export class TestSpendLimitDurableObject extends SpendLimitDurableObject {
	constructor(state: DurableObjectState, env: never, private readonly database: FakeDatabase) {
		super(state, env);
	}

	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<SpendLimitSeed> {
		await Promise.resolve();
		if (this.database.stall) await this.database.stall;
		if (this.database.beforeRead) await this.database.beforeRead();
		const seed = this.database.seed(workspaceId, keyIds, exclude);
		if (this.database.afterRead) await this.database.afterRead();
		return seed;
	}
}

/** Durable Object storage backed by an in-memory SQLite database. */
export function sqliteState(sqlite: DatabaseSync): DurableObjectState {
	return {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: {
			sql: {
				exec: (query: string, ...args: Array<string | number | null>) => {
					const statement = sqlite.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
}

export const tick = () => new Promise((resolve) => setImmediate(resolve));
