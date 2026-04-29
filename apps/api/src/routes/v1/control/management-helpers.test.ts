import { beforeEach, describe, expect, it, vi } from "vitest";

type CountResult = { count: number | null; error: { message?: string } | null };

const state = vi.hoisted(() => ({
	keysCount: 0,
	managementKeysCount: 0,
	workspaceMembershipRows: [] as any[],
	creditLedgerCount: 0,
	bindings: {
		WORKSPACE_KEY_LIMIT: "5",
		NON_ENTERPRISE_KEY_LIMIT: undefined as string | undefined,
	},
}));

function buildSupabaseMock() {
	return {
		from(table: string) {
			if (table === "keys") {
				return {
					select: () => ({
						eq: () => ({
							neq: () => ({
								neq: async (): Promise<CountResult> => ({ count: state.keysCount, error: null }),
							}),
						}),
					}),
				};
			}

			if (table === "management_keys") {
				return {
					select: () => ({
						eq: async (): Promise<CountResult> => ({ count: state.managementKeysCount, error: null }),
					}),
				};
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
