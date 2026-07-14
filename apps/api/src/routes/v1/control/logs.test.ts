import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	guardResult: null as any,
	rows: [] as Array<Record<string, unknown>>,
	count: 0,
	detail: null as Record<string, unknown> | null,
	filters: [] as Array<{ method: string; column?: string; value?: unknown }>,
	selectedFields: [] as string[],
}));

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function buildQuery() {
	const query: any = {
		select(fields: string) {
			state.selectedFields.push(fields);
			return query;
		},
		eq(column: string, value: unknown) {
			state.filters.push({ method: "eq", column, value });
			return query;
		},
		gte(column: string, value: unknown) {
			state.filters.push({ method: "gte", column, value });
			return query;
		},
		lte(column: string, value: unknown) {
			state.filters.push({ method: "lte", column, value });
			return query;
		},
		order(column: string) {
			state.filters.push({ method: "order", column });
			return query;
		},
		range(from: number, to: number) {
			state.filters.push({ method: "range", value: [from, to] });
			return query;
		},
		limit(value: number) {
			state.filters.push({ method: "limit", value });
			return query;
		},
		maybeSingle: async () => ({ data: state.detail, error: null }),
		then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
			return Promise.resolve({ data: state.rows, error: null, count: state.count }).then(resolve, reject);
		},
	};
	return query;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			if (table !== "gateway_requests") throw new Error(`Unexpected table: ${table}`);
			return buildQuery();
		},
	}),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => state.guardResult),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("logs routes", () => {
	beforeEach(() => {
		state.guardResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false, scopes: ["activity:read"] },
		};
		state.rows = [{
			request_id: "req_1",
			created_at: "2026-07-11T10:00:00.000Z",
			model_id: "gpt-5-mini",
			provider: "openai",
			status_code: 500,
			success: false,
			error_code: "upstream_error",
			error_message: "Bearer abc.def phaseo_v1_sk_KID_secret sk-providersecret123456 api_key=visible https://user:pass@example.com/path?token=visible\u001b[31m",
		}];
		state.count = 1;
		state.detail = state.rows[0];
		state.filters.length = 0;
		state.selectedFields.length = 0;
		vi.resetModules();
	});

	it("applies server-side filters without returning untrusted error text", async () => {
		const { logsRoutes } = await import("./logs");
		const response = await logsRoutes.request("https://example.com/?since=2h&status=5xx&provider=openai&model=gpt-5-mini&endpoint=/v1/responses&request_id=req_1&key_id=key_1&session_id=session_1&error_code=upstream_error&limit=10&offset=5");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.total).toBe(1);
		expect(body.limit).toBe(10);
		expect(body.offset).toBe(5);
		expect(body.data[0].error_message).toBeUndefined();
		expect(state.filters).toEqual(expect.arrayContaining([
			{ method: "eq", column: "workspace_id", value: "ws_1" },
			{ method: "eq", column: "provider", value: "openai" },
			{ method: "eq", column: "model_id", value: "gpt-5-mini" },
			{ method: "eq", column: "endpoint", value: "/v1/responses" },
			{ method: "eq", column: "request_id", value: "req_1" },
			{ method: "eq", column: "key_id", value: "key_1" },
			{ method: "eq", column: "session_id", value: "session_1" },
			{ method: "eq", column: "error_code", value: "upstream_error" },
			{ method: "gte", column: "status_code", value: 500 },
			{ method: "lte", column: "status_code", value: 599 },
			{ method: "range", value: [5, 14] },
		]));
		expect(state.selectedFields[0]).not.toContain("*");
		expect(state.selectedFields[0]).not.toContain("request_payload");
		expect(state.selectedFields[0]).not.toContain("trace_data");
		expect(state.selectedFields[0]).not.toContain("error_message");
		expect(state.selectedFields[0]).not.toContain("session_id");
	});

	it("rejects invalid time and status filters", async () => {
		const { logsRoutes } = await import("./logs");
		const invalidTime = await logsRoutes.request("https://example.com/?since=forever");
		const excessiveRange = await logsRoutes.request("https://example.com/?from=2025-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z");
		const invalidStatus = await logsRoutes.request("https://example.com/?status=failed-ish");

		expect(invalidTime.status).toBe(400);
		expect(excessiveRange.status).toBe(400);
		expect(invalidStatus.status).toBe(400);
	});

	it("rejects cross-workspace access", async () => {
		const { logsRoutes } = await import("./logs");
		const response = await logsRoutes.request("https://example.com/?workspace_id=ws_other");
		expect(response.status).toBe(403);
	});

	it("returns one safe log by request id", async () => {
		const { logsRoutes } = await import("./logs");
		const response = await logsRoutes.request("https://example.com/req_1");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.request_id).toBe("req_1");
		expect(body.data.error_message).toBeUndefined();
		expect(state.filters).toEqual(expect.arrayContaining([
			{ method: "eq", column: "workspace_id", value: "ws_1" },
			{ method: "eq", column: "request_id", value: "req_1" },
			{ method: "limit", value: 1 },
		]));
	});

	it("requires the relevant OAuth scope", async () => {
		state.guardResult = {
			ok: true,
			value: { workspaceId: "ws_1", userId: "user_1", authMethod: "oauth", scopes: [] },
		};
		const { logsRoutes } = await import("./logs");
		const response = await logsRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe("insufficient_scope");
	});

	it("requires management keys to explicitly carry the activity-read scope", async () => {
		state.guardResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false, scopes: [] },
		};
		const { logsRoutes } = await import("./logs");
		const response = await logsRoutes.request("https://example.com/");
		expect(response.status).toBe(403);
	});
});
