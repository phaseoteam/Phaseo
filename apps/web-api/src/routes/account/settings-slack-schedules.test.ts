import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import { parseScheduleStatus } from "./settings-slack-schedules";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000d1";
const SCHEDULE_ID = "00000000-0000-4000-8000-0000000000e1";
const env = {
	ENV: "production" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

const schedule = {
	id: SCHEDULE_ID, channel_id: "C0CHANNEL1", title: "Weekly spend", prompt: "Summarise last week's spend.", frequency: "weekly",
	hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London", created_by: "U0PERSON01", status: "active",
	pause_reason: null, next_run_at: "2026-11-02T09:00:00+00:00", last_run_at: "2026-10-26T09:00:00+00:00", last_result: "answered",
	last_result_reason: null, failures: 0, created_at: "2026-10-20T09:00:00Z",
};

type Recorded = { url: URL; method: string; body: any };
type Fixture = {
	role?: string | null;
	installed?: boolean;
	schedules?: Array<Record<string, unknown>>;
	/** What the status function returns (null: no such schedule), or a PostgREST error. */
	rpc?: Record<string, unknown> | null | { status: number; body: Record<string, unknown> };
	/** What a DELETE returns: the rows it removed. */
	deleted?: Array<Record<string, unknown>>;
};

function database(fixture: Fixture = {}) {
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
		if (path.endsWith("/slack_installations")) {
			return Response.json(fixture.installed === false ? [] : [{ id: INSTALLATION_ID, team_name: "Acme", schedules_enabled: true, schedules_max: 20, schedule_creators: "everyone" }]);
		}
		if (path.endsWith("/rpc/set_slack_agent_schedule_status")) {
			const result = fixture.rpc === undefined ? { ...schedule, status: "paused", pause_reason: "admin" } : fixture.rpc;
			if (result && "status" in result && typeof result.status === "number") return Response.json(result.body, { status: result.status });
			return Response.json(result);
		}
		if (path.endsWith("/slack_agent_schedules")) {
			if (request.method === "DELETE") return Response.json(fixture.deleted ?? []);
			const rows = fixture.schedules ?? [schedule];
			return Response.json(rows, { headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
		}
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}${url.search}`);
	}));
	return requests;
}

function call(path: string, init: RequestInit = {}, token = "token-a") {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
	}, env, executionCtx);
}

const find = (requests: Recorded[], method: string, suffix: string) =>
	requests.filter((entry) => entry.method === method && entry.url.pathname.endsWith(suffix));

afterEach(() => vi.unstubAllGlobals());

describe("parseScheduleStatus", () => {
	it("takes active or paused and nothing else", () => {
		expect(parseScheduleStatus({ workspaceId: WORKSPACE, status: "paused" })).toEqual({ ok: true, status: "paused" });
		expect(parseScheduleStatus({ status: "active" })).toEqual({ ok: true, status: "active" });
		expect(parseScheduleStatus({ status: "deleted" })).toEqual({ ok: false, message: "status must be active or paused" });
		expect(parseScheduleStatus({ status: "paused", next_run_at: "2026-10-27T10:00:00Z" })).toEqual({ ok: false, message: "Unknown field: next_run_at" });
	});
});

describe("GET /slack/schedules", () => {
	it("lists the installation's schedules with the admins' settings, counted by the database", async () => {
		const requests = database();
		const response = await call(`/slack/schedules?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ schedules: [schedule], total: 1, limit: 20, enabled: true, creators: "everyone" });
		const [list] = find(requests, "GET", "/slack_agent_schedules");
		expect(list.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		expect(list.url.searchParams.get("limit")).toBe("100");
	});

	it("is for owners and admins of a workspace with the agent installed", async () => {
		database({ role: "member" });
		expect((await call(`/slack/schedules?workspaceId=${WORKSPACE}`)).status).toBe(403);
		database({ installed: false });
		expect((await call(`/slack/schedules?workspaceId=${WORKSPACE}`)).status).toBe(404);
		database();
		expect((await call("/slack/schedules")).status).toBe(400);
	});
});

describe("PATCH /slack/schedules/:id", () => {
	it("pauses or resumes through the database function and records it in the audit log", async () => {
		const requests = database();
		const response = await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "paused" }) });
		expect(response.status).toBe(200);
		expect(((await response.json()) as any).schedule).toMatchObject({ id: SCHEDULE_ID, status: "paused", pause_reason: "admin" });
		expect(find(requests, "POST", "/rpc/set_slack_agent_schedule_status")[0].body).toEqual({ p_installation_id: INSTALLATION_ID, p_schedule_id: SCHEDULE_ID, p_status: "paused" });
		const [audit] = find(requests, "POST", "/workspace_audit_events");
		expect(audit.body).toMatchObject({ action: "slack_agent.schedule_paused", target_type: "slack_agent_schedule", target_id: SCHEDULE_ID, metadata: { installation_id: INSTALLATION_ID } });
		expect(JSON.stringify(audit.body)).not.toContain("Weekly spend");
		// Nothing writes the table directly.
		expect(find(requests, "PATCH", "/slack_agent_schedules")).toHaveLength(0);

		const resumed = database({ rpc: schedule });
		await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "active" }) });
		expect(find(resumed, "POST", "/workspace_audit_events")[0].body.action).toBe("slack_agent.schedule_resumed");
	});

	it("404s for a schedule that isn't the installation's, and refuses anything but a status", async () => {
		database({ rpc: null });
		const missing = await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "active" }) });
		expect(missing.status).toBe(404);
		expect(await missing.json()).toMatchObject({ error: "schedule_not_found" });
		database();
		expect((await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "active", title: "x" }) })).status).toBe(400);
		expect((await call("/slack/schedules/not-an-id", { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "active" }) })).status).toBe(400);
		database({ rpc: { status: 500, body: { code: "XX000" } } });
		expect((await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "active" }) })).status).toBe(503);
		database({ role: "member" });
		expect((await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "paused" }) })).status).toBe(403);
	});
});

describe("DELETE /slack/schedules/:id", () => {
	it("deletes one of the installation's schedules", async () => {
		const requests = database({ deleted: [{ id: SCHEDULE_ID }] });
		const response = await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: SCHEDULE_ID, deleted: true });
		const [removed] = find(requests, "DELETE", "/slack_agent_schedules");
		expect(removed.url.searchParams.get("id")).toBe(`eq.${SCHEDULE_ID}`);
		expect(removed.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		expect(find(requests, "POST", "/workspace_audit_events")[0].body.action).toBe("slack_agent.schedule_deleted");
		database({ deleted: [] });
		expect((await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(404);
		database({ role: "member" });
		expect((await call(`/slack/schedules/${SCHEDULE_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(403);
	});
});
