// Security review 2026-11-03 (second pass): what members, admins and owners can see and do.
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { sharedOAuthIdentity } from "./settings";
import { generateInviteCode } from "./settings-teams";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	PHASEO_CONTROL_KEY: "control-key",
	PHASEO_CONTROL_SECRET: "control-secret",
	GATEWAY_API_ORIGIN: "https://gateway.test",
};
afterEach(() => vi.unstubAllGlobals());

function executionContext() {
	const pending: Promise<unknown>[] = [];
	return { ctx: { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }, passThroughOnException() {}, props: {} } as any, pending };
}

type Role = "owner" | "admin" | "member";

/** A Supabase stand-in: the caller ("user-1") has `role` in workspace-1, which owns OAuth app client-1. */
function supabaseFor(role: Role, extra: (request: Request) => Response | null | Promise<Response | null> = () => null) {
	const requests: Request[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		requests.push(request.clone());
		const url = decodeURIComponent(request.url);
		const handled = await extra(request);
		if (handled) return handled;
		if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
		if (url.includes("/rest/v1/workspaces")) return Response.json([{ owner_user_id: role === "owner" ? "user-1" : "owner-9", slug: "team", name: "Team" }]);
		if (url.includes("/rest/v1/workspace_members") && url.includes("user_id=eq.user-1")) return Response.json(role === "owner" ? [] : [{ role }]);
		if (url.includes("oauth_apps_with_stats")) return Response.json([{ client_id: "client-1", workspace_id: "workspace-1", name: "App" }]);
		if (url.includes("oauth_authorizations")) {
			return Response.json([
				{ id: "auth-1", user_id: "user-a", workspace_id: "customer-ws", scopes: ["openid", "profile", "email"], last_used_at: null, users: { user_id: "user-a", full_name: "Ada", email: "ada@example.com" } },
				{ id: "auth-2", user_id: "user-b", workspace_id: "customer-ws-2", scopes: ["openid", "gateway:access"], last_used_at: null, users: { user_id: "user-b", full_name: "Bo", email: "bo@example.com" } },
			]);
		}
		if (url.includes("gateway_requests") && url.includes("request_id")) return Response.json([{ request_id: "req-1", oauth_user_id: "user-b" }]);
		if (url.includes("gateway_requests")) return Response.json([{ created_at: "2026-11-01T00:00:00Z", success: true, cost_nanos: 5 }]);
		return Response.json([]);
	});
	vi.stubGlobal("fetch", fetchMock);
	return requests;
}

describe("OAuth app detail", () => {
	const detail = () => app.request("https://phaseo.app/api/account/settings/oauth-apps/client-1", { headers: { authorization: "Bearer token" } }, env);

	it("shows a plain member the app and its totals, not the people who use it", async () => {
		const requests = supabaseFor("member");
		const response = await detail();
		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body).toMatchObject({ oauthApp: { client_id: "client-1" }, canViewUsers: false, authorizations: [], recentRequests: [], userDirectory: [], usageStats: [{ success: true }] });
		expect(requests.some((request) => request.url.includes("oauth_authorizations"))).toBe(false);
		expect(JSON.stringify(body)).not.toContain("example.com");
	});

	it("shows admins each user's name and email only when that user shared them, and never their workspace", async () => {
		const requests = supabaseFor("admin");
		const response = await detail();
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.canViewUsers).toBe(true);
		expect(body.authorizations).toEqual([
			{ id: "auth-1", created_at: null, last_used_at: null, users: { full_name: "Ada", email: "ada@example.com" } },
			{ id: "auth-2", created_at: null, last_used_at: null, users: { full_name: null, email: null } },
		]);
		expect(body.userDirectory).toEqual([
			{ user_id: "user-a", full_name: "Ada", email: "ada@example.com" },
			{ user_id: "user-b", full_name: null, email: null },
		]);
		expect(body.recentRequests).toEqual([{ request_id: "req-1", oauth_user_id: "user-b" }]);
		expect(JSON.stringify(body)).not.toContain("customer-ws");
		const authorizationQueries = requests.filter((request) => request.url.includes("oauth_authorizations")).map((request) => decodeURIComponent(request.url));
		expect(authorizationQueries).toHaveLength(2);
		for (const query of authorizationQueries) {
			expect(query).not.toContain("workspaces");
			expect(query).toContain("revoked_at=is.null");
		}
	});

	it("shares a name only with the profile scope and an email only with the email scope", () => {
		const users = { full_name: "Ada", email: "ada@example.com" };
		expect(sharedOAuthIdentity({ scopes: ["profile"], users })).toEqual({ full_name: "Ada", email: null });
		expect(sharedOAuthIdentity({ scopes: ["email"], users: [users] })).toEqual({ full_name: null, email: "ada@example.com" });
		expect(sharedOAuthIdentity({ scopes: null, users })).toEqual({ full_name: null, email: null });
	});
});

describe("removing a member", () => {
	it("tells the gateway to drop the keys the database revokes with the membership", async () => {
		const requests = supabaseFor("owner", (request) => {
			const url = decodeURIComponent(request.url);
			if (url.includes("/rest/v1/workspace_members") && url.includes("user_id=eq.member-2") && request.method === "DELETE") return Response.json([{ workspace_id: "workspace-1", user_id: "member-2" }]);
			if (url.includes("/rest/v1/workspace_members") && url.includes("user_id=eq.member-2")) return Response.json([{ role: "admin" }]);
			if (url.includes("/rest/v1/keys")) return Response.json([{ id: "key-1" }, { id: "key-2" }]);
			if (url.startsWith("https://gateway.test/")) return new Response(null, { status: 204 });
			return null;
		});
		const { ctx, pending } = executionContext();
		const response = await app.request("https://phaseo.app/api/account/settings/teams/workspace-1/members/member-2", { method: "DELETE", headers: { authorization: "Bearer token" } }, env, ctx);
		await Promise.all(pending);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ ok: true, revokedKeys: 2 });
		const keyQuery = requests.find((request) => request.url.includes("/rest/v1/keys"));
		expect(decodeURIComponent(keyQuery!.url)).toContain("created_by=eq.member-2");
		expect(decodeURIComponent(keyQuery!.url)).toContain("status=not.in.(revoked,compromised,deleted)");
		const invalidated = requests.filter((request) => request.url.startsWith("https://gateway.test/")).map((request) => new URL(request.url).pathname).sort();
		expect(invalidated).toEqual(["/v1/keys/key-1/invalidate", "/v1/keys/key-2/invalidate"]);
	});
});

describe("creating an invite", () => {
	const invite = (body: Record<string, unknown>) => app.request("https://phaseo.app/api/account/settings/teams/workspace-1/invites", {
		method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body),
	}, { ...env, INVITE_ENCRYPTION_KEY: btoa("k".repeat(32)), HMAC_ENCRYPTION_KEY: btoa("h".repeat(32)) } as any);

	it("lets only the owner invite admins", async () => {
		supabaseFor("admin");
		const response = await invite({ role: "admin" });
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ message: "Only the workspace owner can invite admins." });
	});

	it("uses a code the server generates and ignores one the client sends", async () => {
		let inserted: Record<string, unknown> | null = null;
		supabaseFor("admin", async (request) => {
			if (!request.url.includes("workspace_invites") || request.method !== "POST") return null;
			inserted = await request.json() as Record<string, unknown>;
			return Response.json([{ id: "invite-1" }], { status: 201 });
		});
		const response = await invite({ role: "member", token: "aaaaaa" });
		expect(response.status).toBe(200);
		const body = await response.json() as { token: string };
		expect(body.token).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
		expect(body.token).not.toBe("aaaaaa");
		expect(inserted).toMatchObject({ role: "member", token_preview: `${body.token.slice(0, 2)}...${body.token.slice(-2)}` });
	});

	it("draws invite codes evenly from the alphabet", () => {
		const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
		expect(codes.size).toBe(200);
		for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
	});
});
