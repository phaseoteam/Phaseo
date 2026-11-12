import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import app from "@/index";

// The authorized-app scope reduction updates only while the stored text[] still equals what it validated
// against. This runs the handler's PostgREST filters as SQL on Postgres (PGlite), the way PostgREST sends an
// eq value (an untyped literal the column's type parses), so the array literal and its comparison are real.

const USER = "10000000-0000-4000-8000-000000000001";
const AUTHORIZATION = "authorization-1";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } as Env;
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER, aal: "aal2" })}.signature`;

let db: PGlite;
let betweenReadAndWrite: (() => Promise<unknown>) | null = null;

beforeAll(async () => {
	db = new PGlite();
	await db.exec(`create table oauth_authorizations (id text primary key, user_id uuid not null, scopes text[] not null default '{}', revoked_at timestamptz)`);
});
afterAll(async () => { await db.close(); });

beforeEach(() => {
	betweenReadAndWrite = null;
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		if (url.pathname === "/auth/v1/user") return Response.json({ id: USER, email: "person@example.com", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, factors: [] });
		if (url.pathname !== "/rest/v1/oauth_authorizations") return Response.json({ message: "unexpected" }, { status: 500 });
		const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, "") ?? null;
		expect(url.searchParams.get("revoked_at")).toBe("is.null");
		if (request.method === "GET") {
			const { rows } = await db.query(`select id, scopes from oauth_authorizations where id = $1 and user_id = $2 and revoked_at is null`, [eq("id"), eq("user_id")]);
			await betweenReadAndWrite?.();
			return Response.json(rows);
		}
		if (request.method === "PATCH") {
			const { scopes } = await request.json() as { scopes: string[] };
			const { rows } = await db.query(
				`update oauth_authorizations set scopes = $1 where id = $2 and user_id = $3 and revoked_at is null and scopes = $4 returning id`,
				[scopes, eq("id"), eq("user_id"), eq("scopes")],
			);
			return Response.json(rows);
		}
		return Response.json({ message: "unexpected" }, { status: 500 });
	}));
});

async function store(scopes: string[]) {
	await db.query(`delete from oauth_authorizations`);
	await db.query(`insert into oauth_authorizations (id, user_id, scopes) values ($1, $2, $3)`, [AUTHORIZATION, USER, scopes]);
}
async function stored() {
	return (await db.query<{ scopes: string[] }>(`select scopes from oauth_authorizations where id = $1`, [AUTHORIZATION])).rows[0]?.scopes;
}
async function reduce(scopes: string[]) {
	const response = await app.request(`https://phaseo.app/api/account/settings/authorized-apps/${AUTHORIZATION}/scopes`, {
		method: "PATCH", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ scopes }),
	}, env);
	return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("authorized-app scope reduction on Postgres", () => {
	it.each([
		["in stored order", ["usage:read", "models:read", "keys:read"]],
		["with duplicates", ["models:read", "usage:read", "models:read"]],
		["with quotes, commas and backslashes", ["models:read", 'odd,"scope"\\x']],
	])("updates an unchanged array %s", async (_label, scopes) => {
		await store(scopes);
		expect(await reduce(["models:read"])).toEqual({ status: 200, body: { success: true, scopes: ["models:read"] } });
		expect(await stored()).toEqual(["models:read"]);
	});

	it("answers 409 and keeps the newer scopes when they changed between the read and the write", async () => {
		await store(["models:read", "usage:read", "keys:read"]);
		// The dashboard removes usage:read while the reduction is in flight.
		betweenReadAndWrite = () => db.query(`update oauth_authorizations set scopes = '{models:read,keys:read}' where id = $1`, [AUTHORIZATION]);
		const result = await reduce(["models:read", "usage:read"]);
		expect(result.status).toBe(409);
		expect(result.body).toMatchObject({ error: "scopes_changed" });
		expect(await stored()).toEqual(["models:read", "keys:read"]);
	});

	it("answers 409 when the same scopes were only reordered in between", async () => {
		await store(["models:read", "usage:read"]);
		betweenReadAndWrite = () => db.query(`update oauth_authorizations set scopes = '{usage:read,models:read}' where id = $1`, [AUTHORIZATION]);
		expect((await reduce(["models:read"])).status).toBe(409);
		expect(await stored()).toEqual(["usage:read", "models:read"]);
	});
});
