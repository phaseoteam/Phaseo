import { getSupabaseAdmin } from "@/runtime/env";
import { publishSpendBlockEntries } from "@core/spend-blocks";

// Spend rule alerts and blocks. Every 5 minutes, after the analytics outbox has rebuilt the usage
// rollups, public.sweep_spend_rules evaluates the workspaces whose spend changed (the rollup marks
// them), those whose rule periods rolled over or whose blocks reached their reset, and an hourly
// slice of the rest. Every value is summed in the database. Each rule that crosses a threshold
// queues one spend_alert event in email_outbox; the routed delivery job later in the same tick
// sends it to the rule's destinations (or the workspace's spend_alert routes), and the mobile
// push job sends it as a money push.
// Block rules: with SPEND_RULE_BLOCKS_ENABLED the sweep also starts blocks once spend reaches a
// rule's block point (it lifts them either way) and queues spend_blocked events; the job then
// republishes the gateway's KV entry (core/spend-blocks.ts) for every workspace with block rules
// or blocks it evaluated. Runs behind SPEND_RULES_ENABLED.

export const SPEND_RULES_SWEEP_LIMIT = 100;

export type SpendRuleSweepEvent = { workspaceId: string; ruleId: string; eventId: string; dedupeKey: string; threshold: number | null };

export type SpendRuleSweepBlockChange = {
	workspaceId: string;
	blockId: string;
	ruleId: string | null;
	state: "started" | "lifted";
	reason: string | null;
	eventId: string | null;
};

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
	blocks: SpendRuleSweepBlockChange[];
	/** Evaluated workspaces with block rules or blocks: their gateway entry is republished. */
	publish: string[];
};

const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const stringOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

export function parseSpendRuleSweepSummary(data: unknown): SpendRuleSweepSummary {
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const events = (Array.isArray(result.events) ? result.events : []) as Array<Record<string, unknown>>;
	const blocks = (Array.isArray(result.blocks) ? result.blocks : []) as Array<Record<string, unknown>>;
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
		blocks: blocks.map((block) => ({
			workspaceId: String(block.workspace_id ?? ""),
			blockId: String(block.block_id ?? ""),
			ruleId: stringOrNull(block.rule_id),
			state: block.state === "started" ? "started" : "lifted",
			reason: stringOrNull(block.reason),
			eventId: stringOrNull(block.event_id),
		})),
		publish: (Array.isArray(result.publish) ? result.publish : []).filter((id): id is string => typeof id === "string" && id.length > 0),
	};
}

/** True when a sweep did anything worth a log line. */
export function hasSpendRuleSweepActivity(summary: SpendRuleSweepSummary): boolean {
	return summary.evaluated > 0 || summary.fired > 0 || summary.stateRows > 0 || summary.blocks.length > 0 || summary.skippedLocked;
}

export async function runSpendRulesSweep(options: { now?: Date; limit?: number; blocks?: boolean } = {}): Promise<SpendRuleSweepSummary> {
	const { data, error } = await getSupabaseAdmin().rpc("sweep_spend_rules", {
		p_now: (options.now ?? new Date()).toISOString(),
		p_limit: options.limit ?? SPEND_RULES_SWEEP_LIMIT,
		p_blocks: options.blocks === true,
	});
	if (error) throw new Error(`spend_rules_sweep_failed:${error.message}`);
	return parseSpendRuleSweepSummary(data);
}

/**
 * Republishes the gateway entry of every workspace the sweep evaluated that has block rules or
 * blocks, and of every workspace whose blocks changed. publishSpendBlockEntry skips the KV write
 * when the stored entry is already current, and does nothing while blocks are disabled.
 */
export async function publishSweepSpendBlockEntries(summary: SpendRuleSweepSummary): Promise<{ published: number; failed: number }> {
	const workspaces = new Set([...summary.publish, ...summary.blocks.map((block) => block.workspaceId)].filter(Boolean));
	if (!workspaces.size) return { published: 0, failed: 0 };
	return publishSpendBlockEntries(workspaces);
}
