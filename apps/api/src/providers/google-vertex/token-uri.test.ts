import { describe, expect, it } from "vitest";
import { GOOGLE_OAUTH_TOKEN_URI, googleOAuthTokenRequestInit, resolveGoogleOAuthTokenUri } from "./token-uri";

describe("resolveGoogleOAuthTokenUri", () => {
	it("uses Google's fixed OAuth token endpoint", () => {
		expect(resolveGoogleOAuthTokenUri(undefined)).toBe(GOOGLE_OAUTH_TOKEN_URI);
		expect(resolveGoogleOAuthTokenUri(GOOGLE_OAUTH_TOKEN_URI)).toBe(GOOGLE_OAUTH_TOKEN_URI);
	});

	it.each([
		"http://127.0.0.1/token",
		"https://oauth2.googleapis.com.evil.example/token",
		"https://oauth2.googleapis.com/token?redirect=evil",
	])("rejects untrusted token URI %s", (value) => {
		expect(() => resolveGoogleOAuthTokenUri(value)).toThrow("google-vertex_invalid_oauth_token_uri");
	});

	it("blocks redirects for credential-bearing token requests", () => {
		const body = new URLSearchParams({ assertion: "signed" });
		expect(googleOAuthTokenRequestInit(body)).toMatchObject({
			method: "POST",
			body,
			redirect: "manual",
		});
	});
});
