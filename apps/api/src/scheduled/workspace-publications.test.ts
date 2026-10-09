import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	claims: [] as Array<Array<{ workspace_id: string; revision: string; lease_id: string }>>,
	finished: [] as Array<Record<string, unknown>>,
	bumped: [] as string[],
	invalidated: [] as string[],
	bumpError: null as Error | null,
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: (name: string, params: Record<string, unknown>) => {
			if (name === "gateway_claim_workspace_publications") {
				const data = state.claims.shift() ?? [];
				return { abortSignal: async () => ({ data, error: null }) };
			}
			state.finished.push(params);
			return Promise.resolve({ data: "completed", error: null });
		},
	}),
}));
vi.mock("@/pipeline/before/workspacePolicy", () => ({
	bumpWorkspacePolicyVersion: async (workspaceId: string) => {
		if (state.bumpError) throw state.bumpError;
		state.bumped.push(workspaceId);
		return 1;
	},
}));
vi.mock("@/pipeline/before/privateModelCache", () => ({
	invalidatePrivateRoutes: async (workspaceId: string) => { state.invalidated.push(workspaceId); },
}));

import { drainWorkspacePublications } from "./workspace-publications";

describe("drainWorkspacePublications", () => {
	beforeEach(() => {
		state.claims = [];
		state.finished = [];
		state.bumped = [];
		state.invalidated = [];
		state.bumpError = null;
	});

	it("bumps the workspace cache version and acknowledges the claimed revision", async () => {
		state.claims = [[{ workspace_id: "ws_1", revision: "rev_1", lease_id: "lease_1" }]];
		expect(await drainWorkspacePublications()).toEqual({ claimed: 1, completed: 1, failed: 0 });
		expect(state.bumped).toEqual(["ws_1"]);
		expect(state.invalidated).toEqual(["ws_1"]);
		expect(state.finished).toEqual([{ p_workspace_id: "ws_1", p_revision: "rev_1", p_lease_id: "lease_1", p_success: true }]);
	});

	it("reports failures so the outbox retries with backoff", async () => {
		state.bumpError = new Error("kv down");
		state.claims = [[{ workspace_id: "ws_2", revision: "rev_2", lease_id: "lease_2" }]];
		expect(await drainWorkspacePublications()).toEqual({ claimed: 1, completed: 0, failed: 1 });
		expect(state.finished[0]).toMatchObject({ p_success: false });
	});

	it("does nothing beyond one claim call when the outbox is empty", async () => {
		expect(await drainWorkspacePublications()).toEqual({ claimed: 0, completed: 0, failed: 0 });
		expect(state.finished).toHaveLength(0);
	});
});
