import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { currentPeriodStart } from "@/routes/account/settings-slack";

const mocks = vi.hoisted(() => {
	const state = {
		role: "admin" as string | null,
		rows: [] as Array<Record<string, unknown>>,
		error: null as { message: string } | null,
		rpc: vi.fn(),
	};
	const client = {
		from: () => ({
			select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null, error: null }) }) }),
		}),
		rpc: async (name: string, args: unknown) => {
			state.rpc(name, args);
			return state.error ? { data: null, error: state.error } : { data: state.rows, error: null };
		},
	};
	return { state, client };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "staff-1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));

import { internalSlackAgentRouter } from "./internal-slack-agent";

const app = new Hono<{ Bindings: Env }>().route("/", internalSlackAgentRouter);
const list = (query = "", headers: Record<string, string> = {}) =>
	app.request(`https://example.com/slack-agent/installations${query}`, { headers }, {} as Env);

function row(overrides: Record<string, unknown> = {}) {
	return {
		installation_id: "inst-1", workspace_id: "ws-1", workspace_name: "Acme", team_id: "T0ACME0001", team_name: "Acme Slack",
		enterprise_id: null, custom_app: false, slack_app_id: null, status: "active", installed_at: "2026-10-26T10:00:00Z",
		uninstalled_at: null, plan_people: 10, monthly_cap_nanos: "25000000000", people: 12, answers: "4000",
		model_requests: "321", model_cost_nanos: "12500000000", total: "2", ...overrides,
	};
}

describe("internal Slack agent installations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(mocks.state, { role: "admin", rows: [], error: null });
	});

	it("is for Phaseo admins only", async () => {
		mocks.state.role = "member";
		const response = await list();
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toContain("no-store");
		mocks.state.role = null;
		expect((await list()).status).toBe(403);
		mocks.state.role = "admin";
		expect((await list("", { "sec-fetch-site": "cross-site" })).status).toBe(403);
		expect(mocks.state.rpc).not.toHaveBeenCalled();
	});

	it("lists installations with this month's sums from the database and the estimated charge", async () => {
		mocks.state.rows = [
			row(),
			row({ installation_id: "inst-0", workspace_name: null, custom_app: true, slack_app_id: "A0COMPANY01", status: "uninstalled",
				uninstalled_at: "2026-10-20T00:00:00Z", monthly_cap_nanos: "1000000000", people: 0, answers: 0, model_requests: 0, model_cost_nanos: "0" }),
		];
		const response = await list();
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(mocks.state.rpc).toHaveBeenCalledWith("list_slack_agent_installations", { p_period_start: currentPeriodStart(), p_limit: 100, p_offset: 0 });
		const body = await response.json() as any;
		expect(body).toMatchObject({ period_start: currentPeriodStart(), offset: 0, page_size: 100, total: 2 });
		expect(body.installations[0]).toEqual({
			id: "inst-1", workspace_id: "ws-1", workspace_name: "Acme", team_id: "T0ACME0001", team_name: "Acme Slack", enterprise_id: null,
			custom_app: false, slack_app_id: null, status: "active", installed_at: "2026-10-26T10:00:00Z", uninstalled_at: null, plan_people: 10,
			// 12 people is the 25-person plan ($4.99), and 4,000 answers is 400 over the 3,600 included ($0.10).
			month: { people: 12, answers: 4000, estimated_charge_usd: 5.09, model_requests: 321, model_spend_usd: 12.5 },
		});
		expect(body.installations[1]).toMatchObject({
			id: "inst-0", workspace_name: null, custom_app: true, slack_app_id: "A0COMPANY01", status: "uninstalled",
			month: { people: 0, answers: 0, estimated_charge_usd: 0, model_requests: 0, model_spend_usd: 0 },
		});
	});

	it("caps the estimate at the installation's monthly spending cap", async () => {
		mocks.state.rows = [row({ monthly_cap_nanos: "2000000000" })];
		const body = await (await list()).json() as any;
		expect(body.installations[0].month.estimated_charge_usd).toBe(2);
	});

	it("pages by offset, clamped", async () => {
		await list("?offset=100");
		expect(mocks.state.rpc).toHaveBeenLastCalledWith("list_slack_agent_installations", expect.objectContaining({ p_offset: 100 }));
		await list("?offset=-5");
		expect(mocks.state.rpc).toHaveBeenLastCalledWith("list_slack_agent_installations", expect.objectContaining({ p_offset: 0 }));
		await list("?offset=nope");
		expect(mocks.state.rpc).toHaveBeenLastCalledWith("list_slack_agent_installations", expect.objectContaining({ p_offset: 0 }));
		const body = await (await list("?offset=99999999")).json() as any;
		expect(body).toMatchObject({ offset: 100_000, total: 0, installations: [] });
	});

	it("returns 503 when the database can't answer", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		mocks.state.error = { message: "timeout" };
		expect((await list()).status).toBe(503);
		errors.mockRestore();
	});
});
