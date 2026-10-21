import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const RULE = "00000000-0000-4000-8000-000000000002";
const D1 = "00000000-0000-4000-8000-000000000041";
const D2 = "00000000-0000-4000-8000-000000000042";
const D3 = "00000000-0000-4000-8000-000000000043";

const state = vi.hoisted(() => ({
	rule: null as any,
	routes: [] as Array<{ destination_id: string }>,
	destinations: [] as Array<{ id: string; name: string; type: string; status: string }>,
	allowed: true,
	preview: {} as Record<string, unknown>,
	calls: [] as Array<{ table?: string; rpc?: string; args?: unknown; filters: Array<[string, string, unknown]> }>,
	deliver: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

function query(table: string) {
	const call = { table, filters: [] as Array<[string, string, unknown]> };
	state.calls.push(call);
	const result = () => {
		if (table === "workspace_spend_rules") return { data: state.rule, error: null };
		if (table === "notification_event_destinations") return { data: state.routes, error: null };
		const ids = call.filters.find(([op]) => op === "in")?.[2] as string[];
		return { data: state.destinations.filter((row) => ids.includes(row.id) && row.status === "active"), error: null };
	};
	const builder: any = {
		select: () => builder,
		eq: (column: string, value: unknown) => { call.filters.push(["eq", column, value]); return builder; },
		is: (column: string, value: unknown) => { call.filters.push(["is", column, value]); return builder; },
		in: (column: string, value: unknown) => { call.filters.push(["in", column, value]); return builder; },
		maybeSingle: async () => result(),
		then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
	};
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: async (name: string, args: unknown) => {
			state.calls.push({ rpc: name, args, filters: [] });
			if (name === "consume_spend_rule_test_send") return { data: state.allowed, error: null };
			return { data: state.preview, error: null };
		},
	}),
}));
vi.mock("@/pipeline/notifications/notification-delivery", () => ({ deliverNotificationTest: (...args: unknown[]) => state.deliver(...args) }));

const PREVIEW = {
	rule_id: RULE, metric: "budget_percent", evaluated: true, computed_at: "2026-10-21T12:00:30Z", time_zone: "America/New_York",
	period: { kind: "month", start: "2026-10-01T04:00:00+00:00", end: "2026-11-01T04:00:00+00:00" },
	value_nanos: 59e9, base_kind: "amount", base_ref: null, base_nanos: 100e9, percent: 59, threshold_percents: [50, 80, 100],
	threshold_amount_nanos: null, reached_threshold_percent: 50, next_threshold: { percent: 80, amount_nanos: 80e9 }, block_at_nanos: null, state: null,
	alert: { scope_label: "Acme", title: "Monthly: 50% of $100.00 reached", message: "The workspace has spent $59.00 this month: 59% of $100.00. Alerts at 50%, 80%, 100%. The month resets Nov 1, 00:00 America/New_York." },
};

async function send() {
	const { sendSpendRuleTest } = await import("./spend-rule-test");
	return sendSpendRuleTest({ workspaceId: WORKSPACE, ruleId: RULE, now: new Date("2026-10-21T12:00:43Z") });
}

describe("spend rule test sends", () => {
	beforeEach(() => {
		state.rule = { id: RULE, name: "Monthly", metric: "budget_percent", workspace_spend_rule_destinations: [] };
		state.routes = [{ destination_id: D1 }, { destination_id: D2 }];
		state.destinations = [
			{ id: D1, name: "Ops Slack", type: "slack", status: "active" },
			{ id: D2, name: "Finance", type: "email", status: "active" },
			{ id: D3, name: "Paused", type: "slack", status: "disabled" },
		];
		state.allowed = true;
		state.preview = { ...PREVIEW };
		state.calls = [];
		state.deliver = vi.fn(async () => 200);
	});

	it("renders the evaluator's alert marked TEST and sends it to the spend_alert routes when the rule has no destinations", async () => {
		const result = await send();
		expect(result).toMatchObject({ rule_id: RULE, rule_name: "Monthly", test: true, source: "routes", delivered: 2, failed: 0 });
		expect(result.title).toBe("[TEST] Monthly: 50% of $100.00 reached");
		expect(result.message).toBe(`${PREVIEW.alert.message} This is a test: nothing was recorded and the rule's thresholds are unchanged.`);
		expect(state.deliver).toHaveBeenCalledTimes(2);
		expect(state.deliver).toHaveBeenCalledWith({
			workspaceId: WORKSPACE,
			destinationId: D1,
			event: { kind: "spend_alert", subject: result.title, payload: expect.objectContaining({ test: true, title: result.title, message: result.message, rule_id: RULE, value_nanos: 59e9, threshold_percent: 50 }) },
		});
		expect(state.calls.find((call) => call.rpc === "consume_spend_rule_test_send")?.args).toEqual({ p_workspace_id: WORKSPACE, p_limit: 5 });
		expect(state.calls.find((call) => call.rpc === "preview_workspace_spend_rule")?.args).toEqual({ p_workspace_id: WORKSPACE, p_rule_id: RULE, p_now: "2026-10-21T12:00:43.000Z" });
		// Nothing is written: only reads, the limiter and the preview.
		expect(state.calls.filter((call) => call.rpc).map((call) => call.rpc)).toEqual(["consume_spend_rule_test_send", "preview_workspace_spend_rule"]);
	});

	it("uses the rule's own destinations instead of the routes, skipping inactive ones, and reports each delivery", async () => {
		state.rule.workspace_spend_rule_destinations = [{ destination_id: D2 }, { destination_id: D3 }];
		state.deliver.mockRejectedValueOnce(new Error("Destination returned HTTP 500."));
		const result = await send();
		expect(result.source).toBe("rule");
		expect(state.calls.some((call) => call.table === "notification_event_destinations")).toBe(false);
		expect(result.deliveries).toEqual([{ destination_id: D2, name: "Finance", type: "email", delivered: false, status: null, error: "Destination returned HTTP 500." }]);
		expect([result.delivered, result.failed]).toEqual([0, 1]);
	});

	it("is 404 for a missing rule before using the allowance", async () => {
		state.rule = null;
		await expect(send()).rejects.toMatchObject({ status: 404, code: "not_found" });
		expect(state.calls.some((call) => call.rpc)).toBe(false);
	});

	it("is 429 with the seconds to the next minute once the allowance is used", async () => {
		state.allowed = false;
		await expect(send()).rejects.toMatchObject({ status: 429, code: "rate_limited", retryAfterSeconds: 17 });
		expect(state.deliver).not.toHaveBeenCalled();
	});

	it("is 409 with nowhere to send, and does not fall back to routes when the rule's destinations are paused", async () => {
		state.routes = [];
		await expect(send()).rejects.toMatchObject({ status: 409, code: "no_notification_destinations" });
		state.rule.workspace_spend_rule_destinations = [{ destination_id: D3 }];
		state.routes = [{ destination_id: D1 }];
		await expect(send()).rejects.toMatchObject({ status: 409, code: "no_active_destinations", message: "None of the rule's destinations is active" });
		expect(state.deliver).not.toHaveBeenCalled();
	});

	it("explains rules the evaluator does not handle yet", async () => {
		state.rule.metric = "spike";
		state.preview = { ...PREVIEW, metric: "spike", evaluated: false, period: null, value_nanos: null, alert: null };
		const result = await send();
		expect(result.title).toBe("[TEST] Monthly: test alert");
		expect(result.message).toBe('This is a test of spend rule "Monthly". spike rules are evaluated from a later release, so this rule does not send alerts yet.');
	});

	it("says when a forecast starts if it is too early to project", async () => {
		state.rule.metric = "forecast";
		state.preview = {
			...PREVIEW, metric: "forecast", alert: null, reached_threshold_percent: null,
			forecast: { ready: false, from: "2026-10-04T04:00:00+00:00", projected_nanos: null, projected_percent: null, by: "2026-11-01T04:00:00+00:00", limit_nanos: 500e9, reaches_at: null },
		};
		const result = await send();
		expect(result.message).toMatch(/^This is a test of spend rule "Monthly"\. Too little of the month has passed to project its spend; the forecast starts 2026-10-04T04:00:00\+00:00 \(America\/New_York periods\)\./);
		const payload = state.deliver.mock.calls[0][0].event.payload;
		expect(payload.forecast).toMatchObject({ projected_nanos: null, limit_nanos: 500e9, from: "2026-10-04T04:00:00+00:00" });
	});
});
