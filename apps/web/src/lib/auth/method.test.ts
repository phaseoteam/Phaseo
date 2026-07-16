import {
	hasRecentInteractiveAuthentication,
	hasRecentSignIn,
	latestInteractiveAuthenticationTimestamp,
} from "./method";

describe("recent authentication helpers", () => {
	it("uses the latest interactive AMR timestamp", () => {
		expect(
			latestInteractiveAuthenticationTimestamp({
				amr: [
					{ method: "password", timestamp: 1_000 },
					{ method: "mfa/totp", timestamp: 1_200 },
				],
			}),
		).toBe(1_200);
	});

	it("ignores refresh-only AMR entries", () => {
		expect(
			latestInteractiveAuthenticationTimestamp({
				amr: [{ method: "token_refresh", timestamp: 1_200 }],
			}),
		).toBeNull();
	});

	it("accepts only authentication inside the sensitive-action window", () => {
		const claims = { amr: [{ method: "oauth", timestamp: 1_000 }] };
		expect(
			hasRecentInteractiveAuthentication(claims, {
				nowSeconds: 1_299,
			}),
		).toBe(true);
		expect(
			hasRecentInteractiveAuthentication(claims, {
				nowSeconds: 1_301,
			}),
		).toBe(false);
	});

	it("rejects future AMR timestamps", () => {
		expect(
			hasRecentInteractiveAuthentication(
				{ amr: [{ method: "password", timestamp: 1_001 }] },
				{ nowSeconds: 1_000 },
			),
		).toBe(false);
	});

	it("uses the server-reported last sign-in time as a fallback", () => {
		const now = Date.parse("2026-07-16T12:00:00.000Z");
		expect(
			hasRecentSignIn("2026-07-16T11:56:00.000Z", {
				nowMilliseconds: now,
			}),
		).toBe(true);
		expect(
			hasRecentSignIn("2026-07-16T11:54:00.000Z", {
				nowMilliseconds: now,
			}),
		).toBe(false);
	});
});
