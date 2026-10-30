import {
	hasRecentInteractiveAuthentication,
	hasRecentSignIn,
	latestInteractiveAuthenticationTimestamp,
	ssoProviderIdFromSession,
} from "./method";

function jwt(payload: Record<string, unknown>): string {
	return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

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

	it("extracts the provider identifier only from an SSO AMR entry", () => {
		expect(ssoProviderIdFromSession({ access_token: jwt({ amr: [{ method: "sso/saml", provider: "provider-123", timestamp: 1_000 }] }) })).toBe("provider-123");
		expect(ssoProviderIdFromSession({ access_token: jwt({ amr: [{ method: "password", timestamp: 1_000 }] }) })).toBeNull();
		expect(ssoProviderIdFromSession({ access_token: jwt({ amr: [{ method: "sso/saml", timestamp: 1_000 }] }) })).toBeNull();
	});
});
