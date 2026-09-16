import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
const url = "https://phaseo.app/api/account/settings/provider-onboarding/webhook/rotate";

afterEach(() => vi.unstubAllGlobals());

describe("provider webhook secret rotation", () => {
	it("requires a signed-in account", async () => {
		const response = await app.request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerSlug: "synthetic" }) }, env);
		expect(response.status).toBe(401);
	});

	it("does not rotate another provider's secret", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const path = new URL(request.url).pathname;
			if (path === "/auth/v1/user") return Response.json({ id: "user-1" });
			if (path.endsWith("/workspace_members")) return Response.json([{ workspace_id: "personal-1", role: "owner" }]);
			if (path.endsWith("/workspaces")) return Response.json([{ id: "personal-1" }]);
			if (path.endsWith("/provider_account_links")) return Response.json([]);
			throw new Error(`Unexpected access to ${path}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		const response = await app.request(url, { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify({ providerSlug: "other-provider" }) }, env);
		expect(response.status).toBe(403);
		expect(fetchMock.mock.calls.every(([input, init]) => (input instanceof Request ? input.method : init?.method ?? "GET") === "GET")).toBe(true);
	});
});
