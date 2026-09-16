import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { isProviderAccount } from "./provider-account";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
afterEach(() => vi.unstubAllGlobals());

describe("provider account mode", () => {
	it.each([
		["user", "user-1", "active", true],
		["admin", "user-1", "active", false],
		["user", "someone-else", "active", false],
		["user", "user-1", "pending", false],
		["user", "user-1", "revoked", false],
	])("resolves %s / %s / %s to %s", (role, linkedBy, status, expected) => {
		expect(isProviderAccount("user-1", role, [{ linked_by: linkedBy, status }])).toBe(expected);
	});
	it("does not convert an unlinked customer", () => {
		expect(isProviderAccount("user-1", "user", [])).toBe(false);
	});

	function stubAccount({ role = "user", failLinks = false, linkedBy = "user-1" } = {}) {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const url = new URL(request.url);
			const table = url.pathname.split("/").at(-1);
			const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
			if (url.pathname === "/auth/v1/user") return json({ id: "user-1" });
			if (table === "users") return json([{ role, default_workspace_id: "personal-1" }]);
			if (table === "workspace_members") return json([{ workspace_id: "personal-1", role: "owner" }]);
			if (table === "workspaces") return json([{ id: "personal-1", name: "Personal" }]);
			if (table === "provider_account_links") {
				expect(url.searchParams.get("workspace_id")).toContain("personal-1");
				return failLinks ? new Response('{"message":"unavailable"}', { status: 400 }) : json([{ provider_slug: "synthetic", workspace_id: "personal-1", linked_by: linkedBy, status: "active" }]);
			}
			return json([]);
		});
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	it("returns provider mode in the private header and ignores a stale workspace cookie", async () => {
		stubAccount();
		const response = await app.request("https://phaseo.app/api/account/auth/header", { headers: { authorization: "Bearer token", cookie: "activeWorkspaceId=old-workspace" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toMatchObject({ providerMode: true, currentTeamId: "personal-1" });
	});

	it("exposes the same provider mode in settings without a workspace selector", async () => {
		stubAccount();
		const response = await app.request("https://phaseo.app/api/account/settings/layout", { headers: { authorization: "Bearer token" } }, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ accountContext: { providerMode: true, isProvider: true } });
	});

	it("does not turn shared-workspace customers into providers", async () => {
		stubAccount({ linkedBy: "someone-else" });
		const response = await app.request("https://phaseo.app/api/account/auth/header", { headers: { authorization: "Bearer token" } }, env);
		expect(await response.json()).toMatchObject({ providerMode: false });
	});

	it("blocks workspace creation for provider accounts before any insert", async () => {
		const fetchMock = stubAccount();
		const response = await app.request("https://phaseo.app/api/account/settings/teams", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ name: "Another workspace" }) }, env);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "provider_account_workspace_managed" });
		expect(fetchMock.mock.calls.every(([input, init]) => (input instanceof Request ? input.method : init?.method ?? "GET") === "GET")).toBe(true);
	});

	it("fails closed when provider mode cannot be checked for workspace creation", async () => {
		stubAccount({ failLinks: true });
		const response = await app.request("https://phaseo.app/api/account/settings/teams", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ name: "Another workspace" }) }, env);
		expect(response.status).toBe(503);
	});
});
