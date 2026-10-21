import { slackAgentMonthlyCharge } from "@/billing/slackAgentPricing";

type RpcResult = { data: unknown; error: { message?: string } | null };
export type SlackAgentChargeClient = {
	rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

type DueCharge = {
	installation_id: string;
	workspace_id: string;
	period_start: string;
	people: number;
	answers: number | string;
	monthly_cap_nanos: number | string;
};

type ChargeResult = { status: string; amount_nanos: number | string | null };

export type SlackAgentChargeSummary = {
	before: string;
	due: number;
	charged: number;
	alreadyCharged: number;
	waitingForCredits: number;
	failed: number;
	chargedNanos: number;
};

// Months close an hour late so the Slack Worker's last meter flush for the
// month lands before it is charged.
const CLOSE_DELAY_MS = 60 * 60 * 1000;
const BATCH = 200;

/** First day (UTC, YYYY-MM-DD) of the month that is not yet chargeable at `now`. */
export function slackAgentChargeableBefore(now: Date): string {
	const closed = new Date(now.getTime() - CLOSE_DELAY_MS);
	return new Date(Date.UTC(closed.getUTCFullYear(), closed.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/**
 * Takes each finished month's Slack agent charge from credits: the plan for the
 * people who used the agent plus extra answers, capped at the installation's
 * spending cap. Months a workspace can't pay yet stay pending and are retried on
 * the next run; the database keeps every charge idempotent.
 */
export async function chargeSlackAgentMonths(client: SlackAgentChargeClient, now = new Date()): Promise<SlackAgentChargeSummary> {
	const before = slackAgentChargeableBefore(now);
	const summary: SlackAgentChargeSummary = { before, due: 0, charged: 0, alreadyCharged: 0, waitingForCredits: 0, failed: 0, chargedNanos: 0 };
	const listed = await client.rpc("list_slack_agent_due_charges", { p_before: before, p_limit: BATCH });
	if (listed.error) throw new Error(`list_slack_agent_due_charges failed: ${listed.error.message ?? "unknown"}`);
	const due = (Array.isArray(listed.data) ? listed.data : []) as DueCharge[];
	summary.due = due.length;

	for (const month of due) {
		const charge = slackAgentMonthlyCharge({
			people: Number(month.people),
			answers: Number(month.answers),
			capNanos: Number(month.monthly_cap_nanos),
		});
		const result = await client.rpc("charge_slack_agent_month", {
			p_installation_id: month.installation_id,
			p_period_start: month.period_start,
			p_people: charge.people,
			p_answers: charge.answers,
			p_amount_nanos: charge.chargeNanos,
		});
		const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ChargeResult | undefined;
		if (result.error || !row) {
			summary.failed += 1;
			console.error("slack_agent_charge_failed", { installationId: month.installation_id, periodStart: month.period_start, error: result.error?.message ?? "no_result" });
			continue;
		}
		if (row.status === "charged") {
			summary.charged += 1;
			summary.chargedNanos += Number(row.amount_nanos ?? 0);
		} else if (row.status === "already_charged") {
			summary.alreadyCharged += 1;
		} else {
			summary.waitingForCredits += 1;
		}
	}
	return summary;
}
