import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { fakeDataClient, type FakeHandler } from "./fakeDataClient.testing";
import { hashWorkToken } from "./tokens";
import { isAllowedWebhookUrl, parseWebhookEvents, runWebhooks, signWebhook, webhookEvent } from "./webhooks";

const mocks = vi.hoisted(() => ({ handler: (() => undefined) as FakeHandler, fake: null as null | ReturnType<typeof import("./fakeDataClient.testing").fakeDataClient> }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.fake!.client }));
vi.mock("./github", async (importOriginal) => ({ ...(await importOriginal<typeof import("./github")>()), decryptGithubToken: async () => "whsec_test" }));

const { apiItem, parseApiItemFields, publicWorkApiRouter } = await import("./publicApi");
const app = new Hono<{ Bindings: Env }>();
app.route("/v1", publicWorkApiRouter);
const WS = "00000000-0000-4000-8000-000000000001";
const READ = `pwk_${"r".repeat(43)}`;
const WRITE = `pwk_${"w".repeat(43)}`;

const row = (overrides: Record<string, unknown> = {}) => ({
	id: "item-1", workspace_id: WS, number: 4, title: "Checkout fails", description: "Secret customer words", state: "todo", priority: 2, source: "ask", labels: [], assignee_user_id: null, assignee_agent: null,
	duplicate_of: null, error_group_id: null, github_repo: null, github_issue_number: null, github_issue_url: null, github_pr_url: null, triage_summary: "Payments fail on Safari.", due_at: null,
	created_by: null, created_at: "t", updated_at: "t", closed_at: null, project_id: null, cycle_id: null, parent_id: null, estimate: null, sla_due_at: null, last_activity_at: "t", ...overrides,
});

async function useKeys() {
	const read = await hashWorkToken(READ);
	const write = await hashWorkToken(WRITE);
	mocks.fake = fakeDataClient((query) => {
		if (query.table === "work_api_keys" && query.op === "select") {
			const hash = query.filters.find(([name, column]) => name === "eq" && column === "key_hash")?.[2];
			if (hash === read) return { data: { id: "k1", workspace_id: WS, access: "read", revoked_at: null }, error: null };
			if (hash === write) return { data: { id: "k2", workspace_id: WS, access: "write", revoked_at: null }, error: null };
			return { data: null, error: null };
		}
		return mocks.handler(query) ?? { data: null, error: null };
	});
}

const call = (path: string, token: string | null, init: RequestInit = {}) => app.request(path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) } }, { ENV: "production" } as Env);

beforeEach(async () => {
	mocks.handler = () => undefined;
	await useKeys();
});

describe("public work API", () => {
	it("needs a work API key", async () => {
		expect((await call("/v1/items", null)).status).toBe(401);
		expect((await call("/v1/items", `pwe_${"x".repeat(43)}`)).status).toBe(401);
		expect((await call("/v1/items", `pwk_${"z".repeat(43)}`)).status).toBe(401);
	});

	it("lists only the key's workspace, and never shows an ask's description", async () => {
		mocks.handler = (query) => (query.table === "work_items" ? { data: [row()], error: null } : undefined);
		const response = await call("/v1/items?state=open", READ);
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.items[0]).toMatchObject({ number: 4, description: null, triageSummary: "Payments fail on Safari." });
		const list = mocks.fake!.queries.find((query) => query.table === "work_items")!;
		expect(list.filters).toContainEqual(["eq", "workspace_id", WS]);
		expect(JSON.stringify(body)).not.toContain("Secret customer words");
	});

	it("keeps read keys from writing", async () => {
		expect((await call("/v1/items", READ, { method: "POST", body: JSON.stringify({ title: "x" }) })).status).toBe(403);
		expect((await call("/v1/items/4/comments", READ, { method: "POST", body: JSON.stringify({ body: "x" }) })).status).toBe(403);
	});

	it("creates items with a write key", async () => {
		mocks.fake!.onRpc(() => ({ data: row({ source: "manual", description: "From CI" }), error: null }));
		const response = await call("/v1/items", WRITE, { method: "POST", body: JSON.stringify({ title: "Nightly build failed", description: "From CI", priority: 2, labels: ["CI"] }) });
		expect(response.status).toBe(201);
		expect((await response.json() as any).item.description).toBe("From CI");
		const create = mocks.fake!.rpcCalls.find((rpc) => rpc.name === "create_work_item")!;
		expect(create.args).toMatchObject({ p_workspace_id: WS, p_title: "Nightly build failed", p_source: "manual" });
	});

	it("won't replace an ask's description", async () => {
		mocks.handler = (query) => (query.table === "work_items" ? { data: row(), error: null } : undefined);
		const response = await call("/v1/items/4", WRITE, { method: "PATCH", body: JSON.stringify({ description: "overwrite" }) });
		expect(response.status).toBe(400);
	});

	it("validates fields", () => {
		expect(parseApiItemFields({ title: " Hi ", state: "done", labels: ["Bug"] }, true)).toEqual({ ok: true, changes: { title: "Hi", state: "done", labels: ["bug"] } });
		expect(parseApiItemFields({ state: "closed" }, false).ok).toBe(false);
		expect(parseApiItemFields({}, true).ok).toBe(false);
		expect(apiItem(row({ source: "manual" }) as any).description).toBe("Secret customer words");
	});
});

describe("webhooks", () => {
	it("only sends to public https host names", () => {
		expect(isAllowedWebhookUrl("https://hooks.example.com/phaseo")).toBe(true);
		for (const url of ["http://hooks.example.com", "https://127.0.0.1/x", "https://[::1]/x", "https://localhost/x", "https://box.internal/x", "https://user:pw@example.com", "https://example.com:8443/x", "https://intranet/x"]) {
			expect(isAllowedWebhookUrl(url)).toBe(false);
		}
	});

	it("accepts known event kinds only", () => {
		expect(parseWebhookEvents(["state", "comment", "state"])).toEqual(["state", "comment"]);
		expect(parseWebhookEvents(["nope"])).toBeNull();
		expect(parseWebhookEvents([])).toBeNull();
	});

	it("signs t.body with HMAC-SHA256", async () => {
		const signature = await signWebhook("whsec_test", 1_700_000_000, "{}");
		expect(signature).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
		expect(await signWebhook("whsec_test", 1_700_000_000, "{}")).toBe(signature);
		expect(await signWebhook("whsec_other", 1_700_000_000, "{}")).not.toBe(signature);
	});

	it("sends only comment text, never other event bodies", () => {
		const item = { number: 4, title: "T", state: "todo", priority: 2 };
		expect(webhookEvent({ id: "e1", kind: "customer_request", author_kind: "customer", author_name: null, body: "Customer request from Acme", created_at: "t", item }, "https://p.test")).not.toHaveProperty("body");
		expect(webhookEvent({ id: "e2", kind: "comment", author_kind: "user", author_name: "Ana", body: "Fixed", created_at: "t", item }, "https://p.test")).toMatchObject({ body: "Fixed", item: { url: "https://p.test/work/4" } });
	});

	it("moves the cursor only after a 2xx, and counts failures", async () => {
		const updates: Array<Record<string, unknown>> = [];
		const client = fakeDataClient((query) => {
			if (query.table === "work_webhooks" && query.op === "select") return { data: [{ id: "h1", workspace_id: WS, url: "https://hooks.example.com/x", secret_ciphertext: "c", events: ["comment"], cursor_at: "2026-11-02T10:00:00Z", cursor_id: null, failure_count: 3 }], error: null };
			if (query.table === "work_item_events") return { data: [{ id: "e9", kind: "comment", author_kind: "user", author_name: "Ana", body: "Hi", created_at: "2026-11-02T10:01:00Z", item: { number: 4, title: "T", state: "todo", priority: 2 } }], error: null };
			if (query.table === "work_webhooks" && query.op === "update") updates.push(query.payload as Record<string, unknown>);
			return { data: null, error: null };
		});
		const now = new Date("2026-11-02T10:02:00Z");
		const ok = vi.fn(async () => new Response("ok", { status: 200 }));
		expect(await runWebhooks({ env: {} as Env, client: client.client, now, fetcher: ok as never })).toMatchObject({ delivered: 1, events: 1 });
		expect(updates[0]).toMatchObject({ cursor_at: "2026-11-02T10:01:00Z", cursor_id: "e9", failure_count: 0, last_status: 200 });
		const [, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
		expect((init.headers as Record<string, string>)["x-phaseo-signature"]).toMatch(/^t=\d+,v1=/);
		updates.length = 0;
		const down = vi.fn(async () => new Response("no", { status: 500 }));
		await runWebhooks({ env: {} as Env, client: client.client, now, fetcher: down as never });
		expect(updates[0]).toMatchObject({ failure_count: 4, last_status: 500 });
		expect(updates[0]).not.toHaveProperty("cursor_at");
	});
});
