import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	key: { created_by: "user_1", workspace_id: "ws_1", status: "active" } as Record<string, unknown> | null,
	preset: { created_by: "user_1", visibility: "private" } as Record<string, unknown> | null,
	queries: 0,
	background: [] as Promise<unknown>[],
}));

function query(table: string) {
	const chain: any = {
		select: () => chain,
		eq: () => chain,
		is: () => chain,
		maybeSingle: async () => {
			state.queries += 1;
			return { data: table === "keys" ? state.key : state.preset, error: null };
		},
	};
	return chain;
}

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getSupabaseAdmin: () => ({ from: (table: string) => query(table) }),
	dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
	getBindingsIfConfigured: () => null,
}));

import { assertPresetAccess } from "./context";
import { __resetTieredCacheForTests } from "@/core/tiered-cache";

const args = { workspaceId: "ws_1", apiKeyId: "key_1", model: "@team-preset" };

describe("assertPresetAccess", () => {
	beforeEach(() => {
		__resetTieredCacheForTests();
		state.key = { created_by: "user_1", workspace_id: "ws_1", status: "active" };
		state.preset = { created_by: "user_1", visibility: "private" };
		state.queries = 0;
		state.background.length = 0;
		vi.useRealTimers();
	});

	it("ignores non-preset models without querying", async () => {
		await expect(assertPresetAccess({ ...args, model: "openai/gpt-5" })).resolves.toBeUndefined();
		expect(state.queries).toBe(0);
	});

	it("reuses a recent decision instead of querying keys and presets every request", async () => {
		await assertPresetAccess(args);
		await assertPresetAccess(args);
		expect(state.queries).toBe(2);
	});

	it("denies private presets owned by another user", async () => {
		state.preset = { created_by: "someone_else", visibility: "private" };
		await expect(assertPresetAccess(args)).rejects.toThrow("preset_not_found");
	});

	it("never uses a decision older than 60 seconds", async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		await assertPresetAccess(args);
		state.key = { created_by: "user_1", workspace_id: "ws_1", status: "revoked" };
		vi.setSystemTime(1_061_000);
		await expect(assertPresetAccess(args)).rejects.toThrow("api_key_not_authorized");
	});
});
