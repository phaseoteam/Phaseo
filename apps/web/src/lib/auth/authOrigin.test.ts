import {
	buildAuthCallbackUrl,
	configuredAuthOriginsFromEnv,
	resolveLocalDevAuthOrigin,
	resolvePreviewAuthOrigin,
} from "./authOrigin";

describe("auth origin helpers", () => {
	it("normalizes configured origins from env and removes duplicates", () => {
		const origins = configuredAuthOriginsFromEnv({
			PUBLIC_WEBSITE_URL: "https://example.com/",
			WEBSITE_URL: "https://example.com",
			NODE_ENV: "test",
		} as unknown as NodeJS.ProcessEnv);

		expect(origins).toEqual(["https://example.com"]);
	});

	it("prefers localhost origin header in dev", () => {
		expect(
			resolveLocalDevAuthOrigin({
				originHeader: "http://localhost:4321",
				hostHeader: "localhost:3000",
			}),
		).toBe("http://localhost:4321");
	});

	it("falls back to localhost host header when origin is missing", () => {
		expect(
			resolveLocalDevAuthOrigin({
				hostHeader: "127.0.0.1:3100",
			}),
		).toBe("http://127.0.0.1:3100");
	});

	it("uses the preview deployment URL for preview auth callbacks", () => {
		expect(
			resolvePreviewAuthOrigin({
				NODE_ENV: "production",
				PHASEO_ENV: "preview",
				PUBLIC_DEPLOY_URL: "phaseo-web-preview.example.workers.dev/",
			} as NodeJS.ProcessEnv),
		).toBe("https://phaseo-web-preview.example.workers.dev");
	});

	it("ignores the deploy URL outside previews and over plain http", () => {
		expect(
			resolvePreviewAuthOrigin({
				NODE_ENV: "production",
				PUBLIC_DEPLOY_URL: "https://phaseo-web-preview.example.workers.dev",
			} as NodeJS.ProcessEnv),
		).toBeNull();
		expect(
			resolvePreviewAuthOrigin({
				NODE_ENV: "production",
				PHASEO_ENV: "preview",
				PUBLIC_DEPLOY_URL: "http://phaseo-web-preview.example.workers.dev",
			} as NodeJS.ProcessEnv),
		).toBeNull();
	});

	it("builds callback URLs and preserves valid returnUrl", () => {
		expect(
			buildAuthCallbackUrl("https://example.com", "/oauth/consent?client_id=abc"),
		).toBe(
			"https://example.com/auth/callback?returnUrl=%2Foauth%2Fconsent%3Fclient_id%3Dabc",
		);
	});

	it("carries an explicit UI locale through the technical callback", () => {
		expect(
			buildAuthCallbackUrl(
				"https://example.com",
				"/settings/account",
				"de-DE",
			),
		).toBe(
			"https://example.com/auth/callback?returnUrl=%2Fsettings%2Faccount&locale=de-DE",
		);
	});

	it("drops unsafe returnUrl values", () => {
		expect(buildAuthCallbackUrl("https://example.com", "https://evil.com")).toBe(
			"https://example.com/auth/callback",
		);
	});
});
