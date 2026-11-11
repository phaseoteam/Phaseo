type RpcResult = { data: unknown; error: { message?: string } | null };
export type ConnectChargeClient = {
	rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

/** Phaseo Connect costs $1 a month in nanodollars, the unit of wallets and credit_ledger; charge_connect_month uses the same figure. */
export const CONNECT_MONTHLY_PRICE_NANOS = 1_000_000_000;

type DueCharge = { workspace_id: string; period_start: string };
type ChargeResult = { status: string; amount_nanos: number | string | null };

export type ConnectChargeSummary = {
	before: string;
	due: number;
	charged: number;
	alreadyCharged: number;
	nothingDue: number;
	waitingForCredits: number;
	failed: number;
	chargedNanos: number;
};

const BATCH = 200;

/** First day (UTC, YYYY-MM-DD) of the month that is not yet chargeable at `now`: the current month. */
export function connectChargeableBefore(now: Date): string {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/**
 * Takes each finished month's Connect charge from credits. The database counts
 * the days it was on and fixes the prorated amount (rounded down) at the first
 * attempt; months a workspace can't pay yet stay pending, pause Connect and are
 * retried on the next run.
 */
export async function chargeConnectMonths(client: ConnectChargeClient, now = new Date()): Promise<ConnectChargeSummary> {
	const before = connectChargeableBefore(now);
	const summary: ConnectChargeSummary = { before, due: 0, charged: 0, alreadyCharged: 0, nothingDue: 0, waitingForCredits: 0, failed: 0, chargedNanos: 0 };
	const listed = await client.rpc("list_connect_due_charges", { p_before: before, p_limit: BATCH });
	if (listed.error) throw new Error(`list_connect_due_charges failed: ${listed.error.message ?? "unknown"}`);
	const due = (Array.isArray(listed.data) ? listed.data : []) as DueCharge[];
	summary.due = due.length;

	for (const month of due) {
		const result = await client.rpc("charge_connect_month", { p_workspace_id: month.workspace_id, p_period_start: month.period_start });
		const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ChargeResult | undefined;
		if (result.error || !row) {
			summary.failed += 1;
			console.error("connect_charge_failed", { workspaceId: month.workspace_id, periodStart: month.period_start, error: result.error?.message ?? "no_result" });
			continue;
		}
		if (row.status === "charged") {
			summary.charged += 1;
			summary.chargedNanos += Number(row.amount_nanos ?? 0);
		} else if (row.status === "already_charged") {
			summary.alreadyCharged += 1;
		} else if (row.status === "nothing_due") {
			summary.nothingDue += 1;
		} else {
			summary.waitingForCredits += 1;
		}
	}
	return summary;
}
