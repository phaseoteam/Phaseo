import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

function database(member: boolean, role = "member") {
	const requests: URL[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		requests.push(url);
		if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "user-a", email: "fixture@example.com" });
		if (url.pathname.endsWith("/users")) return Response.json([{ role }]);
		if (url.pathname.endsWith("/workspace_members")) return Response.json(member ? [{ role: "member" }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (url.pathname.endsWith("/workspace_private_models")) return Response.json([{
			id: "private-model", model_id: "workspace-a/private", name: "Private Model", enabled: true,
			enc_value: "SECRET-SENTINEL", upstream_model_id: "UPSTREAM-SENTINEL", base_url: "https://private.example.com",
		}]);
		throw new Error(`Unexpected fixture request: ${url.pathname}`);
	}));
	return requests;
}

describe("private catalogue authorization and response boundaries", () => {
	it("rejects a forged workspace ID without querying private model rows", async () => {
		const requests = database(false);
		const response = await app.request("https://phaseo.app/api/account/private-models/catalog?workspaceId=victim-workspace", { headers: { authorization: "Bearer fixture-token" } }, env);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(requests.some((url) => url.pathname.endsWith("/workspace_private_models"))).toBe(false);
		const membership = requests.find((url) => url.pathname.endsWith("/workspace_members"));
		expect(membership?.searchParams.get("user_id")).toBe("eq.user-a");
		expect(membership?.searchParams.get("workspace_id")).toBe("eq.victim-workspace");
	});

	it("rejects a non-admin asking for the global admin catalogue", async () => {
		const requests = database(true);
		const response = await app.request("https://phaseo.app/api/account/private-models/catalog?scope=admin", { headers: { authorization: "Bearer fixture-token" } }, env);
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(requests.some((url) => url.pathname.endsWith("/workspace_private_models"))).toBe(false);
	});

	it.each(["page", "table"])("scopes %s data at the database and omits upstream credentials", async (shape) => {
		const requests = database(true);
		const response = await app.request(`https://phaseo.app/api/account/private-models/catalog?shape=${shape}&workspaceId=workspace-a`, { headers: { authorization: "Bearer fixture-token", cookie: "activeWorkspaceId=other-workspace" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		const body = await response.text();
		expect(body).toContain("workspace-a/private");
		expect(body).not.toContain("SENTINEL");
		expect(body).not.toContain("private.example.com");
		const read = requests.find((url) => url.pathname.endsWith("/workspace_private_models"));
		expect(read?.searchParams.get("workspace_id")).toBe("eq.workspace-a");
	});
});
