import { beforeEach, describe, expect, it, vi } from "vitest";

type CountResult = { count: number | null; error: { message?: string } | null };

const state = vi.hoisted(() => ({
	keysCount: 0,
	managementKeysCount: 0,
	keyQueryCalls: [] as Array<{ method: string; args: unknown[] }>,
	managementKeyQueryCalls: [] as Array<{ method: string; args: unknown[] }>,
	workspaceMembershipRows: [] as any[],
	creditLedgerCount: 0,
	bindings: {
		WORKSPACE_KEY_LIMIT: "5",
		NON_ENTERPRISE_KEY_LIMIT: undefined as string | undefined,
	},
}));

function buildCountQuery(
	count: number,
	queryCalls: Array<{ method: string; args: unknown[] }>,
) {
	const query: any = {
		select: (...args: unknown[]) => {
			queryCalls.push({ method: "select", args });
			return query;
		},
		eq: (...args: unknown[]) => {
			queryCalls.push({ method: "eq", args });
			return query;
		},
		neq: (...args: unknown[]) => {
			queryCalls.push({ method: "neq", args });
			return query;
		},
		or: (...args: unknown[]) => {
			queryCalls.push({ method: "or", args });
			return query;
		},
		then: (resolve: (result: CountResult) => unknown, reject?: (error: unknown) => unknown) =>
			Promise.resolve({ count, error: null }).then(resolve, reject),
	};
	return query;
}

function buildSupabaseMock() {
	return {
		from(table: string) {
			if (table === "keys") {
				return buildCountQuery(state.keysCount, state.keyQueryCalls);
			}

			if (table === "management_keys") {
				return buildCountQuery(state.managementKeysCount, state.managementKeyQueryCalls);
			}

			if (table === "workspace_members") {
				return {
					select: () => ({
						eq: () => Promise.resolve({ data: state.workspaceMembershipRows, error: null }),
					}),
				};
			}

			if (table === "credit_ledger") {
				return {
					select: () => ({
						in: () => ({
							in: () => ({
								in: () => ({
									gt: async (): Promise<CountResult> => ({ count: state.creditLedgerCount, error: null }),
								}),
							}),
						}),
					}),
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => buildSupabaseMock(),
}));

describe("management helpers", () => {
	beforeEach(() => {
		state.keysCount = 0;
		state.managementKeysCount = 0;
		state.keyQueryCalls = [];
		state.managementKeyQueryCalls = [];
		state.workspaceMembershipRows = [];
		state.creditLedgerCount = 0;
		state.bindings.WORKSPACE_KEY_LIMIT = "5";
		vi.resetModules();
	});

	it("enforces the combined workspace key cap across API and management keys", async () => {
		state.keysCount = 3;
		state.managementKeysCount = 2;

		const { enforceWorkspaceKeyLimit } = await import("./management-helpers");

		await expect(enforceWorkspaceKeyLimit("ws_1")).rejects.toThrow(
			"Key limit reached (5) for this workspace. Delete an existing key to create a new one.",
		);

		expect(state.keyQueryCalls).toEqual(
			expect.arrayContaining([
				{ method: "eq", args: ["workspace_id", "ws_1"] },
				{ method: "eq", args: ["status", "active"] },
				{ method: "eq", args: ["soft_blocked", false] },
				{ method: "neq", args: ["name", "__chat_route_managed_key__"] },
			]),
		);
		expect(state.managementKeyQueryCalls).toEqual(
			expect.arrayContaining([
				{ method: "eq", args: ["workspace_id", "ws_1"] },
				{ method: "eq", args: ["status", "active"] },
				{ method: "eq", args: ["soft_blocked", false] },
			]),
		);
		expect(state.keyQueryCalls.find((call) => call.method === "or")?.args[0]).toMatch(
			/^expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/,
		);
		expect(state.managementKeyQueryCalls.find((call) => call.method === "or")?.args[0]).toBe(
			state.keyQueryCalls.find((call) => call.method === "or")?.args[0],
		);
	});

	it("detects paid workspace access from successful top-up ledger entries", async () => {
		state.workspaceMembershipRows = [
			{ workspace_id: "ws_1", role: "owner" },
			{ workspace_id: "ws_2", role: "member" },
		];
		state.creditLedgerCount = 1;

		const { userHasPaidWorkspaceAccess } = await import("./management-helpers");
		const result = await userHasPaidWorkspaceAccess("user_1");

		expect(result).toBe(true);
	});
});
