import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("private model account routes", () => {
	it.each(["/api/account/private-models", "/api/account/private-models/catalog"])("mounts %s behind authentication", async (path) => {
		const response = await app.request(`https://phaseo.app${path}`, {}, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("lets a site admin see enabled private models across workspaces", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "admin-1", email: "admin@example.com" }), { status: 200 });
			if (url.includes("users")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("workspace_private_models")) return new Response(JSON.stringify([{
				workspace_id: "workspace-1", model_id: "acme/private-model", name: "Private Model", description: "Internal model", supports_responses: false, enabled: true,
			}]), { status: 200 });
			if (url.includes("workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", slug: "acme", name: "Acme", logo_url: null }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/private-models/catalog?scope=admin&shape=page",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			private_catalogue: true,
			models: [expect.objectContaining({ model_id: "acme/private-model", organisation_id: "acme", is_private: true })],
		});
	});
});
