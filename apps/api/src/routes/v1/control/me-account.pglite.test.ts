import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The gateway's authorized-app scope reduction (PATCH /v1/control/me/authorized-apps/:id) on Postgres: a real
// supabase-js client sends the handler's PostgREST requests, which run here as SQL on PGlite, so the text[]
// literal in the compare-and-swap filter is parsed and compared by Postgres itself.

const USER = "10000000-0000-4000-8000-000000000001";
const AUTHORIZATION = "auth_cli";
const state = vi.hoisted(() => ({ db: null as unknown as import("@electric-sql/pglite").PGlite, betweenReadAndWrite: null as null | (() => Promise<unknown>) }));

async function postgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const request = input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	if (url.pathname !== "/rest/v1/oauth_authorizations") return Response.json({ message: "unexpected" }, { status: 500 });
	const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, "") ?? null;
	expect(url.searchParams.get("revoked_at")).toBe("is.null");
	if (request.method === "GET") {
		const { rows } = await state.db.query(`select id, workspace_id, client_id, scopes from oauth_authorizations where id = $1 and user_id = $2 and revoked_at is null`, [eq("id"), eq("user_id")]);
		await state.betweenReadAndWrite?.();
		return Response.json(rows);
	}
	const { scopes } = await request.json() as { scopes: string[] };
	const { rows } = await state.db.query(
		`update oauth_authorizations set scopes = $1 where id = $2 and user_id = $3 and revoked_at is null and scopes = $4 returning id`,
		[scopes, eq("id"), eq("user_id"), eq("scopes")],
	);
	return Response.json(rows);
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => createClient("https://project.supabase.co", "service", { auth: { persistSession: false }, global: { fetch: postgrest } }),
}));
vi.mock("@/pipeline/before/auth", () => ({
	authenticateManagement: async () => ({ ok: true, workspaceId: "ws_1", authMethod: "oauth", userId: USER, oauthClientId: null, apiKeyRef: "dashboard", oauthScopes: ["oauth_clients:write"] }),
}));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async () => true }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

import { meAccountRoutes } from "./me-account";

beforeAll(async () => {
	state.db = new PGlite();
	await state.db.exec(`create table oauth_authorizations (id text primary key, user_id uuid not null, workspace_id text, client_id text, scopes text[] not null default '{}', revoked_at timestamptz)`);
});
afterAll(async () => { await state.db.close(); });
beforeEach(() => { state.betweenReadAndWrite = null; });

async function store(scopes: string[]) {
	await state.db.query(`delete from oauth_authorizations`);
	await state.db.query(`insert into oauth_authorizations (id, user_id, workspace_id, client_id, scopes) values ($1, $2, 'ws_1', 'phaseo_cli', $3)`, [AUTHORIZATION, USER, scopes]);
}
const stored = async () => (await state.db.query<{ scopes: string[] }>(`select scopes from oauth_authorizations`)).rows[0]?.scopes;
async function reduce(scopes: string[]) {
	const response = await meAccountRoutes.request(`https://api.phaseo.test/authorized-apps/${AUTHORIZATION}`, {
		method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scopes }),
	});
	return { status: response.status, body: await response.json() as Record<string, any> };
}

describe("gateway authorized-app scope reduction on Postgres", () => {
	it.each([
		["in stored order", ["usage:read", "me:read", "keys:read"]],
		["with duplicates", ["me:read", "usage:read", "me:read"]],
		["with quotes, commas and backslashes", ["me:read", 'odd,"scope"\\x', "{braces}"]],
	])("updates an unchanged array %s", async (_label, scopes) => {
		await store(scopes);
		expect(await reduce(["me:read"])).toEqual({ status: 200, body: { data: { id: AUTHORIZATION, scopes: ["me:read"] } } });
		expect(await stored()).toEqual(["me:read"]);
	});

	it.each([
		["a scope was removed", `update oauth_authorizations set scopes = '{me:read,keys:read}'`, ["me:read", "keys:read"]],
		["the scopes were only reordered", `update oauth_authorizations set scopes = '{keys:read,usage:read,me:read}'`, ["keys:read", "usage:read", "me:read"]],
		["the app was revoked", `update oauth_authorizations set revoked_at = now()`, ["me:read", "usage:read", "keys:read"]],
	])("answers 409 and keeps the newer row when %s between the read and the write", async (_label, change, after) => {
		await store(["me:read", "usage:read", "keys:read"]);
		state.betweenReadAndWrite = () => state.db.exec(change);
		const result = await reduce(["me:read", "usage:read"]);
		expect(result.status).toBe(409);
		expect(result.body.error).toBe("scopes_changed");
		expect(await stored()).toEqual(after);
	});
});
