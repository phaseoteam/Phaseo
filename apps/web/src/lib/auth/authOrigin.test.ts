import {
	buildAuthCallbackUrl,
	configuredAuthOriginsFromEnv,
	resolveLocalDevAuthOrigin,
	resolveVercelPreviewAuthOrigin,
} from "./authOrigin";

describe("auth origin helpers", () => {
	it("normalizes configured origins from env and removes duplicates", () => {
		const origins = configuredAuthOriginsFromEnv({
			NEXT_PUBLIC_WEBSITE_URL: "https://example.com/",
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

	it("uses the canonical Vercel preview deployment for preview auth callbacks", () => {
		expect(
			resolveVercelPreviewAuthOrigin({
				NODE_ENV: "production",
				VERCEL_ENV: "preview",
				VERCEL_URL: "preview-branch.vercel.app",
			} as NodeJS.ProcessEnv),
		).toBe("https://preview-branch.vercel.app");
	});

	it("keeps preview auth callbacks on the request hostname", () => {
		expect(
			resolveVercelPreviewAuthOrigin(
				{
					NODE_ENV: "production",
					VERCEL_ENV: "preview",
					VERCEL_URL: "phaseo-deployment.vercel.app",
				} as NodeJS.ProcessEnv,
				{
					originHeader: "https://phaseo-branch.vercel.app",
					hostHeader: "phaseo-branch.vercel.app",
				},
			),
		).toBe("https://phaseo-branch.vercel.app");
	});

	it("uses the forwarded preview hostname when Origin is unavailable", () => {
		expect(
			resolveVercelPreviewAuthOrigin(
				{
					NODE_ENV: "production",
					VERCEL_ENV: "preview",
					VERCEL_URL: "phaseo-deployment.vercel.app",
				} as NodeJS.ProcessEnv,
				{ hostHeader: "phaseo-branch.vercel.app" },
			),
		).toBe("https://phaseo-branch.vercel.app");
	});

	it("rejects a preview origin that does not match the request host", () => {
		expect(
			resolveVercelPreviewAuthOrigin(
				{
					NODE_ENV: "production",
					VERCEL_ENV: "preview",
					VERCEL_URL: "phaseo-deployment.vercel.app",
				} as NodeJS.ProcessEnv,
				{
					originHeader: "https://attacker.example",
					hostHeader: "phaseo-deployment.vercel.app",
				},
			),
		).toBeNull();
	});

	it("never uses an arbitrary URL for preview auth callbacks", () => {
		expect(
			resolveVercelPreviewAuthOrigin({
				NODE_ENV: "production",
				VERCEL_ENV: "preview",
				VERCEL_URL: "https://example.com",
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

	it("drops unsafe returnUrl values", () => {
		expect(buildAuthCallbackUrl("https://example.com", "https://evil.com")).toBe(
			"https://example.com/auth/callback",
		);
	});
});
