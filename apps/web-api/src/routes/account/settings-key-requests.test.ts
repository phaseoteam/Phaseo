import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { decryptKeyRequestSecret } from "@/lib/keyRequestSecret";
import { hmac } from "./settings-keys";

// Approving a CLI key request: only the person's own dashboard session (never an OAuth token, Phaseo's
// CLI and desktop app included), with the usual MFA rule, as the requester and an owner or admin. The key
// gets exactly the stored name, limits and lifetime, its secret is never returned here, and a denied
// request creates nothing.

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "test-pepper",
	NON_ENTERPRISE_KEY_LIMIT: "100",
};

const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000011";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";

type Row = Record<string, any>;

function jwt(claims: Row) {
	const part = (value: Row) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: USER, role: "authenticated", ...claims })}.signature`;
}

const SESSION = jwt({ aal: "aal1" });
const CLI_TOKEN = jwt({ aal: "aal1", client_id: "phaseo_cli" });
const DESKTOP_TOKEN = jwt({ aal: "aal1", client_id: "phaseo_desktop" });
const APP_TOKEN = jwt({ aal: "aal1", client_id: "partner_app" });

let db: {
	request: Row;
	role: string;
	factors: Array<{ id: string; factor_type: string; status: string }>;
	rpcs: Array<{ name: string; args: Row }>;
	keyInserts: Row[];
	keyUpdates: Row[];
	audits: Row[];
	failKeyInsert: boolean;
	failFinish: boolean;
};

function storedRequest(extra: Row = {}): Row {
	return {
		id: REQUEST, workspace_id: WORKSPACE, requested_by: USER, requested_via: "oauth", oauth_client_id: "phaseo_cli",
		client_name: "Phaseo CLI", agent: "codex", key_name: "Phaseo CLI: Codex API Key", daily_cost_nanos: 5_000_000_000,
		monthly_cost_nanos: 100_000_000_000, key_lifetime_days: 90, status: "pending", key_id: null, decided_at: null,
		expires_at: "2026-11-06T20:10:00.000Z", created_at: "2026-11-06T20:00:00.000Z", ...extra,
	};
}

function rpc(name: string, args: Row): unknown {
	db.rpcs.push({ name, args });
	const row = db.request;
	if (name === "get_api_key_request") return [row];
	if (name === "begin_api_key_request_approval") {
		if (args.p_user_id !== row.requested_by) return { error: "api_key_request_not_found" };
		if (row.status !== "pending") return [{ status: row.status, changed: false, workspace_id: row.workspace_id, key_name: row.key_name, daily_cost_nanos: row.daily_cost_nanos, monthly_cost_nanos: row.monthly_cost_nanos, key_lifetime_days: row.key_lifetime_days }];
		row.status = "approving";
		return [{ status: "approving", changed: true, workspace_id: row.workspace_id, key_name: row.key_name, daily_cost_nanos: row.daily_cost_nanos, monthly_cost_nanos: row.monthly_cost_nanos, key_lifetime_days: row.key_lifetime_days }];
	}
	if (name === "finish_api_key_request_approval") {
		if (row.status !== "approving" || db.failFinish) return false;
		Object.assign(row, { status: "approved", key_id: args.p_key_id, secret_ciphertext: args.p_secret_ciphertext });
		return true;
	}
	if (name === "abort_api_key_request_approval") { row.status = "pending"; return true; }
	if (name === "deny_api_key_request") {
		if (args.p_user_id !== row.requested_by) return { error: "api_key_request_not_found" };
		if (row.status === "pending") row.status = "denied";
		return row.status;
	}
	return null;
}

function installSupabaseStub() {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
		if (url.pathname === "/auth/v1/user") {
			const token = request.headers.get("authorization")?.slice(7) ?? "";
			const sub = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub;
			return json({ id: sub, email: "person@example.com", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, factors: db.factors });
		}
		if (url.pathname.startsWith("/rest/v1/rpc/")) {
			const result = rpc(url.pathname.slice("/rest/v1/rpc/".length), await request.json() as Row);
			if (result && typeof result === "object" && "error" in (result as Row)) return json({ message: (result as Row).error, code: "P0002" }, 400);
			return json(result);
		}
		if (url.pathname === "/rest/v1/workspace_members") return json([{ role: db.role }]);
		if (url.pathname === "/rest/v1/workspaces") {
			if (url.searchParams.get("select")?.includes("tier")) return json([{ tier: "basic" }]);
			return json([{ owner_user_id: "someone-else", slug: "acme", name: "Acme", logo_url: null }]);
		}
		if (url.pathname === "/rest/v1/keys" && request.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
		if (url.pathname === "/rest/v1/keys" && request.method === "POST") {
			if (db.failKeyInsert) return json({ message: "key_limit_reached" }, 400);
			db.keyInserts.push(await request.json() as Row);
			return json([{ id: "key-1" }], 201);
		}
		if (url.pathname === "/rest/v1/keys" && request.method === "PATCH") {
			db.keyUpdates.push(await request.json() as Row);
			return json([]);
		}
		if (url.pathname === "/rest/v1/workspace_audit_events") { db.audits.push(await request.json() as Row); return json([], 201); }
		return json([]);
	}));
}

const SHOWN = { keyName: "Phaseo CLI: Codex API Key", dailyCostNanos: 5_000_000_000, monthlyCostNanos: 100_000_000_000, keyLifetimeDays: 90 };

function send(path: string, token: string, method = "GET", body?: Row) {
	return app.request(`https://phaseo.app/api/account/settings/keys/requests/${path}`, {
		method,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		...(body ? { body: JSON.stringify(body) } : {}),
	}, env);
}

const approve = (token = SESSION, shown: Row = SHOWN) => send(`${REQUEST}/approve`, token, "POST", { shown });
const deny = (token = SESSION) => send(`${REQUEST}/deny`, token, "POST", {});

beforeEach(() => {
	db = { request: storedRequest(), role: "admin", factors: [], rpcs: [], keyInserts: [], keyUpdates: [], audits: [], failKeyInsert: false, failFinish: false };
	installSupabaseStub();
});
afterEach(() => vi.unstubAllGlobals());

describe("key request approval", () => {
	it.each([["the CLI", CLI_TOKEN], ["the desktop app", DESKTOP_TOKEN], ["a third-party app", APP_TOKEN]])(
		"refuses a token issued to %s: only a dashboard session can approve, deny or read a request",
		async (_label, token) => {
			for (const response of [await approve(token), await deny(token), await send(REQUEST, token)]) {
				expect(response.status).toBe(403);
				expect(await response.json()).toMatchObject({ reason: "dashboard_session_required" });
			}
			expect(db.rpcs).toEqual([]);
			expect(db.keyInserts).toEqual([]);
		},
	);

	it("applies the MFA rule: a password-only session of a person with a second factor can't approve", async () => {
		db.factors = [{ id: "f1", factor_type: "totp", status: "verified" }];
		expect((await approve(SESSION)).status).toBe(401);
		expect((await approve(jwt({ aal: "aal2" }))).status).toBe(200);
		expect(db.keyInserts).toHaveLength(1);
	});

	it("shows the requester exactly what will be created", async () => {
		const response = await send(REQUEST, SESSION);
		expect(response.status).toBe(200);
		const { request } = await response.json() as { request: Row };
		expect(request).toEqual({
			id: REQUEST, status: "pending", workspaceId: WORKSPACE, workspaceName: "Acme", keyName: "Phaseo CLI: Codex API Key",
			agent: "codex", clientName: "Phaseo CLI", phaseoApp: true, requestedVia: "oauth", dailyCostNanos: 5_000_000_000,
			monthlyCostNanos: 100_000_000_000, keyLifetimeDays: 90, createdAt: "2026-11-06T20:00:00.000Z",
			expiresAt: "2026-11-06T20:10:00.000Z", decidedAt: null, keyId: null, canApprove: true,
		});
		expect(JSON.stringify(request)).not.toMatch(/challenge|cipher/);
	});

	it("creates the key the dashboard way with exactly the shown limits, and holds its secret sealed for pickup", async () => {
		const before = Date.now();
		const response = await approve();
		expect(response.status).toBe(200);
		const body = await response.json() as Row;
		expect(body).toEqual({ status: "approved", keyId: "key-1", prefix: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain("phaseo_v1_sk");

		expect(db.keyInserts).toHaveLength(1);
		const insert = db.keyInserts[0];
		expect(insert).toMatchObject({
			workspace_id: WORKSPACE, name: "Phaseo CLI: Codex API Key", status: "active", scopes: "[]", created_by: USER,
			daily_limit_cost_nanos: 5_000_000_000, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 100_000_000_000,
			daily_limit_requests: 0, weekly_limit_requests: 0, monthly_limit_requests: 0, storage_locations: [],
		});
		const lifetimeDays = (new Date(insert.expires_at).getTime() - before) / 86_400_000;
		expect(lifetimeDays).toBeGreaterThan(89.99);
		expect(lifetimeDays).toBeLessThan(90.01);

		const finish = db.rpcs.find((call) => call.name === "finish_api_key_request_approval")!;
		expect(finish.args).toMatchObject({ p_request_id: REQUEST, p_user_id: USER, p_key_id: "key-1", p_secret_ttl_seconds: 600 });
		const plaintext = await decryptKeyRequestSecret([env.KEY_PEPPER_ACTIVE], REQUEST, finish.args.p_secret_ciphertext);
		const [, , , kid, secret] = String(plaintext).split("_");
		expect(plaintext).toMatch(/^phaseo_v1_sk_/);
		expect(kid).toBe(insert.kid);
		expect(await hmac(env as any, secret)).toBe(insert.hash);
		expect(db.audits.map((event) => event.action)).toEqual(["api_key.created"]);
		expect(db.audits[0].metadata).toMatchObject({ keyRequestId: REQUEST, requestedBy: "Phaseo CLI" });
	});

	it("refuses to approve if the stored request isn't what the page showed", async () => {
		const response = await approve(SESSION, { ...SHOWN, monthlyCostNanos: 10_000_000_000 });
		expect(response.status).toBe(409);
		expect(db.rpcs.map((call) => call.name)).toEqual(["get_api_key_request"]);
		expect(db.keyInserts).toEqual([]);
	});

	it("lets only the requester approve, as an owner or admin", async () => {
		db.request = storedRequest({ requested_by: OTHER_USER });
		expect((await approve()).status).toBe(404);
		expect((await send(REQUEST, SESSION)).status).toBe(404);
		db.request = storedRequest();
		db.role = "member";
		expect((await approve()).status).toBe(403);
		expect(db.keyInserts).toEqual([]);
		expect(db.rpcs.some((call) => call.name === "begin_api_key_request_approval")).toBe(false);
	});

	it("approves once", async () => {
		expect((await approve()).status).toBe(200);
		const again = await approve();
		expect(again.status).toBe(409);
		expect(await again.json()).toMatchObject({ error: "not_pending", status: "approved" });
		expect(db.keyInserts).toHaveLength(1);
	});

	it("can't approve an expired request", async () => {
		db.request = storedRequest({ status: "expired" });
		expect((await approve()).status).toBe(409);
		expect(db.keyInserts).toEqual([]);
	});

	it("puts the request back when the key can't be created", async () => {
		db.failKeyInsert = true;
		expect((await approve()).status).toBe(409);
		expect(db.rpcs.map((call) => call.name)).toContain("abort_api_key_request_approval");
		expect(db.request.status).toBe("pending");
	});

	it("deletes the new key if the request can't hold its secret", async () => {
		db.failFinish = true;
		expect((await approve()).status).toBe(503);
		expect(db.keyUpdates).toEqual([expect.objectContaining({ status: "deleted", soft_blocked: true, hash: "deleted:key-1" })]);
		expect(db.request.status).toBe("pending");
	});

	it("denies without creating anything", async () => {
		const response = await deny();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "denied" });
		expect(db.keyInserts).toEqual([]);
		expect(db.audits.map((event) => event.action)).toEqual(["api_key_request.denied"]);
		expect((await approve()).status).toBe(409);
		expect(db.keyInserts).toEqual([]);
	});

	it("lets only the requester deny", async () => {
		db.request = storedRequest({ requested_by: OTHER_USER });
		expect((await deny()).status).toBe(404);
		expect(db.request.status).toBe("pending");
	});
});
