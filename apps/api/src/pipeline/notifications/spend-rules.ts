import { getSupabaseAdmin } from "@/runtime/env";

// Spend rule alerts. Every 5 minutes, after the analytics outbox has rebuilt the usage rollups,
// public.sweep_spend_rules evaluates the workspaces whose spend changed (the rollup marks them),
// those whose rule periods rolled over, and an hourly slice of the rest. Every value is summed in
// the database. Each rule that crosses a threshold queues one spend_alert event in email_outbox;
// the routed delivery job later in the same tick sends it to the rule's destinations (or the
// workspace's spend_alert routes), and the mobile push job sends it as a money push.
// Notify only: no request is blocked. Runs behind SPEND_RULES_ENABLED.

export const SPEND_RULES_SWEEP_LIMIT = 100;

export type SpendRuleSweepEvent = { workspaceId: string; ruleId: string; eventId: string; dedupeKey: string; threshold: number | null };

export type SpendRuleSweepSummary = {
	dirty: number;
	rollover: number;
	periodic: number;
	evaluated: number;
	rules: number;
	fired: number;
	stateRows: number;
	skippedLocked: boolean;
	events: SpendRuleSweepEvent[];
};

const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function parseSpendRuleSweepSummary(data: unknown): SpendRuleSweepSummary {
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const events = (Array.isArray(result.events) ? result.events : []) as Array<Record<string, unknown>>;
	return {
		dirty: count(result.dirty),
		rollover: count(result.rollover),
		periodic: count(result.periodic),
		evaluated: count(result.evaluated),
		rules: count(result.rules),
		fired: count(result.fired),
		stateRows: count(result.state_rows),
		skippedLocked: result.skipped_locked === true,
		events: events.map((event) => ({
			workspaceId: String(event.workspace_id ?? ""),
			ruleId: String(event.rule_id ?? ""),
			eventId: String(event.event_id ?? ""),
			dedupeKey: String(event.dedupe_key ?? ""),
			threshold: event.threshold == null || !Number.isFinite(Number(event.threshold)) ? null : Number(event.threshold),
		})),
	};
}

/** True when a sweep did anything worth a log line. */
export function hasSpendRuleSweepActivity(summary: SpendRuleSweepSummary): boolean {
	return summary.evaluated > 0 || summary.fired > 0 || summary.stateRows > 0 || summary.skippedLocked;
}

export async function runSpendRulesSweep(options: { now?: Date; limit?: number } = {}): Promise<SpendRuleSweepSummary> {
	const { data, error } = await getSupabaseAdmin().rpc("sweep_spend_rules", {
		p_now: (options.now ?? new Date()).toISOString(),
		p_limit: options.limit ?? SPEND_RULES_SWEEP_LIMIT,
	});
	if (error) throw new Error(`spend_rules_sweep_failed:${error.message}`);
	return parseSpendRuleSweepSummary(data);
}
