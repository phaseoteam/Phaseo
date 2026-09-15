import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "test-pepper",
	NON_ENTERPRISE_KEY_LIMIT: "100",
};

function installSupabaseStub(counts: { api: number; management: number }) {
	const headUrls: string[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = request.url;

		if (url.includes("/auth/v1/user")) {
			return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
		}
		if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
		if (url.includes("workspaces") && url.includes("owner_user_id")) {
			return new Response(JSON.stringify([{ owner_user_id: "user-1", slug: "personal", name: "Personal" }]), { status: 200 });
		}
		if (url.includes("workspaces") && url.includes("tier")) return new Response(JSON.stringify([{ tier: "basic" }]), { status: 200 });
		if (request.method === "HEAD" && (url.includes("/keys") || url.includes("management_keys"))) {
			headUrls.push(url);
			const count = url.includes("management_keys") ? counts.management : counts.api;
			return new Response(null, { status: 200, headers: { "content-range": `*/${count}` } });
		}
		if (url.includes("/rest/v1/keys") && request.method === "POST") {
			return new Response(JSON.stringify([{ id: "api-key-1" }]), { status: 201 });
		}
		if (url.includes("/rest/v1/management_keys") && request.method === "POST") {
			return new Response(JSON.stringify([{ id: "management-key-1", created_at: "2026-09-15T00:00:00Z" }]), { status: 201 });
		}
		if (url.includes("workspace_audit_events") && request.method === "POST") return new Response(JSON.stringify([]), { status: 201 });
		return new Response(JSON.stringify([]), { status: 200 });
	}));

	return headUrls;
}

afterEach(() => vi.unstubAllGlobals());

describe("account key limits", () => {
	it("does not let management keys consume the API key limit", async () => {
		const headUrls = installSupabaseStub({ api: 0, management: 100 });
		const response = await app.request("https://phaseo.app/api/account/settings/keys", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", name: "Production", scopes: "[]" }),
		}, env);

		expect(response.status).toBe(200);
		expect(headUrls).toHaveLength(1);
		expect(headUrls[0]).toContain("/rest/v1/keys?");
	});

	it("does not let API keys consume the management key limit", async () => {
		const headUrls = installSupabaseStub({ api: 100, management: 0 });
		const response = await app.request("https://phaseo.app/api/account/settings/management-keys", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", name: "Automation", template: "read-only" }),
		}, env);

		expect(response.status).toBe(200);
		expect(headUrls).toHaveLength(1);
		expect(headUrls[0]).toContain("/rest/v1/management_keys?");
	});
});
