import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeSlackAgentMonths, slackAgentChargeableBefore, type SlackAgentChargeClient } from "@/billing/slackAgentCharges";

type Call = { fn: string; args: Record<string, unknown> };

function fakeClient(due: unknown[], results: Record<string, { status: string; amount_nanos: number } | Error>) {
	const calls: Call[] = [];
	const client: SlackAgentChargeClient = {
		rpc: async (fn, args) => {
			calls.push({ fn, args });
			if (fn === "list_slack_agent_due_charges") return { data: due, error: null };
			const result = results[String(args.p_installation_id)];
			if (result instanceof Error) return { data: null, error: { message: result.message } };
			return { data: result ? [result] : [], error: null };
		},
	};
	return { client, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("slackAgentChargeableBefore", () => {
	it("closes a month an hour after it ends", () => {
		expect(slackAgentChargeableBefore(new Date("2026-11-01T00:30:00Z"))).toBe("2026-10-01");
		expect(slackAgentChargeableBefore(new Date("2026-11-01T01:00:00Z"))).toBe("2026-11-01");
		expect(slackAgentChargeableBefore(new Date("2026-11-21T14:17:00Z"))).toBe("2026-11-01");
		expect(slackAgentChargeableBefore(new Date("2027-01-01T00:59:59Z"))).toBe("2026-12-01");
	});
});

describe("chargeSlackAgentMonths", () => {
	it("charges each due month from the shared price, capped at the spending cap", async () => {
		const { client, calls } = fakeClient(
			[
				{ installation_id: "inst-a", workspace_id: "ws-a", period_start: "2026-10-01", people: 3, answers: "1060", monthly_cap_nanos: "25000000000" },
				{ installation_id: "inst-b", workspace_id: "ws-b", period_start: "2026-10-01", people: 40, answers: 2_000, monthly_cap_nanos: 5_000_000_000 },
				{ installation_id: "inst-c", workspace_id: "ws-c", period_start: "2026-09-01", people: 1, answers: 1, monthly_cap_nanos: 25_000_000_000 },
			],
			{
				"inst-a": { status: "charged", amount_nanos: 1_030_000_000 },
				"inst-b": { status: "already_charged", amount_nanos: 5_000_000_000 },
				"inst-c": { status: "insufficient_balance", amount_nanos: 990_000_000 },
			},
		);

		const summary = await chargeSlackAgentMonths(client, new Date("2026-11-01T02:17:00Z"));

		expect(calls[0]).toEqual({ fn: "list_slack_agent_due_charges", args: { p_before: "2026-11-01", p_limit: 200 } });
		expect(calls.slice(1).map((call) => call.args)).toEqual([
			// $0.99 for 3 people plus 160 answers over the 900 included at $0.25 per 1,000.
			{ p_installation_id: "inst-a", p_period_start: "2026-10-01", p_people: 3, p_answers: 1060, p_amount_nanos: 1_030_000_000 },
			// $7.99 for 40 people is above the $5 cap, so $5 is charged.
			{ p_installation_id: "inst-b", p_period_start: "2026-10-01", p_people: 40, p_answers: 2000, p_amount_nanos: 5_000_000_000 },
			{ p_installation_id: "inst-c", p_period_start: "2026-09-01", p_people: 1, p_answers: 1, p_amount_nanos: 990_000_000 },
		]);
		expect(summary).toEqual({
			before: "2026-11-01", due: 3, charged: 1, alreadyCharged: 1, waitingForCredits: 1, failed: 0, chargedNanos: 1_030_000_000,
		});
	});

	it("keeps going when one month fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { client } = fakeClient(
			[
				{ installation_id: "inst-a", workspace_id: "ws-a", period_start: "2026-10-01", people: 3, answers: 10, monthly_cap_nanos: 1 },
				{ installation_id: "inst-b", workspace_id: "ws-b", period_start: "2026-10-01", people: 3, answers: 10, monthly_cap_nanos: 25_000_000_000 },
			],
			{ "inst-a": new Error("boom"), "inst-b": { status: "charged", amount_nanos: 990_000_000 } },
		);
		const summary = await chargeSlackAgentMonths(client, new Date("2026-11-02T00:00:00Z"));
		expect([summary.failed, summary.charged, summary.chargedNanos]).toEqual([1, 1, 990_000_000]);
		expect(error).toHaveBeenCalledWith("slack_agent_charge_failed", expect.objectContaining({ installationId: "inst-a", error: "boom" }));
	});

	it("does nothing when no month is due and fails loudly when listing fails", async () => {
		const { client, calls } = fakeClient([], {});
		expect((await chargeSlackAgentMonths(client, new Date("2026-11-02T00:00:00Z"))).due).toBe(0);
		expect(calls).toHaveLength(1);
		const broken: SlackAgentChargeClient = { rpc: async () => ({ data: null, error: { message: "down" } }) };
		await expect(chargeSlackAgentMonths(broken)).rejects.toThrow("list_slack_agent_due_charges failed: down");
	});
});
