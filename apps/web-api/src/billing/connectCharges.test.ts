import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeConnectMonths, connectChargeableBefore, type ConnectChargeClient } from "@/billing/connectCharges";
import { handleConnectChargesScheduledEvent } from "@/scheduled/connect-charges";

type Call = { fn: string; args: Record<string, unknown> };

function fakeClient(due: unknown[], results: Record<string, { status: string; amount_nanos: number } | Error>) {
	const calls: Call[] = [];
	const client: ConnectChargeClient = {
		rpc: async (fn, args) => {
			calls.push({ fn, args });
			if (fn === "list_connect_due_charges") return { data: due, error: null };
			const result = results[`${args.p_workspace_id}:${args.p_period_start}`];
			if (result instanceof Error) return { data: null, error: { message: result.message } };
			return { data: result ? [result] : [], error: null };
		},
	};
	return { client, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("connectChargeableBefore", () => {
	it("makes a month chargeable once it has ended in UTC", () => {
		expect(connectChargeableBefore(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10-01");
		expect(connectChargeableBefore(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11-01");
		expect(connectChargeableBefore(new Date("2027-01-15T12:00:00Z"))).toBe("2027-01-01");
	});
});

describe("chargeConnectMonths", () => {
	it("charges each due month through the database, which fixes the prorated amount", async () => {
		const { client, calls } = fakeClient(
			[
				{ workspace_id: "ws-a", period_start: "2026-09-01" },
				{ workspace_id: "ws-b", period_start: "2026-10-01" },
				{ workspace_id: "ws-c", period_start: "2026-10-01" },
				{ workspace_id: "ws-d", period_start: "2026-10-01" },
			],
			{
				// 10 of 30 days: $0.333333333, rounded down.
				"ws-a:2026-09-01": { status: "charged", amount_nanos: 333_333_333 },
				"ws-b:2026-10-01": { status: "already_charged", amount_nanos: 1_000_000_000 },
				"ws-c:2026-10-01": { status: "insufficient_balance", amount_nanos: 1_000_000_000 },
				"ws-d:2026-10-01": { status: "nothing_due", amount_nanos: 0 },
			},
		);

		const summary = await chargeConnectMonths(client, new Date("2026-11-01T00:23:00Z"));

		expect(calls[0]).toEqual({ fn: "list_connect_due_charges", args: { p_before: "2026-11-01", p_limit: 200 } });
		expect(calls.slice(1)).toEqual([
			{ fn: "charge_connect_month", args: { p_workspace_id: "ws-a", p_period_start: "2026-09-01" } },
			{ fn: "charge_connect_month", args: { p_workspace_id: "ws-b", p_period_start: "2026-10-01" } },
			{ fn: "charge_connect_month", args: { p_workspace_id: "ws-c", p_period_start: "2026-10-01" } },
			{ fn: "charge_connect_month", args: { p_workspace_id: "ws-d", p_period_start: "2026-10-01" } },
		]);
		expect(summary).toEqual({
			before: "2026-11-01", due: 4, charged: 1, alreadyCharged: 1, nothingDue: 1, waitingForCredits: 1, failed: 0, chargedNanos: 333_333_333,
		});
	});

	it("keeps going when one month fails, and fails loudly when listing fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { client } = fakeClient(
			[{ workspace_id: "ws-a", period_start: "2026-10-01" }, { workspace_id: "ws-b", period_start: "2026-10-01" }],
			{ "ws-a:2026-10-01": new Error("boom"), "ws-b:2026-10-01": { status: "charged", amount_nanos: 1_000_000_000 } },
		);
		const summary = await chargeConnectMonths(client, new Date("2026-11-02T00:00:00Z"));
		expect([summary.failed, summary.charged, summary.chargedNanos]).toEqual([1, 1, 1_000_000_000]);
		expect(error).toHaveBeenCalledWith("connect_charge_failed", expect.objectContaining({ workspaceId: "ws-a", error: "boom" }));

		const broken: ConnectChargeClient = { rpc: async () => ({ data: null, error: { message: "down" } }) };
		await expect(chargeConnectMonths(broken)).rejects.toThrow("list_connect_due_charges failed: down");
	});
});

describe("handleConnectChargesScheduledEvent", () => {
	it("runs only at its minute of the hour", async () => {
		const fetch = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
		vi.stubGlobal("fetch", fetch);
		const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" } as never;
		await handleConnectChargesScheduledEvent({ scheduledTime: Date.parse("2026-11-01T01:17:00Z") } as ScheduledController, env);
		expect(fetch).not.toHaveBeenCalled();
		await handleConnectChargesScheduledEvent({ scheduledTime: Date.parse("2026-11-01T01:23:00Z") } as ScheduledController, env);
		expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain("/rpc/list_connect_due_charges");
		vi.unstubAllGlobals();
	});
});
