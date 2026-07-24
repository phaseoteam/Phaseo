import { describe, expect, it } from "vitest";
import { rootRouter } from "./root";

const bindings = {
	GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app",
	SUPABASE_URL: "https://test.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	GATEWAY_CACHE: {} as KVNamespace,
} as any;

const executionContext = {
	waitUntil: () => undefined,
	passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

describe("OAuth server metadata", () => {
	it.each([
		"/.well-known/oauth-authorization-server/oauth",
		"/.well-known/openid-configuration/oauth",
		"/.well-known/openid-configuration",
	])("publishes issuer-consistent metadata at %s", async (path) => {
		const response = await rootRouter.fetch(
			new Request(`https://api.phaseo.app${path}`),
			bindings,
			executionContext,
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(
			expect.objectContaining({
				issuer: "https://api.phaseo.app/oauth",
				authorization_endpoint: "https://api.phaseo.app/oauth/authorize",
				token_endpoint: "https://api.phaseo.app/oauth/token",
				code_challenge_methods_supported: ["S256"],
			}),
		);
	});
});
