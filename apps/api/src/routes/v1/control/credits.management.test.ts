import { beforeEach, describe, expect, it, vi } from "vitest";

type GuardOk = {
	ok: true;
	value: {
		workspaceId: string;
		apiKeyId: string;
		internal?: boolean;
	};
};

const state = vi.hoisted(() => ({
	guardManagementAuthResult: null as GuardOk | { ok: false; response: Response } | null,
	walletRow: null as Record<string, unknown> | null,
	ledgerNet: 0 as number | null,
	ledgerNetError: null as { message: string } | null,
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	requestRows: [] as Array<Record<string, unknown>>,
	requestCount: 0,
}));

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

function buildCreditsSupabaseMock() {
	return {
		async rpc(name: string, args: Record<string, unknown>) {
			state.rpcCalls.push({ name, args });
			if (name === "get_workspace_credit_ledger_net") {
				return { data: state.ledgerNetError ? null : state.ledgerNet, error: state.ledgerNetError };
			}
			throw new Error(`Unexpected rpc: ${name}`);
		},
		from(table: string) {
			if (table === "wallets") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.walletRow,
								error: null,
							}),
						}),
					}),
				};
			}

			if (table === "gateway_requests") {
				const query: any = {
					select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
						if (options?.head) {
							return {
								eq: () => ({
									gte: async () => ({
										count: state.requestCount,
										error: null,
									}),
								}),
							};
						}
						return query;
					},
					eq: () => query,
					gte: () => query,
					order: () => query,
					range: async () => ({
						data: state.requestRows,
						error: null,
					}),
				};
				return query;
			}

			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => buildCreditsSupabaseMock(),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => state.guardManagementAuthResult),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("management credits and activity routes", () => {
	beforeEach(() => {
		state.guardManagementAuthResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false },
		};
		state.walletRow = { balance_nanos: 2_000_000_000, reserved_nanos: 500_000_000 };
		state.ledgerNet = 1_000_000_000;
		state.ledgerNetError = null;
		state.rpcCalls = [];
		state.requestRows = [
			{
				request_id: "req_1",
				provider: "openai",
				model_id: "gpt-5-mini",
				endpoint: "responses",
				usage: { input_tokens: 10, output_tokens: 20 },
				cost_nanos: 12_500_000,
				created_at: "2026-04-28T10:00:00Z",
				latency_ms: 420,
			},
		];
		state.requestCount = 3;
		vi.resetModules();
	});

	it("requires a management key for credits", async () => {
		state.guardManagementAuthResult = {
			ok: false,
			response: json({ error: "management_key_required" }, 401),
		};

		const { creditsRoutes } = await import("./credits");
		const response = await creditsRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe("management_key_required");
	});

	it("returns scoped credit balances for the authenticated workspace", async () => {
		const { creditsRoutes } = await import("./credits");
		const response = await creditsRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			ok: true,
			credits: {
				remaining: 1_500_000_000,
				balance_nanos: 2_000_000_000,
				reserved_nanos: 500_000_000,
				available_nanos: 1_500_000_000,
				thirty_day_usage: 1_000_000_000,
				thirty_day_requests: 3,
			},
		});
	});

	it("sums thirty_day_usage in the database instead of reading ledger rows", async () => {
		// A busy workspace: more ledger rows than PostgREST returns in one page.
		state.ledgerNet = -1_500_000_000_000;
		const before = Date.now();
		const { creditsRoutes } = await import("./credits");
		const response = await creditsRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.credits.thirty_day_usage).toBe(-1_500_000_000_000);
		expect(state.rpcCalls).toHaveLength(1);
		expect(state.rpcCalls[0].name).toBe("get_workspace_credit_ledger_net");
		expect(state.rpcCalls[0].args.p_workspace_id).toBe("ws_1");
		const sinceMs = Date.parse(String(state.rpcCalls[0].args.p_since));
		const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
		expect(sinceMs).toBeGreaterThanOrEqual(before - thirtyDaysMs - 1000);
		expect(sinceMs).toBeLessThanOrEqual(Date.now() - thirtyDaysMs);
	});

	it("reports thirty_day_usage as null when the ledger total cannot be read", async () => {
		state.ledgerNetError = { message: "rpc failed" };
		const { creditsRoutes } = await import("./credits");
		const response = await creditsRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.credits.thirty_day_usage).toBeNull();
		expect(body.credits.balance_nanos).toBe(2_000_000_000);
	});

	it("rejects cross-workspace activity access for non-internal management keys", async () => {
		const { activityRoutes } = await import("./credits");
		const response = await activityRoutes.request("https://example.com/?workspace_id=ws_other");
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe("forbidden");
		expect(body.message).toBe("workspace_id must match authenticated team");
	});

	it("returns paginated activity for internal management keys across workspaces", async () => {
		state.guardManagementAuthResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: true },
		};

		const { activityRoutes } = await import("./credits");
		const response = await activityRoutes.request("https://example.com/?workspace_id=ws_other&limit=10&offset=5&days=7");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			ok: true,
			period_days: 7,
			limit: 10,
			offset: 5,
			total: 3,
			total_cost_cents: 1.25,
			activity: [
				{
					request_id: "req_1",
					provider: "openai",
					model: "gpt-5-mini",
					endpoint: "responses",
					usage: { input_tokens: 10, output_tokens: 20 },
					cost_cents: 1.25,
					latency_ms: 420,
					timestamp: "2026-04-28T10:00:00Z",
				},
			],
		});
	});
});
