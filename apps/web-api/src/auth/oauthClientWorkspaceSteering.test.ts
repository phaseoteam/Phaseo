import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import { ensureChatGatewayKey, resolveChatWorkspace } from "@/chat/proxy";
import type { Env } from "@/env";
import app from "@/index";
import { OAUTH_CLIENT_WRITE_REFUSAL } from "./oauthClientWrites";

// Browser chat with no workspace selected uses the person's default workspace, and only once they have
// confirmed that workspace's privacy settings. A token issued to an app (here the CLI, whose client ID is
// public) could set both: the default to another workspace the person belongs to, whose admins see its
// logs, and the confirmation. Later chats from the browser would then go there without the notice, after
// the token is revoked. The writes are refused for app tokens; the person's own session still makes them.

const VICTIM = "10000000-0000-4000-8000-000000000001";
const OWN_WS = "20000000-0000-4000-8000-000000000001";
const OTHER_WS = "20000000-0000-4000-8000-000000000002";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } as Env;
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as never;
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const CLI_TOKEN = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: VICTIM, aal: "aal2", client_id: "phaseo_cli" })}.signature`;
const SESSION_TOKEN = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: VICTIM, aal: "aal2" })}.signature`;
const refused = { error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL };

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let appMetadata: Record<string, unknown>;
let calls: Array<{ method: string; path: string }>;
let betweenReadAndWrite: (() => void) | null;

// Just enough of PostgREST (eq filters, upsert by user_id, update) and the auth API for these routes.
function fakeSupabase() {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		calls.push({ method: request.method, path: url.pathname });
		const body = request.method === "GET" ? null : await request.text().then((text) => text ? JSON.parse(text) : null);
		if (url.pathname === "/auth/v1/user") {
			const token = request.headers.get("authorization")?.replace("Bearer ", "");
			if (token !== CLI_TOKEN && token !== SESSION_TOKEN) return Response.json({ message: "invalid" }, { status: 401 });
			return Response.json({ id: VICTIM, email: "person@example.com", created_at: "2026-01-01T00:00:00Z", app_metadata: appMetadata, user_metadata: {}, factors: [] });
		}
		if (url.pathname === `/auth/v1/admin/users/${VICTIM}`) {
			appMetadata = body.app_metadata;
			return Response.json({ id: VICTIM, app_metadata: appMetadata });
		}
		const table = url.pathname.replace("/rest/v1/", "");
		const filters = [...url.searchParams].filter(([, value]) => value.startsWith("eq.") || value === "is.null").map(([column, value]) => [column, value] as const);
		// eq on a JSON column compares the JSON, as Postgres does for jsonb.
		const text = (value: unknown) => value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
		const matching = (db[table] ?? []).filter((row) => filters.every(([column, value]) => value === "is.null" ? row[column] == null : text(row[column]) === value.slice(3)));
		if (request.method === "GET") return Response.json(matching);
		if (request.method === "POST" && table === "users") {
			for (const incoming of [body].flat()) {
				const existing = db.users.find((row) => row.user_id === incoming.user_id);
				if (existing) Object.assign(existing, incoming); else db.users.push({ ...incoming });
			}
			return new Response(null, { status: 201 });
		}
		if (request.method === "PATCH") {
			betweenReadAndWrite?.();
			const targets = (db[table] ?? []).filter((row) => filters.every(([column, value]) => value === "is.null" ? row[column] == null : text(row[column]) === value.slice(3)));
			for (const row of targets) Object.assign(row, body);
			return request.headers.get("prefer")?.includes("return=representation") ? Response.json(targets) : new Response(null, { status: 204 });
		}
		return Response.json({ message: `unexpected ${request.method} ${url.pathname}` }, { status: 500 });
	}));
}

beforeEach(() => {
	db = {
		users: [{ user_id: VICTIM, default_workspace_id: OWN_WS, onboarding_state: {} }],
		workspace_members: [
			{ workspace_id: OWN_WS, user_id: VICTIM, role: "owner" },
			// Someone else's workspace that invited the person; its admins control its logging.
			{ workspace_id: OTHER_WS, user_id: VICTIM, role: "member" },
		],
		workspaces: [
			{ id: OWN_WS, owner_user_id: VICTIM, name: "Mine", slug: "mine", logo_url: null },
			{ id: OTHER_WS, owner_user_id: "10000000-0000-4000-8000-0000000000ff", name: "Theirs", slug: "theirs", logo_url: null },
		],
	};
	appMetadata = { chat_privacy_reviews: { [OWN_WS]: CHAT_PRIVACY_REVIEW_VERSION } };
	calls = [];
	betweenReadAndWrite = null;
	fakeSupabase();
});
afterEach(() => vi.unstubAllGlobals());

async function send(token: string, method: string, path: string, body: unknown) {
	const response = await app.request(`https://phaseo.app${path}`, {
		method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
	}, env, executionCtx);
	return { status: response.status, body: await response.json().catch(() => null) };
}

async function steer(token: string) {
	return [
		await send(token, "PUT", "/api/account/settings/account/profile", { default_workspace_id: OTHER_WS }),
		await send(token, "POST", "/api/account/settings/privacy/review", { workspaceId: OTHER_WS, version: CHAT_PRIVACY_REVIEW_VERSION, accepted: true }),
		await send(token, "PUT", "/api/account/auth/onboarding", { workspaceId: OTHER_WS }),
	];
}

/** What browser chat does with no workspace cookie: the workspace it picks, and whether the privacy notice still applies. */
async function browserChat() {
	const resolved = await resolveChatWorkspace(new Request("https://phaseo.app/api/chat", { headers: { authorization: `Bearer ${SESSION_TOKEN}` } }), env);
	if ("status" in resolved) throw new Error(String(resolved.code));
	// No key seed in this env, so a reviewed workspace stops at configuration; an unreviewed one at the notice.
	const key = await ensureChatGatewayKey(env, resolved as Parameters<typeof ensureChatGatewayKey>[1], () => undefined);
	return { workspaceId: resolved.workspaceId, privacyNotice: "code" in key && key.code === "chat_privacy_review_required" };
}

describe("an app token can't steer browser chat into another workspace", () => {
	it("refuses the default workspace, the privacy confirmation and the onboarding workspace", async () => {
		for (const result of await steer(CLI_TOKEN)) expect(result).toEqual({ status: 403, body: refused });
		expect(db.users[0]).toMatchObject({ default_workspace_id: OWN_WS, onboarding_state: {} });
		expect(appMetadata).toEqual({ chat_privacy_reviews: { [OWN_WS]: CHAT_PRIVACY_REVIEW_VERSION } });

		// Browser chat still uses the person's own workspace, and the other one still shows the privacy notice.
		expect(await browserChat()).toEqual({ workspaceId: OWN_WS, privacyNotice: false });
		db.users[0]!.default_workspace_id = OTHER_WS;
		expect(await browserChat()).toEqual({ workspaceId: OTHER_WS, privacyNotice: true });
	});

	it.each([
		["workspaceId", OTHER_WS],
		["selectedKeyId", "30000000-0000-4000-8000-000000000001"],
		["createdKeyId", "30000000-0000-4000-8000-000000000002"],
	])("refuses an onboarding %s from an app token, alone or with progress", async (field, value) => {
		for (const body of [{ [field]: value }, { status: "started", [field]: value }]) {
			expect(await send(CLI_TOKEN, "PUT", "/api/account/auth/onboarding", body)).toEqual({ status: 403, body: refused });
		}
		expect(db.users[0]!.onboarding_state).toEqual({});
		expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
		// The person's own session saves it.
		expect((await send(SESSION_TOKEN, "PUT", "/api/account/auth/onboarding", { [field]: value })).status).toBe(200);
		expect(db.users[0]!.onboarding_state).toMatchObject({ [field]: value });
	});

	it("answers 409 instead of putting back an onboarding workspace the dashboard changed meanwhile", async () => {
		db.users[0]!.onboarding_state = { workspaceId: OWN_WS, completedSteps: ["install-cli"] };
		// The person picks the other workspace in the dashboard while the app's progress update is in flight.
		betweenReadAndWrite = () => { db.users[0]!.onboarding_state = { workspaceId: OTHER_WS, completedSteps: ["install-cli"] }; };
		const result = await send(CLI_TOKEN, "PUT", "/api/account/auth/onboarding", { completedSteps: ["first-request"] });
		expect(result).toMatchObject({ status: 409, body: { error: "onboarding_changed" } });
		expect(db.users[0]!.onboarding_state).toEqual({ workspaceId: OTHER_WS, completedSteps: ["install-cli"] });
		// Read again, the same progress applies over the person's choice.
		betweenReadAndWrite = null;
		expect((await send(CLI_TOKEN, "PUT", "/api/account/auth/onboarding", { completedSteps: ["first-request"] })).status).toBe(200);
		expect(db.users[0]!.onboarding_state).toMatchObject({ workspaceId: OTHER_WS, completedSteps: ["install-cli", "first-request"] });
	});

	it("lets the person's own session make the same changes", async () => {
		for (const result of await steer(SESSION_TOKEN)) expect(result.status).toBe(200);
		expect(db.users[0]).toMatchObject({ default_workspace_id: OTHER_WS, onboarding_state: { workspaceId: OTHER_WS } });
		expect(await browserChat()).toEqual({ workspaceId: OTHER_WS, privacyNotice: false });
	});

	it("still lets an app token change the name, display preferences and onboarding progress", async () => {
		expect((await send(CLI_TOKEN, "PUT", "/api/account/settings/account/profile", { display_name: "Pat", obfuscate_info: true })).status).toBe(200);
		expect(db.users[0]).toMatchObject({ display_name: "Pat", obfuscate_info: true, default_workspace_id: OWN_WS });
		const progress = await send(CLI_TOKEN, "PUT", "/api/account/auth/onboarding", { status: "started", completedSteps: ["install-cli"] });
		expect(progress.status).toBe(200);
		expect(db.users[0]!.onboarding_state).toMatchObject({ status: "started", completedSteps: ["install-cli"] });
	});
});

describe("an app token can't steer browser chat through a GET or HEAD", () => {
	const persist = `/api/account/auth/workspace?requested=${OTHER_WS}&persist=1`;
	async function request(token: string, method: "GET" | "HEAD", path: string) {
		return app.request(`https://phaseo.app${path}`, { method, headers: { authorization: `Bearer ${token}` }, redirect: "manual" }, env, executionCtx);
	}

	it.each(["GET", "HEAD"] as const)("%s workspace?persist=1 resolves for an app token without moving the default", async (method) => {
		const response = await request(CLI_TOKEN, method, persist);
		expect(response.status).toBe(200);
		if (method === "GET") expect(await response.json()).toMatchObject({ signedIn: true, workspaceId: OTHER_WS });
		expect(db.users[0]!.default_workspace_id).toBe(OWN_WS);
		expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
		expect(await browserChat()).toEqual({ workspaceId: OWN_WS, privacyNotice: false });
	});

	it.each(["GET", "HEAD"] as const)("%s workspace?persist=1 still persists for the person's own session", async (method) => {
		expect((await request(SESSION_TOKEN, method, persist)).status).toBe(200);
		expect(db.users[0]!.default_workspace_id).toBe(OTHER_WS);
		// Their chat then goes there, and the other workspace's notice still applies.
		expect(await browserChat()).toEqual({ workspaceId: OTHER_WS, privacyNotice: true });
	});

	it.each(["GET", "HEAD"] as const)("%s on browser chat routes is refused for an app token before a chat key exists", async (method) => {
		for (const path of ["/api/chat/video?id=vid_1", "/api/chat/audio?id=mus_1", "/api/chat/realtime/session/rt_01h00000000000000000000000"]) {
			const response = await request(CLI_TOKEN, method, path);
			expect(response.status, path).toBe(403);
			if (method === "GET") expect(await response.json()).toEqual(refused);
		}
		expect(calls).toEqual([]);
	});

	it("doesn't let an app token finish a Slack install on the browser's OAuth callback", async () => {
		const callback = "/api/account/settings/slack/oauth/callback?state=signed-state&code=slack-code";
		const refusedCallback = await request(CLI_TOKEN, "GET", callback);
		expect(refusedCallback.status).toBe(302);
		expect(refusedCallback.headers.get("location")).toContain("error=sign_in_required");
		expect(calls).toEqual([]);
		// The person's own session gets past that check (and stops at the forged state here).
		const session = await request(SESSION_TOKEN, "GET", callback);
		expect(session.headers.get("location")).not.toContain("error=sign_in_required");
	});
});
