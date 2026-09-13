import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

vi.mock("./provider-catalog", async (importOriginal) => ({
	...await importOriginal<typeof import("./provider-catalog")>(),
	fetchAndValidateProviderCatalog: vi.fn(async () => ({ preview: { valid: true } })),
	validateProviderCatalogPricingMeters: vi.fn(async (_client, preview) => preview),
}));

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
afterEach(() => vi.unstubAllGlobals());

describe("privileged account RPC caller identity", () => {
	it.each([
		["/api/account/credits/tier-summary?workspaceId=workspace-1", 2],
		["/api/account/settings/contact-personalization?workspaceId=workspace-1", 1],
	])("passes the user session and canonical workspace parameter to %s", async (path, count) => {
		const calls: Array<{ authorization: string | null; body: unknown }> = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com" });
			if (url.includes("workspace_members")) return Response.json([{ role: "member", workspace_id: "workspace-1" }]);
			if (url.includes("/workspaces")) return Response.json([{ owner_user_id: "owner-1", slug: "workspace-one", tier: "basic" }]);
			if (url.includes("/rpc/")) {
				calls.push({
					authorization: new Headers(input instanceof Request ? input.headers : init?.headers).get("authorization"),
					body: input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body)),
				});
				return Response.json(1_000_000);
			}
			return Response.json([]);
		}));
		const response = await app.request(`https://phaseo.app${path}`, { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(calls).toHaveLength(count);
		for (const call of calls) expect(call).toEqual({ authorization: "Bearer session-token", body: { p_workspace_id: "workspace-1" } });
		if (path.includes("contact-personalization")) await expect(response.json()).resolves.toMatchObject({ tierLabel: "Enterprise" });
		else await expect(response.json()).resolves.toMatchObject({ lastMonthCents: 1_000_000, mtdCents: 1_000_000 });
	});

	it("enforces the onboarding quota with the submitting user's session", async () => {
		let reservation: { authorization: string | null; body: unknown } | undefined;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
			if (url.includes("/rpc/reserve_provider_onboarding_submission_slot")) {
				reservation = {
					authorization: new Headers(input instanceof Request ? input.headers : init?.headers).get("authorization"),
					body: input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body)),
				};
				return Response.json(false);
			}
			return Response.json([]);
		}));
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/submit", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ providerSlug: "example", providerName: "Example", websiteUrl: "https://example.com", catalogUrl: "https://example.com/catalog.json" }),
		}, env);
		expect(response.status).toBe(429);
		expect(reservation).toEqual({ authorization: "Bearer session-token", body: { p_user_id: "user-1" } });
	});
});
