import { dispatchBackground, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";

// Budget alerts for the Phaseo mobile app, sent to owners and admins (and a key's creator for key
// limits) with the other workspace alerts:
//   * when the gateway first rejects a request because a workspace budget or an API key limit is
//     used up, record_spend_limit_reached records one "requests blocked" alert for that budget or
//     key limit and period. This runs in the background after the rejection is returned;
//   * every 15 minutes, sweep_spend_limit_warnings warns once per period at about 80%, from the
//     hourly usage rollup, with a forecast for weekly and monthly periods.
// Every worker that serves requests records the rejection, including the regional gateways
// where MOBILE_PUSH_ENABLED is off: the central job that sends pushes fans the alert out. Only
// the sweep is tied to that job.

// Department budget rejections (`department_<window>_cost_budget_reached`) are not recorded here:
// sweep_department_budget_alerts already sends their 100% alert to the same people.
const SPEND_LIMIT_REASON =
	/^(?:workspace_(daily|weekly|monthly|lifetime)_cost_budget_reached|(daily|weekly|monthly)_(?:request|cost)_limit_reached)$/;
// Each isolate tells the database at most once an hour per budget or key limit and period. The
// database keeps one alert per period and limit, so this only saves calls while a workspace
// keeps retrying.
const REMEMBER_MS = 60 * 60 * 1000;
const MAX_REMEMBERED = 1_000;
const remembered = new Map<string, number>();

function periodOf(window: string, now: Date): string {
	const day = now.toISOString().slice(0, 10);
	if (window === "daily") return day;
	if (window === "monthly") return day.slice(0, 7);
	if (window === "weekly") {
		const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
		return `week-${monday.toISOString().slice(0, 10)}`;
	}
	return "lifetime";
}

// Outside a configured runtime (some unit tests) there is no database to record in.
function runtimeConfigured(): boolean {
	return getBindingsIfConfigured() !== null;
}

/**
 * Notes that a request was rejected because a budget or key limit is used up. The database call
 * runs in the background and is never awaited; this function never throws, so the rejected
 * request is neither slowed down nor put at risk. Other rejection reasons are ignored.
 */
export function noteSpendLimitReached(args: {
	workspaceId?: string | null;
	keyId?: string | null;
	reason?: string | null;
	now?: Date;
}): void {
	try {
		const match = SPEND_LIMIT_REASON.exec(String(args.reason ?? ""));
		if (!match || !args.workspaceId || !runtimeConfigured()) return;
		const budget = Boolean(match[1]);
		const keyId = budget ? null : args.keyId ?? null;
		if (!budget && !keyId) return;
		const now = args.now ?? new Date();
		const memo = JSON.stringify([args.workspaceId, keyId, args.reason, periodOf(match[1] ?? match[2], now)]);
		if ((remembered.get(memo) ?? 0) > now.getTime()) return;
		if (remembered.size >= MAX_REMEMBERED) remembered.clear();
		remembered.set(memo, now.getTime() + REMEMBER_MS);
		const reason = String(args.reason);
		const workspaceId = args.workspaceId;
		dispatchBackground((async () => {
			const { error } = await getSupabaseAdmin().rpc("record_spend_limit_reached", {
				p_workspace_id: workspaceId,
				p_key_id: keyId,
				p_reason: reason,
			});
			if (error) {
				remembered.delete(memo);
				throw new Error(`spend_limit_record_failed:${error.message}`);
			}
		})());
	} catch {
		// Alerts never affect the request.
	}
}

/** Test hook: forget which limits this isolate has recorded. */
export function resetRememberedSpendLimits(): void {
	remembered.clear();
}

export type SpendLimitSweepSummary = { budgets: number; limitedKeys: number; warned: number };

export async function runSpendLimitWarningSweep(): Promise<SpendLimitSweepSummary> {
	const { data, error } = await getSupabaseAdmin().rpc("sweep_spend_limit_warnings", {});
	if (error) throw new Error(`spend_limit_sweep_failed:${error.message}`);
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
	return { budgets: count(result.budgets), limitedKeys: count(result.limitedKeys), warned: count(result.warned) };
}

export type DepartmentBudgetSweepSummary = { budgets: number; alerted: number };

/**
 * sweep_department_budget_alerts sends the department budget 80% warning and the 100% alert from
 * the same hourly rollup: the gateway's department-budget rejections send no push themselves.
 */
export async function runDepartmentBudgetAlertSweep(): Promise<DepartmentBudgetSweepSummary> {
	const { data, error } = await getSupabaseAdmin().rpc("sweep_department_budget_alerts", {});
	if (error) throw new Error(`department_budget_sweep_failed:${error.message}`);
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
	return { budgets: count(result.budgets), alerted: count(result.alerted) };
}
