import { beforeEach, describe, expect, it, vi } from "vitest";

const PERSONAL = "6108396e-0e12-425d-91ff-a02d39a346e0";
const CACHE_TEST = "00000000-0000-4000-8000-0000000000c1";

const state = vi.hoisted(() => ({
	auth: {} as Record<string, unknown>,
	workspaces: [] as Array<{ id: string; name: string; slug: string }>,
	members: [] as Array<{ workspace_id: string; user_id: string; role: string }>,
	authorizations: [] as Array<{ workspace_id: string; user_id: string; client_id: string; scopes: string[]; revoked_at: string | null }>,
	grants: [] as Array<Record<string, unknown>>,
	issued: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		from(table: string) {
			const rows: Array<Record<string, unknown>> =
				table === "workspaces" ? state.workspaces
				: table === "workspace_members" ? state.members
				: table === "oauth_authorizations" ? state.authorizations
				: [];
			const filters: Array<[string, unknown]> = [];
			const builder = {
				select: () => builder,
				eq(column: string, value: unknown) {
					filters.push([column, value]);
					return builder;
				},
				maybeSingle: async () => ({
					data: rows.find((row) => filters.every(([column, value]) => row[column] === value)) ?? null,
					error: null,
				}),
			};
			return builder;
		},
	}),
}));

vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/pipeline/before/auth", () => ({
	authenticateManagement: vi.fn(async () => state.auth),
}));

vi.mock("@/lib/oauth/rateLimit", () => ({
	checkOAuthRateLimit: vi.fn(async () => true),
}));

vi.mock("@/lib/oauth/service", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/oauth/service")>()),
	ensureGrant: vi.fn(async (args: Record<string, unknown>) => {
		state.grants.push(args);
	}),
	issueTokenPair: vi.fn(async (input: Record<string, unknown>) => {
		state.issued.push(input);
		return { access_token: "jwt", token_type: "Bearer", expires_in: 900, refresh_token: "refresh", scope: (input.scopes as string[]).join(" ") };
	}),
}));

const cliSession = {
	ok: true,
	workspaceId: PERSONAL,
	apiKeyId: "phaseo_cli",
	apiKeyRef: "oauth_phaseo_cli",
	apiKeyKid: "phaseo_cli",
	userId: "user_1",
	authMethod: "oauth",
	oauthClientId: "phaseo_cli",
	oauthScopes: ["keys:read", "keys:write", "workspaces:read"],
	scopes: ["keys:read", "keys:write", "workspaces:read"],
};

async function switchTo(workspace: unknown) {
	const { oauthRouter } = await import("./oauth");
	return oauthRouter.request("https://example.com/cli/workspace", {
		method: "POST",
		headers: { authorization: "Bearer token", "content-type": "application/json" },
		body: JSON.stringify({ workspace_id: workspace }),
	});
}

describe("POST /oauth/cli/workspace", () => {
	beforeEach(() => {
		state.auth = cliSession;
		state.workspaces = [
			{ id: PERSONAL, name: "Personal", slug: "personal" },
			{ id: CACHE_TEST, name: "cache-test", slug: "cache-test" },
		];
		state.members = [
			{ workspace_id: PERSONAL, user_id: "user_1", role: "owner" },
			{ workspace_id: CACHE_TEST, user_id: "user_1", role: "owner" },
		];
		state.authorizations = [];
		state.grants = [];
		state.issued = [];
		vi.resetModules();
	});

	it("gives an owner a CLI session for the new workspace, by id or slug, with the session's scopes", async () => {
		const response = await switchTo("cache-test");
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toMatchObject({
			access_token: "jwt",
			refresh_token: "refresh",
			workspace: { id: CACHE_TEST, name: "cache-test", slug: "cache-test" },
		});
		expect(state.issued).toEqual([{ userId: "user_1", workspaceId: CACHE_TEST, clientId: "phaseo_cli", scopes: cliSession.oauthScopes }]);
		// The CLI had no consent there yet, so it gets one with exactly the session's scopes.
		expect(state.grants).toEqual([{ userId: "user_1", workspaceId: CACHE_TEST, clientId: "phaseo_cli", scopes: cliSession.oauthScopes }]);

		expect((await switchTo(CACHE_TEST)).status).toBe(200);
	});

	it("keeps an existing consent and never widens the session past it", async () => {
		state.authorizations = [{ workspace_id: CACHE_TEST, user_id: "user_1", client_id: "phaseo_cli", scopes: ["keys:read", "billing:write"], revoked_at: null }];
		const response = await switchTo(CACHE_TEST);
		expect(response.status).toBe(200);
		expect(state.grants).toEqual([]);
		expect(state.issued[0]).toMatchObject({ workspaceId: CACHE_TEST, scopes: ["keys:read"] });
	});

	it("refuses rather than issue a session with no scopes", async () => {
		state.authorizations = [{ workspace_id: CACHE_TEST, user_id: "user_1", client_id: "phaseo_cli", scopes: ["settings:read"], revoked_at: null }];
		const response = await switchTo(CACHE_TEST);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "access_denied" });
		expect(state.issued).toEqual([]);

		// Nor create a consent with no scopes for a workspace that has none.
		state.authorizations = [];
		state.auth = { ...cliSession, oauthScopes: [], scopes: [] };
		expect((await switchTo(CACHE_TEST)).status).toBe(403);
		expect(state.grants).toEqual([]);
		expect(state.issued).toEqual([]);
	});

	it("refuses a workspace the person isn't a member of, or doesn't exist, the same way", async () => {
		state.members = state.members.filter((row) => row.workspace_id !== CACHE_TEST);
		for (const target of [CACHE_TEST, "00000000-0000-4000-8000-00000000dead", "no-such-slug"]) {
			const response = await switchTo(target);
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: "access_denied", error_description: "Workspace membership is required" });
		}
		expect(state.issued).toEqual([]);
		expect(state.grants).toEqual([]);
	});

	it("refuses a member who isn't an owner or admin", async () => {
		state.members = state.members.map((row) => (row.workspace_id === CACHE_TEST ? { ...row, role: "member" } : row));
		const response = await switchTo(CACHE_TEST);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "access_denied", error_description: "Workspace owner or admin role is required" });
		expect(state.issued).toEqual([]);
		expect(state.grants).toEqual([]);

		state.members = state.members.map((row) => (row.workspace_id === CACHE_TEST ? { ...row, role: "admin" } : row));
		expect((await switchTo(CACHE_TEST)).status).toBe(200);
	});

	it("leaves a consent the person revoked revoked", async () => {
		state.authorizations = [{ workspace_id: CACHE_TEST, user_id: "user_1", client_id: "phaseo_cli", scopes: ["keys:read"], revoked_at: "2026-11-01T00:00:00.000Z" }];
		const response = await switchTo(CACHE_TEST);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "access_denied" });
		expect(state.issued).toEqual([]);
		expect(state.grants).toEqual([]);
	});

	it("refuses API keys, management keys, other apps and delegated keys", async () => {
		for (const auth of [
			// An inference API key (`*_sk_*`) is refused by management auth before it gets here.
			{ ok: false, reason: "management_key_required" },
			// A management key: authenticated, but bound to its workspace.
			{ ...cliSession, authMethod: "api_key", apiKeyRef: "mgmt_kid_abc", oauthClientId: null },
			// A third-party app's OAuth token, and the desktop app's.
			{ ...cliSession, oauthClientId: "client_1", apiKeyRef: "oauth_client_1" },
			{ ...cliSession, oauthClientId: "phaseo_desktop", apiKeyRef: "oauth_phaseo_desktop" },
			// A delegated key minted for the CLI client rather than its session token.
			{ ...cliSession, apiKeyRef: "kid_abc" },
			// A session without a person.
			{ ...cliSession, userId: null },
		]) {
			state.auth = auth;
			const response = await switchTo(CACHE_TEST);
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "invalid_token", error_description: "A Phaseo CLI session is required" });
		}
		expect(state.issued).toEqual([]);
		expect(state.grants).toEqual([]);
	});

	it("requires a workspace", async () => {
		for (const target of [undefined, "", 7, "x".repeat(101)]) {
			expect((await switchTo(target)).status).toBe(400);
		}
	});
});
