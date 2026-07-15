import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	success: true,
	keys: [] as string[],
	production: true,
	limiterAvailable: true,
	limiterThrows: false,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		ENV: state.production ? "prod" : "test",
		OAUTH_STRICT_RATE_LIMITER: state.limiterAvailable ? {
			limit: async ({ key }: { key: string }) => {
				state.keys.push(key);
				if (state.limiterThrows) throw new Error("rate limiter unavailable");
				return { success: state.success };
			},
		} : undefined,
	}),
}));

describe("OAuth Workers rate limiting", () => {
	beforeEach(() => {
		state.success = true;
		state.keys.length = 0;
		state.production = true;
		state.limiterAvailable = true;
		state.limiterThrows = false;
	});

	it("fails closed in production when the binding is missing or errors", async () => {
		const { checkOAuthRateLimit } = await import("./rateLimit");
		state.limiterAvailable = false;
		await expect(checkOAuthRateLimit(new Request("https://api.phaseo.app/oauth/token"), "token", "token")).resolves.toBe(false);

		state.limiterAvailable = true;
		state.limiterThrows = true;
		await expect(checkOAuthRateLimit(new Request("https://api.phaseo.app/oauth/token"), "token", "token")).resolves.toBe(false);
	});

	it("keeps local development usable without a Workers rate-limit binding", async () => {
		const { checkOAuthRateLimit } = await import("./rateLimit");
		state.production = false;
		state.limiterAvailable = false;
		await expect(checkOAuthRateLimit(new Request("http://localhost/oauth/token"), "token", "token")).resolves.toBe(true);
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
