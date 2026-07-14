import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	success: true,
	keys: [] as string[],
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OAUTH_STRICT_RATE_LIMITER: {
			limit: async ({ key }: { key: string }) => {
				state.keys.push(key);
				return { success: state.success };
			},
		},
	}),
}));

describe("OAuth Workers rate limiting", () => {
	beforeEach(() => {
		state.success = true;
		state.keys.length = 0;
	});

	it("returns the binding decision without exposing the client address in the key", async () => {
		state.success = false;
		const { checkOAuthRateLimit } = await import("./rateLimit");
		const allowed = await checkOAuthRateLimit(
			new Request("https://api.phaseo.app/oauth/device/code", {
				headers: { "cf-connecting-ip": "203.0.113.10" },
			}),
			"strict",
			"device-code:phaseo_cli",
		);

		expect(allowed).toBe(false);
		expect(state.keys).toHaveLength(1);
		expect(state.keys[0]).not.toContain("203.0.113.10");
	});
});
