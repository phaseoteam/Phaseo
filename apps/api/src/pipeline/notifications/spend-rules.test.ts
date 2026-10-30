import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), publish: vi.fn() }));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));
vi.mock("@core/spend-blocks", () => ({
	publishSpendBlockEntries: (...args: unknown[]) => state.publish(...args),
}));

const { hasSpendRuleSweepActivity, parseSpendRuleSweepSummary, publishSweepSpendBlockEntries, runSpendRulesSweep, SPEND_RULES_SWEEP_LIMIT } = await import("./spend-rules");

const now = new Date("2026-10-20T15:05:00Z");

describe("spend rules sweep", () => {
	beforeEach(() => {
		state.rpc.mockReset();
		state.publish.mockReset().mockResolvedValue({ published: 0, failed: 0 });
	});

	it("calls sweep_spend_rules with the time and limit and reads its summary", async () => {
		state.rpc.mockResolvedValue({
			data: {
				dirty: 3, rollover: 1, periodic: 2, balance: 1, evaluated: 6, rules: 13, fired: 2, state_rows: 5, blocks: [],
				events: [
					{ workspace_id: "ws_1", rule_id: "rule_1", event_id: "ev_1", dedupe_key: "spend_alert:rule_1:2026-10-01T04:00:00Z:80", threshold: 80 },
					{ workspace_id: "ws_2", rule_id: "rule_2", event_id: "ev_2", dedupe_key: "spend_alert:rule_2:cooldown:4900000:runway", threshold: 3, trigger: "runway" },
					{ workspace_id: "ws_2", rule_id: "rule_3", event_id: "ev_3", dedupe_key: "spend_alert:rule_3:cooldown:81700:spike", threshold: "3.00", trigger: "spike" },
				],
			},
			error: null,
		});
		const summary = await runSpendRulesSweep({ now });
		expect(state.rpc).toHaveBeenCalledWith("sweep_spend_rules", { p_now: "2026-10-20T15:05:00.000Z", p_limit: SPEND_RULES_SWEEP_LIMIT, p_blocks: false });
		expect(summary).toEqual({
			dirty: 3, rollover: 1, periodic: 2, balance: 1, evaluated: 6, rules: 13, fired: 2, stateRows: 5, skippedLocked: false,
			events: [
				{ workspaceId: "ws_1", ruleId: "rule_1", eventId: "ev_1", dedupeKey: "spend_alert:rule_1:2026-10-01T04:00:00Z:80", threshold: 80 },
				{ workspaceId: "ws_2", ruleId: "rule_2", eventId: "ev_2", dedupeKey: "spend_alert:rule_2:cooldown:4900000:runway", threshold: 3, trigger: "runway" },
				{ workspaceId: "ws_2", ruleId: "rule_3", eventId: "ev_3", dedupeKey: "spend_alert:rule_3:cooldown:81700:spike", threshold: 3, trigger: "spike" },
			],
			blocks: [], publish: [],
		});
		expect(hasSpendRuleSweepActivity(summary)).toBe(true);
	});

	it("passes a custom limit", async () => {
		state.rpc.mockResolvedValue({ data: {}, error: null });
		await runSpendRulesSweep({ now, limit: 25 });
		expect(state.rpc).toHaveBeenCalledWith("sweep_spend_rules", { p_now: now.toISOString(), p_limit: 25, p_blocks: false });
		await runSpendRulesSweep({ now, blocks: true });
		expect(state.rpc).toHaveBeenLastCalledWith("sweep_spend_rules", { p_now: now.toISOString(), p_limit: SPEND_RULES_SWEEP_LIMIT, p_blocks: true });
	});

	it("treats an idle or malformed result as no activity", () => {
		const idle = parseSpendRuleSweepSummary({ dirty: 0, rollover: 0, periodic: 0, evaluated: 0, rules: 0, fired: 0, state_rows: 0, events: [], blocks: [] });
		expect(hasSpendRuleSweepActivity(idle)).toBe(false);
		const junk = parseSpendRuleSweepSummary("nope");
		expect(junk).toEqual({ dirty: 0, rollover: 0, periodic: 0, balance: 0, evaluated: 0, rules: 0, fired: 0, stateRows: 0, skippedLocked: false, events: [], blocks: [], publish: [] });
		expect(parseSpendRuleSweepSummary({ events: [{ threshold: "amount" }] }).events[0].threshold).toBeNull();
	});

	it("reads block changes and the workspaces to republish", () => {
		const summary = parseSpendRuleSweepSummary({
			blocks: [
				{ workspace_id: "ws_1", block_id: "b1", rule_id: "rule_1", state: "started", reason: null, event_id: "ev_1" },
				{ workspace_id: "ws_2", block_id: "b2", rule_id: null, state: "lifted", reason: "period_reset", event_id: null },
			],
			publish: ["ws_1", "ws_3", 7, ""],
		});
		expect(summary.blocks).toEqual([
			{ workspaceId: "ws_1", blockId: "b1", ruleId: "rule_1", state: "started", reason: null, eventId: "ev_1" },
			{ workspaceId: "ws_2", blockId: "b2", ruleId: null, state: "lifted", reason: "period_reset", eventId: null },
		]);
		expect(summary.publish).toEqual(["ws_1", "ws_3"]);
		expect(hasSpendRuleSweepActivity(summary)).toBe(true);
	});

	it("republishes evaluated workspaces with block rules and every workspace whose blocks changed", async () => {
		state.publish.mockResolvedValue({ published: 3, failed: 0 });
		const summary = parseSpendRuleSweepSummary({
			blocks: [{ workspace_id: "ws_2", block_id: "b2", state: "lifted" }, { workspace_id: "ws_1", block_id: "b1", state: "started" }],
			publish: ["ws_1", "ws_3"],
		});
		expect(await publishSweepSpendBlockEntries(summary)).toEqual({ published: 3, failed: 0 });
		expect([...state.publish.mock.calls[0][0]].sort()).toEqual(["ws_1", "ws_2", "ws_3"]);
		state.publish.mockClear();
		expect(await publishSweepSpendBlockEntries(parseSpendRuleSweepSummary({}))).toEqual({ published: 0, failed: 0 });
		expect(state.publish).not.toHaveBeenCalled();
	});

	it("reports a sweep skipped because another one holds the lock", () => {
		expect(hasSpendRuleSweepActivity(parseSpendRuleSweepSummary({ skipped_locked: true }))).toBe(true);
	});

	it("throws on a database error", async () => {
		state.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
		await expect(runSpendRulesSweep({ now })).rejects.toThrow("spend_rules_sweep_failed:boom");
	});
});
