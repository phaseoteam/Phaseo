import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import { parseSkillEdit } from "./settings-slack-memory";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000d1";
const NOTE_ID = "00000000-0000-4000-8000-0000000000e1";
const SKILL_ID = "00000000-0000-4000-8000-0000000000f1";
const env = {
	ENV: "production" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

const note = {
	id: NOTE_ID, kind: "pin", channel_id: null, text: "Our fiscal year starts on 1 April.", done_at: null, created_by: "U0PERSON01",
	created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-20T09:00:00Z", expires_at: null,
};
const skill = {
	id: SKILL_ID, name: "Weekly report", description: "Summarise the week.", instructions: "List what shipped.", created_by: "U0PERSON01",
	created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-20T09:00:00Z",
};

type Recorded = { url: URL; method: string; body: any; headers: Headers };
type Fixture = {
	role?: string | null;
	installed?: boolean;
	notes?: Array<Record<string, unknown>>;
	notesTotal?: number;
	notesUsed?: number;
	skills?: Array<Record<string, unknown>>;
	/** What a DELETE or PATCH on a memory table returns: the rows it changed, or a PostgREST error. */
	changed?: Array<Record<string, unknown>> | { status: number; body: Record<string, unknown> };
};

function database(fixture: Fixture = {}) {
	const requests: Recorded[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers });
		const path = url.pathname;
		if (path.endsWith("/auth/v1/user")) {
			if (request.headers.get("authorization") !== "Bearer token-a") return Response.json({ message: "invalid token" }, { status: 401 });
			return Response.json({ id: "user-a", email: "user-a@example.com", app_metadata: { chat_privacy_reviews: { [WORKSPACE]: CHAT_PRIVACY_REVIEW_VERSION } } });
		}
		if (path.endsWith("/workspace_members")) return Response.json(fixture.role === null ? [] : [{ role: fixture.role ?? "admin" }]);
		if (path.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (path.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
		if (path.endsWith("/slack_installations")) return Response.json(fixture.installed === false ? [] : [{ id: INSTALLATION_ID, team_name: "Acme" }]);
		if (path.endsWith("/slack_agent_notes") || path.endsWith("/slack_agent_skills")) {
			if (request.method === "DELETE" || request.method === "PATCH") {
				const changed = fixture.changed ?? [];
				return Array.isArray(changed) ? Response.json(changed) : Response.json(changed.body, { status: changed.status });
			}
			if (path.endsWith("/slack_agent_skills")) return Response.json(fixture.skills ?? [skill]);
			if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${fixture.notesUsed ?? 1}` } });
			const notes = fixture.notes ?? [note];
			return Response.json(notes, { headers: { "content-range": `0-${Math.max(notes.length - 1, 0)}/${fixture.notesTotal ?? notes.length}` } });
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

describe("Slack agent memory in settings", () => {
	it("shows owners and admins the live installation's unexpired notes and its skills, counted in the database", async () => {
		const requests = database({ notesTotal: 1, notesUsed: 37 });
		const response = await call(`/slack/memory?workspaceId=${WORKSPACE}&kind=pin`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.json()).toEqual({
			notes: [note], notes_total: 1, notes_used: 37, notes_limit: 500, skills: [skill], skills_limit: 100,
		});
		const [listed] = find(requests, "GET", "/slack_agent_notes");
		expect(listed.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		expect(listed.url.searchParams.get("kind")).toBe("eq.pin");
		expect(listed.url.searchParams.get("or")).toMatch(/^\(expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/);
		expect(listed.url.searchParams.get("limit")).toBe("500");
		expect(listed.headers.get("prefer")).toContain("count=exact");
		const [used] = find(requests, "HEAD", "/slack_agent_notes");
		expect(used.url.searchParams.get("kind")).toBeNull();
		expect(used.headers.get("prefer")).toContain("count=exact");
		const [skills] = find(requests, "GET", "/slack_agent_skills");
		expect(skills.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		expect(skills.url.searchParams.get("limit")).toBe("100");
	});

	it("lists every kind without a filter, and refuses an unknown kind", async () => {
		const requests = database();
		expect((await call(`/slack/memory?workspaceId=${WORKSPACE}`)).status).toBe(200);
		expect(find(requests, "GET", "/slack_agent_notes")[0].url.searchParams.get("kind")).toBeNull();
		expect((await call(`/slack/memory?workspaceId=${WORKSPACE}&kind=message`)).status).toBe(400);
	});

	it("is for owners and admins of a workspace with the agent installed", async () => {
		const memberRequests = database({ role: "member" });
		expect((await call(`/slack/memory?workspaceId=${WORKSPACE}`)).status).toBe(403);
		expect(find(memberRequests, "GET", "/slack_agent_notes")).toHaveLength(0);
		database({ role: null });
		expect((await call(`/slack/memory?workspaceId=${WORKSPACE}`)).status).toBe(403);
		database({ installed: false });
		const response = await call(`/slack/memory?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: "not_installed" });
		database();
		expect((await call(`/slack/memory?workspaceId=${WORKSPACE}`, {}, "")).status).toBe(403);
		expect((await call("/slack/memory")).status).toBe(400);
	});

	it("deletes a note of the live installation and records its id and kind, never its text", async () => {
		const requests = database({ changed: [{ id: NOTE_ID, kind: "pin" }] });
		const response = await call(`/slack/memory/notes/${NOTE_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: NOTE_ID, deleted: true });
		const [deleted] = find(requests, "DELETE", "/slack_agent_notes");
		expect(deleted.url.searchParams.get("id")).toBe(`eq.${NOTE_ID}`);
		expect(deleted.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		const [audit] = find(requests, "POST", "/workspace_audit_events");
		expect(audit.body).toMatchObject({ action: "slack_agent.memory_note_deleted", target_type: "slack_agent_note", target_id: NOTE_ID, metadata: { installation_id: INSTALLATION_ID, kind: "pin" } });
		expect(JSON.stringify(audit.body)).not.toContain("fiscal");
	});

	it("says when the note or skill was already gone, and refuses bad ids and members", async () => {
		database({ changed: [] });
		const gone = await call(`/slack/memory/notes/${NOTE_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" });
		expect(gone.status).toBe(404);
		expect(await gone.json()).toMatchObject({ error: "memory_not_found" });
		expect((await call(`/slack/memory/skills/${SKILL_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" })).status).toBe(404);
		expect((await call(`/slack/memory/notes/not-an-id?workspaceId=${WORKSPACE}`, { method: "DELETE" })).status).toBe(400);
		const requests = database({ role: "member", changed: [{ id: NOTE_ID, kind: "pin" }] });
		expect((await call(`/slack/memory/notes/${NOTE_ID}?workspaceId=${WORKSPACE}`, { method: "DELETE" })).status).toBe(403);
		expect(find(requests, "DELETE", "/slack_agent_notes")).toHaveLength(0);
	});

	it("edits a skill's name, description and instructions, and deletes one", async () => {
		const requests = database({ changed: [{ ...skill, name: "Weekly summary" }] });
		const response = await call(`/slack/memory/skills/${SKILL_ID}`, {
			method: "PATCH",
			body: JSON.stringify({ workspaceId: WORKSPACE, name: "  Weekly\n summary ", instructions: "  Three bullets.\nNo more.  " }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ skill: { ...skill, name: "Weekly summary" } });
		const [patched] = find(requests, "PATCH", "/slack_agent_skills");
		expect(patched.body).toEqual({ name: "Weekly summary", instructions: "Three bullets.\nNo more." });
		expect(patched.url.searchParams.get("installation_id")).toBe(`eq.${INSTALLATION_ID}`);
		expect(find(requests, "POST", "/workspace_audit_events")[0].body).toMatchObject({ action: "slack_agent.skill_updated", target_id: SKILL_ID, metadata: { changed_fields: ["name", "instructions"] } });

		const deleteRequests = database({ changed: [{ id: SKILL_ID }] });
		expect((await call(`/slack/memory/skills/${SKILL_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(200);
		expect(find(deleteRequests, "POST", "/workspace_audit_events")[0].body).toMatchObject({ action: "slack_agent.skill_deleted", target_type: "slack_agent_skill", target_id: SKILL_ID });
	});

	it("explains a taken name and refuses edits the database would", async () => {
		database({ changed: { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint \"slack_agent_skills_name_idx\"" } } });
		const taken = await call(`/slack/memory/skills/${SKILL_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, name: "Daily report" }) });
		expect(taken.status).toBe(409);
		expect(await taken.json()).toMatchObject({ error: "skill_name_taken" });
		const requests = database();
		expect((await call(`/slack/memory/skills/${SKILL_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, name: "x".repeat(61) }) })).status).toBe(400);
		expect((await call(`/slack/memory/skills/${SKILL_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(400);
		expect(find(requests, "PATCH", "/slack_agent_skills")).toHaveLength(0);
	});
});

describe("skill edits", () => {
	it("keep names and descriptions on one line, count characters as the database does, and refuse anything else", () => {
		expect(parseSkillEdit({ workspaceId: WORKSPACE, description: " Summarise\tthe week. " })).toEqual({ ok: true, value: { description: "Summarise the week." } });
		expect(parseSkillEdit({ name: "😀".repeat(60) })).toEqual({ ok: true, value: { name: "😀".repeat(60) } });
		expect(parseSkillEdit({ instructions: "x".repeat(4_001) })).toEqual({ ok: false, message: "instructions must be at most 4,000 characters" });
		expect(parseSkillEdit({ name: "   " })).toEqual({ ok: false, message: "name can't be empty" });
		expect(parseSkillEdit({ name: 1 })).toEqual({ ok: false, message: "name must be text" });
		expect(parseSkillEdit({ created_by: "U0X" })).toEqual({ ok: false, message: "Unknown field: created_by" });
		expect(parseSkillEdit({})).toEqual({ ok: false, message: "Nothing to change" });
	});
});
