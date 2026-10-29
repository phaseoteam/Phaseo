import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000009";
const RULE = "00000000-0000-4000-8000-000000000002";
const ELSEWHERE = "00000000-0000-4000-8000-000000000008";
const KEY = "00000000-0000-4000-8000-000000000003";
const DEST = "00000000-0000-4000-8000-000000000004";
const USER = "00000000-0000-4000-8000-000000000005";
const ALL_SCOPES = ["spend_rules:read", "spend_rules:write", "spend_rules:delete"];

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key", scopes: [] as string[], userId: null as string | null } } as any,
	tables: {} as Record<string, any[]>,
	rpc: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
	audit: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
	test: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
	bindings: {} as Record<string, string>,
}));

function tableQuery(table: string, operation: "select" | "update", payload?: Record<string, unknown>) {
	const filters: Array<(row: any) => boolean> = [];
	const rows = () => (state.tables[table] ??= []);
	const run = () => {
		const found = rows().filter((row) => filters.every((filter) => filter(row)));
		if (operation === "update") found.forEach((row) => Object.assign(row, payload));
		return { data: found, error: null };
	};
	const query: any = {
		select: () => query,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
		is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return query; },
		order: () => query,
		limit: () => query,
		maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
		then(resolve: (value: unknown) => unknown) { return Promise.resolve(run()).then(resolve); },
	};
	return query;
}

vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => state.bindings,
	getSupabaseAdmin: () => ({
		from: (table: string) => ({
			select: () => tableQuery(table, "select"),
			update: (payload: Record<string, unknown>) => tableQuery(table, "update", payload),
		}),
		rpc: (...args: unknown[]) => state.rpc(...args),
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: (...args: unknown[]) => state.audit(...args) }));
vi.mock("@/pipeline/notifications/spend-rule-test", async () => {
	class SpendRuleTestError extends Error {
		constructor(readonly status: number, readonly code: string, message: string, readonly retryAfterSeconds?: number) { super(message); }
	}
	return { SpendRuleTestError, sendSpendRuleTest: (...args: unknown[]) => state.test(...args) };
});
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

async function call(path: string, method = "GET", body?: unknown) {
	const { spendRulesRoutes } = await import("./spend-rules");
	return spendRulesRoutes.request(`https://api.phaseo.app${path}`, {
		method,
		...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
	});
}

function row(id: string, workspaceId: string, extra: Record<string, unknown> = {}) {
	return {
		id, workspace_id: workspaceId, name: "Monthly", enabled: true, metric: "budget_percent", scope_type: "workspace", scope_id: null,
		period: "month", window_hours: null, time_zone: null, base_kind: "amount", base_ref: null, base_amount_nanos: "100000000000",
		threshold_percents: [50, 80, 100], threshold_amount_nanos: null, runway_days: null, spike_multiplier: null, spike_floor_nanos: null,
		action: "notify", block_at_percent: 110, block_at_amount_nanos: null, block_free_models: false, cooldown_minutes: 360,
		created_by: null, created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z", deleted_at: null,
		workspace_spend_rule_destinations: [{ destination_id: DEST }],
		...extra,
	};
}

/** save_workspace_spend_rule as the database answers: the row it wrote plus its destinations. */
function saveResponse(args: any) {
	const { workspace_spend_rule_destinations: _links, deleted_at: _deleted, ...base } = row(args.p_rule_id ?? "00000000-0000-4000-8000-000000000100", args.p_workspace_id);
	return { data: { rule: { ...base, ...args.p_rule }, destination_ids: args.p_destination_ids ?? [DEST] }, error: null };
}

describe("spend rules management API", () => {
	beforeEach(() => {
		state.bindings = {};
		state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", scopes: [...ALL_SCOPES], userId: null } };
		state.tables = {
			workspace_spend_rules: [row(RULE, WORKSPACE), row(ELSEWHERE, OTHER_WORKSPACE), row("00000000-0000-4000-8000-000000000007", WORKSPACE, { deleted_at: "2026-10-20T00:00:00Z" })],
			workspace_members: [{ workspace_id: WORKSPACE, user_id: USER, role: "member" }],
		};
		state.rpc = vi.fn(async (name: string, args: any) => (name === "save_workspace_spend_rule" ? saveResponse(args) : { data: null, error: null }));
		state.audit = vi.fn(async () => true);
		state.test = vi.fn();
	});

	describe("authorisation", () => {
		it("passes through a failed management key check", async () => {
			state.auth = { ok: false, response: new Response("nope", { status: 401 }) };
			expect((await call("/")).status).toBe(401);
		});

		it("needs spend_rules:write to create and spend_rules:delete to delete", async () => {
			state.auth.value.scopes = ["spend_rules:read"];
			expect((await call("/")).status).toBe(200);
			const create = await call("/", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5 });
			expect(create.status).toBe(403);
			expect(await create.json()).toMatchObject({ error: "insufficient_scope", message: "Token requires spend_rules:write" });
			state.auth.value.scopes = ["spend_rules:read", "spend_rules:write"];
			expect((await call(`/${RULE}`, "DELETE")).status).toBe(403);
			expect(state.rpc).not.toHaveBeenCalled();
		});

		it("lets OAuth members read but not write", async () => {
			state.auth.value = { workspaceId: WORKSPACE, authMethod: "oauth", oauthClientId: "phaseo_cli", scopes: [...ALL_SCOPES], oauthScopes: [], userId: USER };
			expect((await call("/")).status).toBe(200);
			expect((await call(`/${RULE}/preview`)).status).toBe(200);
			const write = await call(`/${RULE}`, "PATCH", { enabled: false });
			expect(write.status).toBe(403);
			expect(await write.json()).toMatchObject({ message: "Workspace role must be one of: owner, admin" });
			expect((await call(`/${RULE}/test`, "POST")).status).toBe(403);
			expect(state.test).not.toHaveBeenCalled();
		});

		it("rejects ids that are not uuids", async () => {
			expect((await call("/not-a-rule")).status).toBe(400);
			expect((await call("/not-a-rule/preview")).status).toBe(400);
		});
	});

	it("lists the caller's live rules with USD amounts, destinations and whether they are evaluated", async () => {
		state.tables.workspace_spend_rules.push(row("00000000-0000-4000-8000-000000000006", WORKSPACE, {
			metric: "spike", period: "rolling", window_hours: 6, base_kind: null, base_amount_nanos: null, threshold_percents: null,
			spike_multiplier: "3.00", spike_floor_nanos: "5000000000", workspace_spend_rule_destinations: [],
		}));
		const response = await call("/");
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.max_rules).toBe(50);
		expect(body.data.map((rule: any) => rule.id)).toEqual([RULE, "00000000-0000-4000-8000-000000000006"]);
		expect(body.data[0]).toMatchObject({ base_amount_nanos: 100e9, base_amount_usd: 100, destination_ids: [DEST], evaluated: true });
		expect(body.data[1]).toMatchObject({ metric: "spike", evaluated: false, spike_multiplier: 3, spike_floor_usd: 5, destination_ids: [] });
		expect(body.data[0]).not.toHaveProperty("workspace_spend_rule_destinations");
	});

	describe("create", () => {
		it("validates every field and mirrors the table's checks with clear messages", async () => {
			const cases: Array<[Record<string, unknown>, string]> = [
				[{ metric: "spend", period: "day", threshold_amount_usd: 5 }, "name is required"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, colour: "red" }, "Unknown field: colour"],
				[{ name: "x", metric: "cost", period: "day" }, "metric must be one of: spend, budget_percent, forecast, spike, balance"],
				[{ name: "x", metric: "spend", period: "day" }, "threshold_amount_usd (or threshold_amount_nanos) is required for spend rules"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, threshold_amount_nanos: 5e9 }, "Provide threshold_amount_usd or threshold_amount_nanos, not both"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 0 }, "threshold_amount_usd must be a USD amount more than zero, or null"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "amount", base_amount_usd: 100, threshold_percents: [50, 0] }, "threshold_percents must be 1 to 5 whole percentages from 1 to 1000, or null"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "amount", base_amount_usd: 100, threshold_percents: [1, 2, 3, 4, 5, 6] }, "threshold_percents must be 1 to 5 whole percentages from 1 to 1000, or null"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "workspace_budget", base_ref: "daily", threshold_percents: [50] }, "base_ref must be monthly for a month period"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "key_limit", base_ref: "monthly", threshold_percents: [50] }, "A key_limit base needs the key scope"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, time_zone: "Mars/Olympus" }, "time_zone must be an IANA time zone such as Europe/London, or null to use the workspace's billing time zone"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, scope_type: "key", scope_id: "prod" }, "scope_id must be the key id (a uuid)"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, scope_type: "model" }, "scope_id is required for the model scope"],
				[{ name: "x", metric: "spend", period: "rolling", threshold_amount_usd: 5 }, "window_hours (1 to 720) is required for rolling rules"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, window_hours: 6 }, "window_hours is only used by rolling rules; set it to null"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, action: "block" }, "block_at_amount_usd (or block_at_amount_nanos) is required for spend rules that block"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, action: "block", block_at_amount_usd: 4 }, "block_at_amount must be at least threshold_amount"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "amount", base_amount_usd: 100, threshold_percents: [50, 120], action: "block" }, "block_at_percent must be at least the highest of threshold_percents"],
				[{ name: "x", metric: "budget_percent", period: "month", base_kind: "previous_period", threshold_percents: [150], action: "block", block_at_percent: 200 }, "Rules with a previous_period base cannot block"],
				[{ name: "x", metric: "forecast", period: "month", threshold_amount_usd: 5, action: "block" }, "Only spend and budget_percent rules can block"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, action: "block", block_at_amount_usd: 6 }, "action block is not available yet; use notify"],
				[{ name: "x", metric: "forecast", period: "rolling", window_hours: 2, threshold_amount_usd: 5 }, "forecast rules need a day, week or month period"],
				[{ name: "x", metric: "forecast", period: "month" }, "forecast rules need either threshold_amount, or base_kind with threshold_percents"],
				[{ name: "x", metric: "spike", period: "day" }, "spike rules need the rolling period (window_hours is the spike window)"],
				[{ name: "x", metric: "balance", period: "rolling", window_hours: 24, scope_type: "key", scope_id: KEY, threshold_amount_usd: 5 }, "balance rules need the workspace scope"],
				[{ name: "x", metric: "balance", period: "rolling", window_hours: 24 }, "balance rules need threshold_amount, runway_days, or both"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, runway_days: 3 }, "runway_days is not used by spend rules; set it to null"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, cooldown_minutes: 1 }, "cooldown_minutes must be a whole number from 5 to 43200"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, destination_ids: Array.from({ length: 51 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`) }, "destination_ids must be an array of at most 50 notification destination ids"],
				[{ name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, destination_ids: ["slack"] }, "destination_ids must be an array of at most 50 notification destination ids"],
				[{ name: " ", metric: "spend", period: "day", threshold_amount_usd: 5 }, "name must be 1 to 100 characters"],
			];
			for (const [body, message] of cases) {
				const response = await call("/", "POST", body);
				expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error: "bad_request", message } });
			}
			expect(state.rpc).not.toHaveBeenCalled();
		});

		it("saves the whole rule with defaults and its destinations in one call, and audits it", async () => {
			const response = await call("/", "POST", {
				name: " Prod key ", metric: "budget_percent", period: "day", scope_type: "key", scope_id: KEY.toUpperCase(),
				base_kind: "key_limit", base_ref: "daily", threshold_percents: [100, 50, 80, 50], time_zone: "Europe/London", destination_ids: [DEST, DEST],
			});
			expect(response.status).toBe(201);
			expect(state.rpc).toHaveBeenCalledWith("save_workspace_spend_rule", {
				p_workspace_id: WORKSPACE,
				p_rule_id: null,
				p_rule: expect.objectContaining({
					name: "Prod key", enabled: true, metric: "budget_percent", scope_type: "key", scope_id: KEY, period: "day", window_hours: null,
					time_zone: "Europe/London", base_kind: "key_limit", base_ref: "daily", base_amount_nanos: null, threshold_percents: [50, 80, 100],
					threshold_amount_nanos: null, spike_multiplier: null, spike_floor_nanos: null, action: "notify", block_at_percent: 110,
					block_at_amount_nanos: null, block_free_models: false, cooldown_minutes: 360,
				}),
				p_destination_ids: [DEST],
				p_actor_user_id: null,
			});
			const body = await response.json() as any;
			expect(body.data).toMatchObject({ name: "Prod key", threshold_percents: [50, 80, 100], destination_ids: [DEST], evaluated: true });
			expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
				workspaceId: WORKSPACE, action: "spend_rule.created", targetType: "spend_rule", targetName: "Prod key",
				metadata: expect.objectContaining({ metric: "budget_percent", scope_type: "key", destination_count: 1 }),
			}));
		});

		it("accepts a block rule only while the gateway enforces blocks", async () => {
			const body = { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, action: "block", block_at_amount_usd: 6 };
			expect((await call("/", "POST", body)).status).toBe(400);
			expect(state.rpc).not.toHaveBeenCalled();
			state.bindings = { SPEND_RULE_BLOCKS_ENABLED: "true" };
			expect((await call("/", "POST", body)).status).toBe(201);
			expect(state.rpc.mock.calls[0][1].p_rule).toMatchObject({ action: "block", block_at_amount_nanos: 6_000_000_000 });
		});

		it("takes amounts in USD or exact nanos, and creates with no destinations by default", async () => {
			await call("/", "POST", { name: "x", metric: "spend", period: "month", threshold_amount_nanos: "12345678901" });
			await call("/", "POST", { name: "y", metric: "spend", period: "month", threshold_amount_usd: 20.5 });
			const args = state.rpc.mock.calls[0][1];
			expect(args.p_rule).toMatchObject({ threshold_amount_nanos: 12_345_678_901 });
			expect(state.rpc.mock.calls[1][1].p_rule).toMatchObject({ threshold_amount_nanos: 20_500_000_000 });
			expect(args.p_destination_ids).toEqual([]);
		});

		it("accepts every metric the table allows; later metrics come back with evaluated false, balance rules with true", async () => {
			const spike = await call("/", "POST", { name: "Spike", metric: "spike", period: "rolling", window_hours: 6 });
			expect(spike.status).toBe(201);
			expect(state.rpc.mock.calls[0][1].p_rule).toMatchObject({ spike_multiplier: 3, spike_floor_nanos: 5_000_000_000, cooldown_minutes: 360 });
			expect((await spike.json() as any).data).toMatchObject({ evaluated: false, spike_floor_usd: 5 });
			for (const body of [
				{ name: "Forecast", metric: "forecast", period: "month", base_kind: "previous_period", threshold_percents: [120] },
				{ name: "Rolling", metric: "spend", period: "rolling", window_hours: 24, threshold_amount_usd: 50, cooldown_minutes: 60 },
			]) {
				const response = await call("/", "POST", body);
				expect(response.status).toBe(201);
				expect((await response.json() as any).data.evaluated).toBe(false);
			}
			const balance = await call("/", "POST", { name: "Balance", metric: "balance", period: "rolling", window_hours: 168, runway_days: 7 });
			expect(balance.status).toBe(201);
			expect((await balance.json() as any).data.evaluated).toBe(true);
		});

		it("maps database errors to 400 and 409", async () => {
			const cases: Array<[{ code?: string; message: string }, number, string]> = [
				[{ code: "23514", message: "spend_rule_limit_reached" }, 409, "spend_rule_limit_reached"],
				[{ code: "22023", message: "invalid_time_zone" }, 400, "bad_request"],
				[{ code: "22023", message: "invalid_spend_rule_scope_id" }, 400, "bad_request"],
				[{ code: "23503", message: "notification_destination_not_found" }, 400, "bad_request"],
				[{ code: "23503", message: 'insert or update on table "workspace_spend_rules" violates foreign key constraint "workspace_spend_rules_key_fkey"' }, 400, "bad_request"],
				[{ code: "23514", message: 'new row for relation "workspace_spend_rules" violates check constraint "workspace_spend_rules_base_check"' }, 400, "bad_request"],
			];
			for (const [error, status, code] of cases) {
				state.rpc.mockResolvedValueOnce({ data: null, error });
				const response = await call("/", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5 });
				expect(response.status).toBe(status);
				expect((await response.json() as any).error).toBe(code);
			}
			state.rpc.mockResolvedValueOnce({ data: null, error: { code: "23503", message: 'violates foreign key constraint "workspace_spend_rules_key_fkey"' } });
			const fk = await call("/", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, scope_type: "key", scope_id: KEY });
			expect((await fk.json() as any).message).toBe("scope_id must be an API key in this workspace");
			state.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
			expect((await call("/", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5 })).status).toBe(500);
			expect(state.audit).not.toHaveBeenCalled();
		});
	});

	describe("update", () => {
		it("merges the change over the stored rule, keeps destinations unless given, and audits", async () => {
			const response = await call(`/${RULE}`, "PATCH", { threshold_percents: [90], enabled: false });
			expect(response.status).toBe(200);
			expect(state.rpc).toHaveBeenCalledWith("save_workspace_spend_rule", expect.objectContaining({
				p_rule_id: RULE,
				p_rule: expect.objectContaining({ name: "Monthly", metric: "budget_percent", base_kind: "amount", base_amount_nanos: 100e9, threshold_percents: [90], enabled: false }),
				p_destination_ids: null,
			}));
			expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "spend_rule.updated", metadata: expect.objectContaining({ changed: ["enabled", "threshold_percents"] }) }));
		});

		it("lets a rule that already blocks be edited while blocks are off, but not a switch to block", async () => {
			state.tables.workspace_spend_rules[0] = row(RULE, WORKSPACE, { action: "block", block_at_percent: 120 });
			expect((await call(`/${RULE}`, "PATCH", { name: "Renamed" })).status).toBe(200);
			state.tables.workspace_spend_rules[0] = row(RULE, WORKSPACE);
			const refused = await call(`/${RULE}`, "PATCH", { action: "block", block_at_percent: 120 });
			expect({ status: refused.status, body: await refused.json() }).toEqual({ status: 400, body: { error: "bad_request", message: "action block is not available yet; use notify" } });
		});

		it("checks the merged rule, clears fields the rule stops using, and needs a change", async () => {
			const switched = await call(`/${RULE}`, "PATCH", { metric: "spend", threshold_amount_usd: 10 });
			expect(await switched.json()).toEqual({ error: "bad_request", message: "base_kind is not used by spend rules; set it to null" });
			state.tables.workspace_spend_rules[0] = row(RULE, WORKSPACE, {
				metric: "spend", base_kind: null, base_amount_nanos: null, threshold_percents: null, threshold_amount_nanos: "10000000000",
				action: "block", block_at_amount_nanos: "20000000000",
			});
			expect((await call(`/${RULE}`, "PATCH", { action: "notify" })).status).toBe(200);
			expect(state.rpc.mock.calls[0][1].p_rule).toMatchObject({ action: "notify", block_at_amount_nanos: null });
			expect(await (await call(`/${RULE}`, "PATCH", {})).json()).toEqual({ error: "bad_request", message: "Provide at least one field to update" });
		});

		it("is 404 for a deleted rule or another workspace's rule", async () => {
			expect((await call("/00000000-0000-4000-8000-000000000007", "PATCH", { enabled: false })).status).toBe(404);
			expect((await call(`/${ELSEWHERE}`, "PATCH", { enabled: false })).status).toBe(404);
			expect(state.rpc).not.toHaveBeenCalled();
		});
	});

	it("gets one rule, 404 when deleted or elsewhere", async () => {
		expect(((await (await call(`/${RULE}`)).json()) as any).data).toMatchObject({ id: RULE, destination_ids: [DEST] });
		expect((await call(`/${ELSEWHERE}`)).status).toBe(404);
		expect((await call("/00000000-0000-4000-8000-000000000007")).status).toBe(404);
	});

	it("soft-deletes and audits; a second delete is 404", async () => {
		const response = await call(`/${RULE}`, "DELETE");
		expect(await response.json()).toEqual({ data: { id: RULE, deleted: true } });
		expect(state.tables.workspace_spend_rules[0].deleted_at).toEqual(expect.any(String));
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "spend_rule.deleted", targetId: RULE }));
		expect((await call(`/${RULE}`, "DELETE")).status).toBe(404);
	});

	describe("test send", () => {
		it("sends and audits the test", async () => {
			state.test.mockResolvedValue({ rule_id: RULE, rule_name: "Monthly", test: true, title: "[TEST] x", message: "y", source: "routes", delivered: 1, failed: 0, deliveries: [] });
			const response = await call(`/${RULE}/test`, "POST");
			expect(response.status).toBe(200);
			expect(state.test).toHaveBeenCalledWith({ workspaceId: WORKSPACE, ruleId: RULE });
			expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
				action: "spend_rule.tested", targetName: "Monthly", metadata: { source: "routes", delivered: 1, failed: 0 },
			}));
		});

		it("answers 429 with Retry-After once the workspace's tests for the minute are used", async () => {
			const { SpendRuleTestError } = await import("@/pipeline/notifications/spend-rule-test");
			state.test.mockRejectedValue(new SpendRuleTestError(429, "rate_limited", "A workspace can send at most 5 spend rule tests a minute", 17));
			const response = await call(`/${RULE}/test`, "POST");
			expect(response.status).toBe(429);
			expect(response.headers.get("Retry-After")).toBe("17");
			expect(await response.json()).toEqual({ error: "rate_limited", message: "A workspace can send at most 5 spend rule tests a minute" });
			expect(state.audit).not.toHaveBeenCalled();
			state.test.mockRejectedValue(new SpendRuleTestError(409, "no_notification_destinations", "none"));
			expect((await call(`/${RULE}/test`, "POST")).status).toBe(409);
		});
	});

	it("previews with USD amounts; 404 for an unknown rule", async () => {
		state.rpc.mockResolvedValueOnce({ data: {
			rule_id: RULE, metric: "budget_percent", evaluated: true, computed_at: "2026-10-21T12:00:00Z", time_zone: "UTC",
			period: { kind: "month", start: "2026-10-01T00:00:00+00:00", end: "2026-11-01T00:00:00+00:00" },
			value_nanos: 59e9, base_kind: "amount", base_ref: null, base_nanos: 100e9, percent: 59, threshold_percents: [50, 80, 100],
			threshold_amount_nanos: null, reached_threshold_percent: 50, next_threshold: { percent: 80, amount_nanos: 80e9 }, block_at_nanos: null,
			state: null, alert: { scope_label: "Acme", title: "Monthly: 50% of $100.00 reached", message: "…" },
		}, error: null });
		const body = await (await call(`/${RULE}/preview`)).json() as any;
		expect(state.rpc).toHaveBeenCalledWith("preview_workspace_spend_rule", { p_workspace_id: WORKSPACE, p_rule_id: RULE });
		expect(body.data).toMatchObject({ value_usd: 59, base_usd: 100, next_threshold: { percent: 80, amount_nanos: 80e9, amount_usd: 80 }, block_at_usd: null });
		state.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "spend_rule_not_found" } });
		expect((await call(`/${RULE}/preview`)).status).toBe(404);
	});

	it("pages history in SQL and validates the page", async () => {
		state.rpc.mockResolvedValueOnce({ data: { events: [{ id: "e1", kind: "spend_alert", created_at: "2026-10-21T12:00:00Z", value_nanos: 59e9, deliveries: { sent: 1, failed: 0, pending: 0 } }], has_more: true, periods: [] }, error: null });
		const body = await (await call(`/${RULE}/history?limit=1&offset=2`)).json() as any;
		expect(state.rpc).toHaveBeenCalledWith("list_workspace_spend_rule_history", { p_workspace_id: WORKSPACE, p_rule_id: RULE, p_limit: 1, p_offset: 2 });
		expect(body.data).toMatchObject({ has_more: true, events: [{ id: "e1", value_usd: 59, deliveries: { sent: 1, failed: 0, pending: 0 } }] });
		expect(await (await call(`/${RULE}/history?limit=101`)).json()).toEqual({ error: "bad_request", message: "limit must be a whole number from 1 to 100" });
		expect((await call(`/${RULE}/history?offset=-1`)).status).toBe(400);
		state.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "spend_rule_not_found" } });
		expect((await call(`/${RULE}/history`)).status).toBe(404);
	});
});
