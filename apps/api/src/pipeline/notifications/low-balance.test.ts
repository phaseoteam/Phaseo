import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	automationsEnabled: "true" as string | undefined,
	apiKey: "resend_key",
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	rpcResult: { data: null as unknown, error: null as { message: string } | null },
	updates: [] as Array<{ table: string; values: Record<string, unknown>; id: unknown }>,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		RESEND_API_KEY: state.apiKey,
		RESEND_ONBOARDING_AUTOMATIONS_ENABLED: state.automationsEnabled,
	}),
	getSupabaseAdmin: () => ({
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcCalls.push({ name, args });
			return state.rpcResult;
		},
		// The only direct write: reopening an outbox row whose automation event failed.
		from: (table: string) => ({
			update: (values: Record<string, unknown>) => ({
				eq: async (_column: string, id: unknown) => {
					state.updates.push({ table, values, id });
					return { error: null };
				},
			}),
		}),
	}),
}));

const NOW = new Date("2026-10-21T16:35:00.000Z");
// What public.sweep_low_balance_emails returns for one queued email.
const sweptEmail = {
	id: "outbox_1",
	workspace_id: "ws_1",
	to_email: "owner@example.com",
	user_first_name: "Ada",
	team_name: "Research",
	balance_nanos: 8_500_000_000,
	balance_usd: 8.5,
	threshold_nanos: 10_000_000_000,
	threshold_usd: 10,
};
const sweepResult = (emails: unknown[]) => ({
	watched: 3, firstSeen: 0, dropped: emails.length, rearmed: 0, coveredByTopUp: 0, waiting: 0, emailed: emails.length, emails,
});

describe("low-balance email sweep", () => {
	beforeEach(() => {
		state.automationsEnabled = "true";
		state.apiKey = "resend_key";
		state.rpcCalls.length = 0;
		state.updates.length = 0;
		state.rpcResult = { data: sweepResult([]), error: null };
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("runs the sweep RPC with the rows marked sent and sends the Resend automation event the request path sent", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "event_1" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		state.rpcResult = { data: sweepResult([sweptEmail]), error: null };
		const { runLowBalanceEmailSweep } = await import("./low-balance");

		const summary = await runLowBalanceEmailSweep({ now: NOW });

		expect(state.rpcCalls).toEqual([{ name: "sweep_low_balance_emails", args: { p_now: NOW.toISOString(), p_mark_sent: true } }]);
		expect(summary).toMatchObject({ watched: 3, dropped: 1, emailed: 1, automationSent: 1, automationFailed: 0 });
		expect(state.updates).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.resend.com/events");
		expect(JSON.parse(String(init.body))).toEqual({
			event: "workspace.low_balance",
			email: "owner@example.com",
			payload: {
				firstName: "Ada",
				workspaceId: "ws_1",
				workspaceName: "Research",
				balanceNanos: 8_500_000_000,
				balanceUsd: 8.5,
				thresholdNanos: 10_000_000_000,
				thresholdUsd: 10,
				triggeredAtIso: NOW.toISOString(),
			},
		});
	});

	it("leaves the rows to the outbox drain when Resend automations are off", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		state.automationsEnabled = "false";
		state.rpcResult = { data: sweepResult([sweptEmail]), error: null };
		const { runLowBalanceEmailSweep } = await import("./low-balance");

		const summary = await runLowBalanceEmailSweep({ now: NOW });

		expect(state.rpcCalls[0]?.args.p_mark_sent).toBe(false);
		expect(summary.emailed).toBe(1);
		expect(summary.automationSent).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("treats a missing Resend key as automations off", async () => {
		vi.stubGlobal("fetch", vi.fn());
		state.apiKey = "";
		const { runLowBalanceEmailSweep } = await import("./low-balance");
		await runLowBalanceEmailSweep({ now: NOW });
		expect(state.rpcCalls[0]?.args.p_mark_sent).toBe(false);
	});

	it("counts a failed automation event without failing the sweep and reopens its row for the outbox drain", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })));
		vi.spyOn(console, "error").mockImplementation(() => {});
		state.rpcResult = { data: sweepResult([sweptEmail, { ...sweptEmail, id: "outbox_2", workspace_id: "ws_2" }]), error: null };
		const { runLowBalanceEmailSweep } = await import("./low-balance");

		const summary = await runLowBalanceEmailSweep({ now: NOW });

		expect(summary.automationFailed).toBe(2);
		expect(summary.automationSent).toBe(0);
		expect(state.updates).toEqual([
			{ table: "email_outbox", values: { sent_at: null }, id: "outbox_1" },
			{ table: "email_outbox", values: { sent_at: null }, id: "outbox_2" },
		]);
	});

	it("throws when the sweep RPC fails", async () => {
		state.rpcResult = { data: null, error: { message: "boom" } };
		const { runLowBalanceEmailSweep } = await import("./low-balance");
		await expect(runLowBalanceEmailSweep({ now: NOW })).rejects.toThrow("low_balance_email_sweep_failed:boom");
	});

	it("parses partial results with the request path's fallbacks", async () => {
		const { parseLowBalanceEmailSweep, hasLowBalanceEmailActivity } = await import("./low-balance");
		const parsed = parseLowBalanceEmailSweep({ skipped: true, emails: [{ id: "x", workspace_id: "ws", to_email: "a@b.c" }] });
		expect(parsed).toMatchObject({ skipped: true, watched: 0, emailed: 0 });
		expect(parsed.emails[0]).toMatchObject({ firstName: "there", teamName: "your team", balanceUsd: 0 });
		expect(hasLowBalanceEmailActivity(parsed)).toBe(true);
		expect(hasLowBalanceEmailActivity(parseLowBalanceEmailSweep(sweepResult([])))).toBe(false);
	});
});
