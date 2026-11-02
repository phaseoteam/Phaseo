import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000aa";
const ITEM_ID = "00000000-0000-4000-8000-000000000101";
const REQUEST_ID = "00000000-0000-4000-8000-000000000201";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000301";
const NOW = "2026-11-02T12:00:00.000Z";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	CHAT_ROUTE_KEY_SEED: "seed",
	PHASEO_GATEWAY_URL: "https://gateway.test",
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-encryption-key",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

function itemRow(overrides: Record<string, unknown> = {}) {
	return {
		id: ITEM_ID, workspace_id: WORKSPACE, number: 7, title: "Login fails", description: "", state: "todo", priority: 0,
		source: "manual", labels: [], assignee_user_id: null, assignee_agent: null, duplicate_of: null, error_group_id: null,
		github_repo: null, github_issue_number: null, github_issue_url: null, github_pr_url: null, triage_summary: null,
		due_at: null, created_by: USER, created_at: NOW, updated_at: NOW, closed_at: null, ...overrides,
	};
}

type Call = { url: URL; method: string; body: any; headers: Headers };
type Handler = (call: Call) => Response | Promise<Response> | undefined;

/** A fake Supabase (auth + PostgREST) and gateway; `handlers` answer table calls by path. */
function database(options: { admin?: boolean; member?: boolean; reviewed?: boolean; handlers?: Record<string, Handler> } = {}) {
	const calls: Call[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		const call = { url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers };
		calls.push(call);
		if (url.pathname.endsWith("/auth/v1/user")) {
			return Response.json({
				id: USER, email: "staff@example.com",
				app_metadata: options.reviewed ? { chat_privacy_reviews: { [WORKSPACE]: CHAT_PRIVACY_REVIEW_VERSION } } : {},
			});
		}
		const table = url.pathname.replace(/^.*\/rest\/v1\//, "").replace(/^.*\/auth\/v1\//, "auth:");
		const custom = options.handlers?.[table]?.(call);
		if (custom) return custom;
		if (table === "workspace_members") return Response.json(options.member === false ? [] : [{ role: "member", user_id: USER }]);
		if (table === "workspaces") return Response.json([{ owner_user_id: "owner", slug: "w", name: "W" }]);
		if (table === "users") return Response.json([{ role: options.admin === false ? "user" : "admin", user_id: USER, display_name: "Staff" }]);
		if (["work_subscriptions", "work_notifications", "work_settings", "work_item_relations"].includes(table)) {
			return request.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-range": "*/0" } }) : Response.json([], { status: request.method === "POST" ? 201 : 200 });
		}
		if (table === "work_item_events") return Response.json([{ id: "e1", workspace_id: WORKSPACE, work_item_id: ITEM_ID, kind: "comment", author_kind: "user", author_user_id: USER, author_name: null, body: call.body?.body ?? "", data: {}, created_at: NOW }], { status: 201 });
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}${url.search}`);
	}));
	return calls;
}

function call(path: string, init: RequestInit & { query?: string } = {}) {
	const separator = path.includes("?") ? "&" : "?";
	const url = init.method && init.method !== "GET" ? `https://phaseo.app/api/account/work${path}` : `https://phaseo.app/api/account/work${path}${separator}workspaceId=${WORKSPACE}`;
	return app.request(url, {
		...init,
		headers: { authorization: "Bearer fixture-token", "content-type": "application/json", ...(init.headers ?? {}) },
	}, env, executionCtx);
}

function write(path: string, method: string, body: Record<string, unknown>) {
	return call(path, { method, body: JSON.stringify({ workspaceId: WORKSPACE, ...body }) });
}

afterEach(() => vi.unstubAllGlobals());

describe("work account routes: access", () => {
	it("requires an internal admin", async () => {
		database({ admin: false });
		const response = await call("/items");
		expect(response.status).toBe(403);
	});

	it("requires workspace membership", async () => {
		database({ member: false });
		expect((await call("/items")).status).toBe(403);
	});
});

describe("GET /items", () => {
	it("lists open items newest first with a cursor", async () => {
		const calls = database({
			handlers: { work_items: () => Response.json([itemRow(), itemRow({ id: "00000000-0000-4000-8000-000000000102", number: 6 })]) },
		});
		const response = await call("/items?state=open&limit=1");
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({ number: 7, title: "Login fails" });
		expect(body.nextCursor).toEqual(expect.any(String));
		const list = calls.find((entry) => entry.url.pathname.endsWith("/work_items"))!;
		expect(list.url.searchParams.get("state")).toBe("not.in.(done,cancelled)");
		expect(list.url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
	});
});

describe("POST /items", () => {
	it("creates an item through create_work_item", async () => {
		const calls = database({ handlers: { "rpc/create_work_item": () => Response.json(itemRow({ state: "triage" })) } });
		const response = await write("/items", "POST", { title: "Login fails", labels: ["Bug"], priority: 2 });
		expect(response.status).toBe(201);
		const rpc = calls.find((entry) => entry.url.pathname.endsWith("/rpc/create_work_item"))!;
		expect(rpc.body).toMatchObject({ p_workspace_id: WORKSPACE, p_title: "Login fails", p_priority: 2, p_source: "manual", p_created_by: USER, p_fields: { labels: ["bug"] } });
	});

	it("validates the title", async () => {
		database();
		expect((await write("/items", "POST", { title: "" })).status).toBe(400);
	});
});

describe("PATCH /items/:number", () => {
	it("closes an item with closed_at and a state event", async () => {
		const calls = database({
			handlers: {
				work_items: (entry) => Response.json([entry.method === "PATCH" ? itemRow({ state: "done", closed_at: NOW }) : itemRow()]),
			},
		});
		const response = await write("/items/7", "PATCH", { state: "done" });
		expect(response.status).toBe(200);
		const patch = calls.find((entry) => entry.method === "PATCH" && entry.url.pathname.endsWith("/work_items"))!;
		expect(patch.body).toMatchObject({ state: "done", closed_at: expect.any(String) });
		const events = calls.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/work_item_events"))!;
		expect(events.body).toEqual([expect.objectContaining({ kind: "state", author_kind: "user", author_user_id: USER, data: { from: "todo", to: "done" } })]);
	});
});

describe("POST /items/:number/github", () => {
	it("answers 409 github_token_missing without a stored token", async () => {
		database({
			handlers: {
				work_items: () => Response.json([itemRow({ github_repo: "acme/app" })]),
				work_github_repos: () => Response.json([{ repo: "acme/app", github_token_ciphertext: null }]),
			},
		});
		const response = await write("/items/7/github", "POST", {});
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "github_token_missing" });
	});
});

describe("POST /items/:number/triage", () => {
	it("needs the Chat privacy review before creating the agent key", async () => {
		database({ handlers: { work_items: () => Response.json([itemRow()]) } });
		const response = await write("/items/7/triage", "POST", {});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "chat_privacy_review_required" });
	});

	it("runs the agent and applies the answer", async () => {
		const gateway = vi.fn();
		const calls = database({
			reviewed: true,
			handlers: {
				work_items: (entry) => {
					if (entry.method === "PATCH") return Response.json([itemRow({ state: "todo", priority: 2, triage_summary: "Sign-in fails.", labels: ["bug"], assignee_agent: "engineer" })]);
					if (entry.url.searchParams.get("state")) return Response.json([]);
					return Response.json([itemRow({ state: "triage" })]);
				},
				keys: (entry) => entry.method === "GET" ? Response.json([]) : new Response(null, { status: 201 }),
				work_customer_requests: () => Response.json([{ subject: "Login", body: "I am locked out, mail me at a@b.co", contact_name: "Ann Lee", customer: { name: "Acme", tier: "pro" } }]),
				work_agent_runs: (entry) => Response.json([{ id: "run-1", workspace_id: WORKSPACE, work_item_id: ITEM_ID, agent: "triage", runner: "gateway", status: entry.method === "PATCH" ? "succeeded" : "running", model: "openai/gpt-5.4-mini", cost_nanos: 4200, summary: null, output: {}, external_url: null, requested_by: USER, created_at: NOW, started_at: NOW, finished_at: null }]),
			},
		});
		const fetchMock = vi.mocked(fetch);
		const original = fetchMock.getMockImplementation()!;
		fetchMock.mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (url.hostname === "gateway.test") {
				gateway(JSON.parse(String(init?.body)));
				return Response.json({ output_text: JSON.stringify({ summary: "Ann Lee (a@b.co) cannot sign in.", priority: 2, labels: ["bug"], state: "todo", duplicateOf: null, engineering: true, reasoning: "Blocks use." }), cost_nanos: 4200, model: "openai/gpt-5.4-mini" });
			}
			return original(input, init);
		});
		const response = await write("/items/7/triage", "POST", {});
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.run).toMatchObject({ agent: "triage", status: "succeeded" });
		const prompt = JSON.stringify(gateway.mock.calls[0]![0]);
		expect(prompt).toContain("untrusted_data");
		expect(prompt).not.toContain("Ann Lee");
		const key = calls.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/keys"))!;
		expect(key.body).toMatchObject({ name: "__work_agent_managed_key__", created_by: USER, never_store_content: true });
		const patch = calls.find((entry) => entry.method === "PATCH" && entry.url.pathname.endsWith("/work_items"))!;
		expect(patch.body.triage_summary).toBe("a customer ([email removed]) cannot sign in.");
		expect(patch.body).toMatchObject({ state: "todo", priority: 2, assignee_agent: "engineer" });
	});
});

describe("PATCH /requests/:id", () => {
	it("links a request with an event that never includes its body", async () => {
		const request = {
			id: REQUEST_ID, workspace_id: WORKSPACE, customer_id: CUSTOMER_ID, work_item_id: null, intake_form_id: null, source: "form",
			status: "new", contact_name: "Ann Lee", contact_email: "ann@acme.com", subject: "Export", body: "SECRET BODY", metadata: {},
			created_by: null, created_at: NOW, updated_at: NOW, customer: { name: "Acme" }, item: null,
		};
		const calls = database({
			handlers: {
				work_items: () => Response.json([itemRow()]),
				work_customer_requests: (entry) => Response.json([entry.method === "PATCH" ? { ...request, status: "linked", work_item_id: ITEM_ID, item: { number: 7 } } : request]),
				work_customers: () => Response.json([{ name: "Acme" }]),
			},
		});
		const response = await write(`/requests/${REQUEST_ID}`, "PATCH", { workItemNumber: 7 });
		expect(response.status).toBe(200);
		const patch = calls.find((entry) => entry.method === "PATCH" && entry.url.pathname.endsWith("/work_customer_requests"))!;
		expect(patch.body).toMatchObject({ work_item_id: ITEM_ID, status: "linked" });
		const event = calls.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/work_item_events"))!;
		expect(event.body).toMatchObject({ kind: "customer_request", body: "Customer request from Acme" });
		expect(JSON.stringify(event.body)).not.toMatch(/SECRET BODY|ann@acme.com|Ann Lee/);
	});
});

describe("GET /customers", () => {
	it("counts requests and open items in the database", async () => {
		const calls = database({
			handlers: {
				work_customers: () => Response.json([{ id: CUSTOMER_ID, workspace_id: WORKSPACE, name: "Acme", domain: "acme.com", external_ref: null, tier: "pro", notes: "", created_at: NOW, updated_at: NOW }]),
				work_customer_requests: () => new Response(null, { status: 200, headers: { "content-range": "*/4" } }),
				work_items: () => new Response(null, { status: 200, headers: { "content-range": "*/2" } }),
			},
		});
		const response = await call("/customers");
		expect(response.status).toBe(200);
		expect((await response.json() as any).customers[0]).toMatchObject({ name: "Acme", requestCount: 4, openItemCount: 2 });
		const counts = calls.filter((entry) => entry.method === "HEAD");
		expect(counts).toHaveLength(2);
	});
});

describe("POST /github-repos", () => {
	it("returns the bridge token and workflow once and stores the GitHub token encrypted", async () => {
		const calls = database({
			handlers: {
				work_github_repos: (entry) => Response.json([{
					id: "00000000-0000-4000-8000-000000000401", workspace_id: WORKSPACE, repo: "acme/app", bridge_token_prefix: entry.body?.bridge_token_prefix,
					github_token_ciphertext: entry.body?.github_token_ciphertext, sync_issues: true, created_by: USER, created_at: NOW, last_event_at: null,
				}], { status: 201 }),
			},
		});
		const response = await write("/github-repos", "POST", { repo: "acme/app", githubToken: "github_pat_secret" });
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body.bridgeToken).toMatch(/^pwg_/);
		expect(typeof body.workflow).toBe("string");
		expect(body.repo).toMatchObject({ repo: "acme/app", hasGithubToken: true });
		expect(JSON.stringify(body)).not.toContain("github_pat_secret");
		const insert = calls.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/work_github_repos"))!;
		expect(insert.body.github_token_ciphertext).not.toContain("github_pat_secret");
		expect(insert.body.bridge_token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(body.workflow).not.toContain(body.bridgeToken);
	});
});
