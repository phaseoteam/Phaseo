import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));

const { hasSpendRuleSweepActivity, parseSpendRuleSweepSummary, runSpendRulesSweep, SPEND_RULES_SWEEP_LIMIT } = await import("./spend-rules");

const now = new Date("2026-10-20T15:05:00Z");

describe("spend rules sweep", () => {
	beforeEach(() => {
		state.rpc.mockReset();
	});

	it("calls sweep_spend_rules with the time and limit and reads its summary", async () => {
		state.rpc.mockResolvedValue({
			data: {
				dirty: 3, rollover: 1, periodic: 2, evaluated: 5, rules: 12, fired: 1, state_rows: 4, blocks: [],
				events: [{ workspace_id: "ws_1", rule_id: "rule_1", event_id: "ev_1", dedupe_key: "spend_alert:rule_1:2026-10-01T04:00:00Z:80", threshold: 80 }],
			},
			error: null,
		});
		const summary = await runSpendRulesSweep({ now });
		expect(state.rpc).toHaveBeenCalledWith("sweep_spend_rules", { p_now: "2026-10-20T15:05:00.000Z", p_limit: SPEND_RULES_SWEEP_LIMIT });
		expect(summary).toEqual({
			dirty: 3, rollover: 1, periodic: 2, evaluated: 5, rules: 12, fired: 1, stateRows: 4, skippedLocked: false,
			events: [{ workspaceId: "ws_1", ruleId: "rule_1", eventId: "ev_1", dedupeKey: "spend_alert:rule_1:2026-10-01T04:00:00Z:80", threshold: 80 }],
		});
		expect(hasSpendRuleSweepActivity(summary)).toBe(true);
	});

	it("passes a custom limit", async () => {
		state.rpc.mockResolvedValue({ data: {}, error: null });
		await runSpendRulesSweep({ now, limit: 25 });
		expect(state.rpc).toHaveBeenCalledWith("sweep_spend_rules", { p_now: now.toISOString(), p_limit: 25 });
	});

	it("treats an idle or malformed result as no activity", () => {
		const idle = parseSpendRuleSweepSummary({ dirty: 0, rollover: 0, periodic: 0, evaluated: 0, rules: 0, fired: 0, state_rows: 0, events: [], blocks: [] });
		expect(hasSpendRuleSweepActivity(idle)).toBe(false);
		const junk = parseSpendRuleSweepSummary("nope");
		expect(junk).toEqual({ dirty: 0, rollover: 0, periodic: 0, evaluated: 0, rules: 0, fired: 0, stateRows: 0, skippedLocked: false, events: [] });
		expect(parseSpendRuleSweepSummary({ events: [{ threshold: "amount" }] }).events[0].threshold).toBeNull();
	});

	it("reports a sweep skipped because another one holds the lock", () => {
		expect(hasSpendRuleSweepActivity(parseSpendRuleSweepSummary({ skipped_locked: true }))).toBe(true);
	});

	it("throws on a database error", async () => {
		state.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
		await expect(runSpendRulesSweep({ now })).rejects.toThrow("spend_rules_sweep_failed:boom");
	});
});
