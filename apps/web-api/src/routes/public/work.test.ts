import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { fakeDataClient, type FakeHandler } from "@/work/fakeDataClient.testing";
import { hashWorkToken } from "@/work/tokens";

const mocks = vi.hoisted(() => ({
	triageWorkItem: vi.fn(),
	handler: (() => undefined) as FakeHandler,
	fake: null as null | ReturnType<typeof import("@/work/fakeDataClient.testing").fakeDataClient>,
}));
vi.mock("@/work/triage", () => ({ triageWorkItem: mocks.triageWorkItem }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.fake!.client }));

const { publicWorkRouter } = await import("./work");

const app = new Hono<{ Bindings: Env }>();
app.route("/api/_web/work", publicWorkRouter);
const env = { ENV: "production" } as Env;
const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const FORM_TOKEN = `pwf_${"a".repeat(43)}`;
const ERROR_KEY = `pwe_${"b".repeat(43)}`;
const GITHUB_TOKEN = `pwg_${"c".repeat(43)}`;

function useFake(handler: FakeHandler) {
	mocks.fake = fakeDataClient(handler);
	return mocks.fake;
}

const post = (path: string, body: BodyInit, headers: Record<string, string> = { "content-type": "application/json" }, bindings: Partial<Env> = {}) =>
	app.request(`https://phaseo.app/api/_web/work${path}`, { method: "POST", headers, body }, { ...env, ...bindings });

describe("public work routes", () => {
	beforeEach(() => {
		mocks.triageWorkItem.mockReset().mockResolvedValue({ ok: true });
		useFake(() => undefined);
	});

	it("serves the capture script, cacheable for an hour", async () => {
		const response = await app.request("https://phaseo.app/api/_web/work/errors.js", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
		expect(await response.text()).toContain("PhaseoErrors");
	});

	it("answers CORS preflights for asks and errors", async () => {
		for (const path of [`/asks/${FORM_TOKEN}`, `/errors/${ERROR_KEY}`]) {
			const response = await app.request(`https://phaseo.app/api/_web/work${path}`, { method: "OPTIONS", headers: { origin: "https://shop.example.com" } }, env);
			expect(response.status).toBe(204);
			expect(response.headers.get("access-control-allow-origin")).toBe("*");
			expect(response.headers.get("access-control-allow-methods")).toContain("POST");
		}
	});

	it("rejects malformed tokens without touching the database", async () => {
		const fake = useFake(() => undefined);
		expect((await post("/asks/pwf_short", JSON.stringify({ body: "x" }))).status).toBe(404);
		expect((await post(`/asks/${ERROR_KEY}`, JSON.stringify({ body: "x" }))).status).toBe(404);
		expect((await post(`/errors/${FORM_TOKEN}`, JSON.stringify({ type: "Error", message: "x" }))).status).toBe(404);
		expect((await post("/github/nope", JSON.stringify({}))).status).toBe(404);
		expect(fake.queries).toHaveLength(0);
		expect(fake.rpcCalls).toHaveLength(0);
	});

	describe("asks", () => {
		const formRow = { id: "form-1", workspace_id: WORKSPACE, name: "Website", enabled: true, auto_triage: false };

		it("records a JSON ask after looking the form up by token hash", async () => {
			const hash = await hashWorkToken(FORM_TOKEN);
			const fake = useFake((query) => {
				if (query.table === "work_intake_forms" && query.op === "select") {
					return { data: query.filters.some(([, column, value]) => column === "token_hash" && value === hash) ? formRow : null, error: null };
				}
				if (query.table === "work_customer_requests" && query.op === "insert") return { data: { id: "req-1" }, error: null };
				return undefined;
			});
			const response = await post(`/asks/${FORM_TOKEN}`, JSON.stringify({ body: "Please add SSO", email: "a@b.co" }));
			expect(response.status).toBe(200);
			expect(response.headers.get("access-control-allow-origin")).toBe("*");
			expect(await response.json()).toEqual({ ok: true, reference: "req-1" });
			expect(fake.queries[0].table).toBe("work_intake_forms");
		});

		it("redirects form posts to a safe URL only", async () => {
			useFake((query) => {
				if (query.table === "work_intake_forms") return { data: formRow, error: null };
				if (query.table === "work_customer_requests") return { data: { id: "req-2" }, error: null };
				return undefined;
			});
			const form = { "content-type": "application/x-www-form-urlencoded" };
			const ok = await post(`/asks/${FORM_TOKEN}`, new URLSearchParams({ body: "hi", redirect: "https://shop.example.com/thanks" }).toString(), form);
			expect(ok.status).toBe(303);
			expect(ok.headers.get("location")).toBe("https://shop.example.com/thanks");

			const unsafe = await post(`/asks/${FORM_TOKEN}`, new URLSearchParams({ body: "hi", redirect: "javascript:alert(1)" }).toString(), form);
			expect(unsafe.status).toBe(200);
			expect(unsafe.headers.get("location")).toBeNull();
		});

		it("returns 404 for unknown or disabled forms and 413 for big bodies", async () => {
			useFake((query) => (query.table === "work_intake_forms" ? { data: { ...formRow, enabled: false }, error: null } : undefined));
			expect((await post(`/asks/${FORM_TOKEN}`, JSON.stringify({ body: "x" }))).status).toBe(404);
			expect((await post(`/asks/${FORM_TOKEN}`, JSON.stringify({ body: "x".repeat(70_000) }))).status).toBe(413);
			expect((await post(`/asks/${FORM_TOKEN}`, JSON.stringify({ subject: "no body" }))).status).toBe(400);
		});

		it("applies the rate limiter when it is bound", async () => {
			const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
			const response = await post(`/asks/${FORM_TOKEN}`, JSON.stringify({ body: "x" }), undefined, { WORK_PUBLIC_RATE_LIMITER: limiter as unknown as RateLimit });
			expect(response.status).toBe(429);
			expect(limiter.limit).toHaveBeenCalledWith({ key: expect.stringMatching(/^form:[0-9a-f]{16}:unknown$/) });
		});
	});

	describe("errors", () => {
		const project = { id: "proj-1", workspace_id: WORKSPACE, name: "Shop", enabled: true, auto_triage: true, github_repo: "acme/shop" };
		const event = {
			type: "TypeError",
			message: "x is undefined",
			stack: "TypeError: x is undefined\n    at renderRow (https://shop.example.com/app.js?v=3:10:2)",
			url: "https://shop.example.com/checkout?token=secret",
			release: "1.2.3",
		};

		it("records events, opens an item for a new group and triages it", async () => {
			const fake = useFake((query) => {
				if (query.table === "work_error_projects") return { data: project, error: null };
				return undefined;
			});
			fake.onRpc((name) => name === "record_work_error_event"
				? { data: { group_id: "group-1", workspace_id: WORKSPACE, is_new: true, reopened: false, status: "open", work_item_id: null, event_count: 1, auto_triage: true, github_repo: "acme/shop" }, error: null }
				: { data: { id: "item-9", workspace_id: WORKSPACE, number: 9 }, error: null });

			const response = await post(`/errors/${ERROR_KEY}`, JSON.stringify(event), { "content-type": "text/plain" });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true, groups: ["group-1"] });

			const [record, create] = fake.rpcCalls;
			expect(record.name).toBe("record_work_error_event");
			expect(record.args).toMatchObject({ p_project_id: "proj-1", p_exception_type: "TypeError", p_culprit: "renderRow (/app.js:10)", p_release: "1.2.3" });
			expect(record.args.p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
			expect((record.args.p_event as { url: string }).url).toBe("https://shop.example.com/checkout");
			expect(create.name).toBe("create_work_item");
			expect(create.args).toMatchObject({ p_title: "TypeError: x is undefined", p_source: "error", p_fields: { error_group_id: "group-1", github_repo: "acme/shop" } });
			const claim = fake.queries.find((query) => query.table === "work_error_groups")!;
			expect(claim.payload).toEqual({ work_item_id: "item-9" });
			expect(claim.filters).toContainEqual(["is", "work_item_id", null]);
			expect(mocks.triageWorkItem).toHaveBeenCalledWith(expect.objectContaining({ itemId: "item-9", requestedBy: null }));
		});

		it("gives repeat events of a known group no new item", async () => {
			const fake = useFake((query) => (query.table === "work_error_projects" ? { data: project, error: null } : undefined));
			fake.onRpc(() => ({ data: { group_id: "group-1", workspace_id: WORKSPACE, is_new: false, reopened: false, status: "open", work_item_id: "item-9", event_count: 5, auto_triage: true, github_repo: null }, error: null }));
			const response = await post(`/errors/${ERROR_KEY}`, JSON.stringify({ events: [event, event] }));
			expect(await response.json()).toEqual({ ok: true, groups: ["group-1"] });
			expect(fake.rpcCalls.map((call) => call.name)).toEqual(["record_work_error_event", "record_work_error_event"]);
			expect(mocks.triageWorkItem).not.toHaveBeenCalled();
		});

		it("rejects empty or oversized batches and unknown keys", async () => {
			useFake((query) => (query.table === "work_error_projects" ? { data: null, error: null } : undefined));
			expect((await post(`/errors/${ERROR_KEY}`, JSON.stringify({ events: [] }))).status).toBe(400);
			expect((await post(`/errors/${ERROR_KEY}`, JSON.stringify({ events: Array.from({ length: 21 }, () => event) }))).status).toBe(400);
			expect((await post(`/errors/${ERROR_KEY}`, "not json")).status).toBe(400);
			expect((await post(`/errors/${ERROR_KEY}`, JSON.stringify(event))).status).toBe(404);
		});
	});

	describe("github bridge", () => {
		const repoRow = { id: "repo-1", workspace_id: WORKSPACE, repo: "acme/shop", sync_issues: true };
		const comment = {
			event: "issue_comment",
			action: "created",
			repo: "acme/shop",
			issue: { number: 12, title: "x", body: "", state: "open", html_url: "https://github.com/acme/shop/issues/12", user: "octo", labels: [] },
			comment: { body: "Still broken", user: "hubot", html_url: "https://github.com/acme/shop/issues/12#issuecomment-1" },
		};

		it("refuses events for another repository", async () => {
			const fake = useFake((query) => (query.table === "work_github_repos" ? { data: repoRow, error: null } : undefined));
			const response = await post(`/github/${GITHUB_TOKEN}`, JSON.stringify({ ...comment, repo: "evil/repo" }));
			expect(response.status).toBe(403);
			expect(fake.queries.filter((query) => query.table === "work_items")).toHaveLength(0);
		});

		it("applies events for the linked repository", async () => {
			const fake = useFake((query) => {
				if (query.table === "work_github_repos" && query.op === "select") return { data: repoRow, error: null };
				if (query.table === "work_items") return { data: { id: "item-1", workspace_id: WORKSPACE, state: "todo" }, error: null };
				return undefined;
			});
			const response = await post(`/github/${GITHUB_TOKEN}`, JSON.stringify(comment));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true, handled: "comment" });
			const event = fake.queries.find((query) => query.table === "work_item_events")!;
			expect(event.payload).toMatchObject({ kind: "comment", author_kind: "github", author_name: "hubot" });
		});

		it("rejects payloads that aren't bridge events", async () => {
			expect((await post(`/github/${GITHUB_TOKEN}`, JSON.stringify({ event: "push" }))).status).toBe(400);
		});
	});
});
