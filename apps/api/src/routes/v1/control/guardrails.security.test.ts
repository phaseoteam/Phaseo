import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	guardrailRows: [] as Array<Record<string, unknown> | null>,
	deleteCalls: [] as Array<{ table: string; filters: Array<{ column: string; value: unknown }> }>,
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

function buildSupabaseMock() {
	return {
		from(table: string) {
			if (table === "workspace_guardrails") {
				const filters: Array<{ column: string; value: unknown }> = [];
				return {
					select: () => ({
						eq: (column: string, value: unknown) => {
							filters.push({ column, value });
							return {
								eq: (nextColumn: string, nextValue: unknown) => {
									filters.push({ column: nextColumn, value: nextValue });
									return {
										maybeSingle: async () => ({
											data: state.guardrailRows.shift() ?? null,
											error: null,
										}),
									};
								},
							};
						},
					}),
					delete: () => {
						const deleteFilters: Array<{ column: string; value: unknown }> = [];
						state.deleteCalls.push({ table, filters: deleteFilters });
						const query: any = {
							eq: (column: string, value: unknown) => {
								deleteFilters.push({ column, value });
								return deleteFilters.length >= 2 ? Promise.resolve({ error: null }) : query;
							},
						};
						return query;
					},
				};
			}

			if (table === "key_guardrails" || table === "workspace_member_guardrails") {
				return {
					delete: () => {
						const filters: Array<{ column: string; value: unknown }> = [];
						state.deleteCalls.push({ table, filters });
						const query: any = {
							eq: (column: string, value: unknown) => {
								filters.push({ column, value });
								return query;
							},
							then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
						};
						return query;
					},
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => buildSupabaseMock(),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: {
			workspaceId: "ws_attacker",
			apiKeyId: "mgmt_1",
			authMethod: "api_key",
			scopes: ["guardrails:delete"],
		},
	})),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("guardrail management security", () => {
	beforeEach(() => {
		state.guardrailRows.length = 0;
		state.deleteCalls.length = 0;
		vi.resetModules();
	});

	it("does not delete dependent guardrail rows before workspace ownership is proven", async () => {
		const { guardrailsRoutes } = await import("./guardrails");
		const response = await guardrailsRoutes.request("https://example.com/gr_victim", { method: "DELETE" });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toMatchObject({ error: "not_found" });
		expect(state.deleteCalls).toEqual([]);
	});

	it("cleans up dependent rows after the guardrail belongs to the caller workspace", async () => {
		state.guardrailRows.push({ id: "gr_owned", workspace_id: "ws_attacker", name: "Owned" });

		const { guardrailsRoutes } = await import("./guardrails");
		const response = await guardrailsRoutes.request("https://example.com/gr_owned", { method: "DELETE" });

		expect(response.status).toBe(200);
		expect(state.deleteCalls.map((call) => call.table)).toEqual([
			"key_guardrails",
			"workspace_member_guardrails",
			"workspace_guardrails",
		]);
		expect(state.deleteCalls[2].filters).toEqual([
			{ column: "workspace_id", value: "ws_attacker" },
			{ column: "id", value: "gr_owned" },
		]);
	});
});
