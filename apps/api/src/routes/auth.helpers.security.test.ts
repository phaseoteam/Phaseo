import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	fromCalls: [] as string[],
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		PHASEO_THIRD_PARTY_OAUTH_ENABLED: "true",
		PHASEO_LEGACY_OAUTH_EXCHANGE_ENABLED: undefined,
	}),
	getSupabaseAdmin: () => ({
		from(table: string) {
			state.fromCalls.push(table);
			throw new Error("third-party OAuth lookup should be gated before database access");
		},
	}),
}));

describe("OAuth app resolution security", () => {
	it("keeps the legacy exchange closed even when third-party OAuth is enabled", async () => {
		const { resolveOAuthApp } = await import("./auth.helpers");

		const result = await resolveOAuthApp({
			redirectUri: "https://partner.example/callback",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(403);
		await expect(result.response.json()).resolves.toMatchObject({
			error: "legacy_oauth_exchange_disabled",
		});
		expect(state.fromCalls).toEqual([]);
	});
});
