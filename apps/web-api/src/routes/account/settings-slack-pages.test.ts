import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import type { SlackAgentAdminBinding, SlackAgentPages } from "@/lib/slack-agent-admin";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000d1";
const PAGE_ID = "Q2hhcnRzQW5kVGFibGVzMQ";
const env = {
	ENV: "production" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

const listed: SlackAgentPages = {
	available: true,
	sign_in: true,
	limit: 200,
	pages: [{
		id: PAGE_ID, url: `https://slack.phaseo.app/p/${"a".repeat(64)}/${PAGE_ID}`, title: "October spend", access: "workspace",
		created_by: "U0PERSON01", created_at: "2026-10-20T09:00:00.000Z", expires_at: "2026-11-19T09:00:00.000Z", views: 4,
	}],
};

type Recorded = { url: URL; method: string; body: any };

function database(fixture: { role?: string | null; installed?: boolean } = {}) {
	const requests: Recorded[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null });
		const path = url.pathname;
		if (path.endsWith("/auth/v1/user")) {
			if (request.headers.get("authorization") !== "Bearer token-a") return Response.json({ message: "invalid token" }, { status: 401 });
			return Response.json({ id: "user-a", email: "user-a@example.com", app_metadata: { chat_privacy_reviews: { [WORKSPACE]: CHAT_PRIVACY_REVIEW_VERSION } } });
		}
		if (path.endsWith("/workspace_members")) return Response.json(fixture.role === null ? [] : [{ role: fixture.role ?? "admin" }]);
		if (path.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (path.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
		if (path.endsWith("/slack_installations")) return Response.json(fixture.installed === false ? [] : [{ id: INSTALLATION_ID, team_name: "Acme" }]);
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}${url.search}`);
	}));
	return requests;
}

function worker(overrides: Partial<SlackAgentAdminBinding> = {}) {
	return {
		listPages: vi.fn(async () => listed),
		deletePage: vi.fn(async () => true),
		deletePages: vi.fn(async () => undefined),
		...overrides,
	};
}

function call(path: string, init: RequestInit = {}, binding: Partial<SlackAgentAdminBinding> | null = worker(), token = "token-a") {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
	}, { ...env, ...(binding ? { SLACK_AGENT: binding } : {}) }, executionCtx);
}

afterEach(() => vi.unstubAllGlobals());

describe("Slack agent shared pages in settings", () => {
	it("lists the live installation's pages from the Slack Worker, for owners and admins", async () => {
		database();
		const binding = worker();
		const response = await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, binding);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.json()).toEqual(listed);
		expect(binding.listPages).toHaveBeenCalledWith(INSTALLATION_ID);
	});

	it("shows none where the Worker isn't bound, and says when it can't answer", async () => {
		database();
		expect(await (await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, null)).json()).toEqual({ available: false, sign_in: false, pages: [], limit: 200 });
		database();
		const failing = await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, worker({ listPages: async () => { throw new Error("binding down"); } }));
		expect(failing.status).toBe(503);
	});

	it("is for owners and admins of a workspace with the agent installed", async () => {
		const binding = worker();
		database({ role: "member" });
		expect((await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, binding)).status).toBe(403);
		database({ installed: false });
		expect((await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, binding)).status).toBe(404);
		database();
		expect((await call(`/slack/pages?workspaceId=${WORKSPACE}`, {}, binding, "")).status).toBe(403);
		expect((await call("/slack/pages", {}, binding)).status).toBe(400);
		expect(binding.listPages).not.toHaveBeenCalled();
	});

	it("deletes a page of the live installation, and records that without its id or title", async () => {
		const requests = database();
		const binding = worker();
		const response = await call(`/slack/pages/${PAGE_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) }, binding);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: PAGE_ID, deleted: true });
		expect(binding.deletePage).toHaveBeenCalledWith(INSTALLATION_ID, PAGE_ID);
		const audit = requests.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/workspace_audit_events"))!.body;
		expect(audit).toMatchObject({ action: "slack_agent.page_deleted", target_type: "slack_installation", target_id: INSTALLATION_ID, metadata: { installation_id: INSTALLATION_ID } });
		expect(JSON.stringify(audit)).not.toContain(PAGE_ID);
	});

	it("says when the page was already gone, and refuses bad ids and members", async () => {
		database();
		const gone = await call(`/slack/pages/${PAGE_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" }, worker({ deletePage: async () => false }));
		expect(gone.status).toBe(404);
		expect(await gone.json()).toMatchObject({ error: "page_not_found" });
		database();
		expect((await call(`/slack/pages/${PAGE_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" }, worker({ deletePage: async () => { throw new Error("down"); } }))).status).toBe(503);
		const binding = worker();
		expect((await call(`/slack/pages/not-a-page?workspaceId=${WORKSPACE}`, { method: "DELETE" }, binding)).status).toBe(400);
		database({ role: "member" });
		expect((await call(`/slack/pages/${PAGE_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" }, binding)).status).toBe(403);
		expect(binding.deletePage).not.toHaveBeenCalled();
	});
});
