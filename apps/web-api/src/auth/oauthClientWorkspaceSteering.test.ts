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

// Just enough of PostgREST (eq filters, upsert by user_id, update) and the auth API for these routes.
function fakeSupabase() {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
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
		const filters = [...url.searchParams].filter(([, value]) => value.startsWith("eq.")).map(([column, value]) => [column, value.slice(3)] as const);
		const matching = (db[table] ?? []).filter((row) => filters.every(([column, value]) => String(row[column]) === value));
		if (request.method === "GET") return Response.json(matching);
		if (request.method === "POST" && table === "users") {
			for (const incoming of [body].flat()) {
				const existing = db.users.find((row) => row.user_id === incoming.user_id);
				if (existing) Object.assign(existing, incoming); else db.users.push({ ...incoming });
			}
			return new Response(null, { status: 201 });
		}
		if (request.method === "PATCH") {
			for (const row of matching) Object.assign(row, body);
			return new Response(null, { status: 204 });
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
