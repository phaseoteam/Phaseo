import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDataClient, hasFilter, type FakeHandler } from "./fakeDataClient.testing";
import { parseProjectInput, projectRowPatch } from "./projects";

const WS = "00000000-0000-4000-8000-000000000001";
const DOC = "00000000-0000-4000-8000-0000000000d1";
const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> | null } = { handler: () => undefined, fake: null };
vi.mock("@/routes/account/work-shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/routes/account/work-shared")>();
	const access = async () => { state.fake = fakeDataClient((query) => state.handler(query)); return { context: { client: state.fake.client, workspaceId: WS, user: { id: "me" } } }; };
	return { ...actual, accessFromQuery: access, workAccess: access };
});
const { accountWorkDocsRouter } = await import("@/routes/account/work-docs");
const send = (method: string, path: string, body: unknown = {}) => accountWorkDocsRouter.request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: WS, ...(body as object) }) });

const doc = (overrides: Record<string, unknown> = {}) => ({ id: DOC, workspace_id: WS, project_id: null, title: "Spec", body: "# Spec", created_by: "me", updated_by: "me", created_at: "t", updated_at: "2026-11-02T10:00:00.000Z", ...overrides });

beforeEach(() => {
	state.handler = () => ({ data: null, error: null });
});

describe("documents", () => {
	it("saves only over the version the editor started from", async () => {
		state.handler = (query) => {
			if (query.table === "work_documents" && query.op === "update") return { data: null, error: null };
			if (query.table === "work_documents" && query.op === "select") return { data: { id: DOC }, error: null };
			return { data: null, error: null };
		};
		const stale = await send("PATCH", `/documents/${DOC}`, { body: "new", baseUpdatedAt: "2026-11-02T09:00:00.000Z" });
		expect(stale.status).toBe(409);
		const update = state.fake!.queries.find((query) => query.table === "work_documents" && query.op === "update")!;
		expect(hasFilter(update, "eq", "updated_at", "2026-11-02T09:00:00.000Z")).toBe(true);
		expect(update.payload).toMatchObject({ body: "new", updated_by: "me" });
	});

	it("saves, and lists without bodies", async () => {
		state.handler = (query) => (query.table === "work_documents" ? { data: query.op === "update" ? doc({ body: "new" }) : [doc()], error: null } : { data: null, error: null });
		expect((await send("PATCH", `/documents/${DOC}`, { body: "new" })).status).toBe(200);
		const list = await accountWorkDocsRouter.request(`/documents?workspaceId=${WS}`);
		const read = state.fake!.queries.find((query) => query.table === "work_documents")!;
		expect(read.columns).not.toContain("body");
		expect(list.status).toBe(200);
	});

	it("refuses empty titles and a project from elsewhere", async () => {
		expect((await send("POST", "/documents", { title: " " })).status).toBe(400);
		state.handler = (query) => (query.table === "work_projects" ? { data: null, error: null } : { data: null, error: null });
		expect((await send("POST", "/documents", { title: "Plan", projectId: "00000000-0000-4000-8000-0000000000b9" })).status).toBe(400);
	});
});

describe("initiatives and projects", () => {
	it("validates initiatives", async () => {
		expect((await send("POST", "/initiatives", { name: "" })).status).toBe(400);
		expect((await send("POST", "/initiatives", { name: "Launch", state: "someday" })).status).toBe(400);
		expect((await send("POST", "/initiatives", { name: "Launch", targetDate: "next year" })).status).toBe(400);
	});

	it("takes a project's start date and initiative", () => {
		const parsed = parseProjectInput({ startDate: "2026-11-01", initiativeId: "00000000-0000-4000-8000-0000000000c1" }, false);
		expect(parsed.ok).toBe(true);
		expect(projectRowPatch((parsed as { value: object }).value)).toEqual({ start_date: "2026-11-01", initiative_id: "00000000-0000-4000-8000-0000000000c1" });
		expect(parseProjectInput({ startDate: "1 Nov" }, false).ok).toBe(false);
		expect(parseProjectInput({ initiativeId: "nope" }, false).ok).toBe(false);
	});

	it("gives the roadmap initiatives and projects with their health", async () => {
		state.handler = (query) => {
			if (query.table === "work_initiatives") return { data: [{ id: "i1", name: "Launch", description: "", state: "active", target_date: "2026-12-01" }], error: null };
			if (query.table === "work_projects") return { data: [{ id: "p1", workspace_id: WS, name: "Billing", description: "", state: "active", lead_user_id: null, target_date: "2026-11-30", start_date: "2026-11-01", initiative_id: "i1", created_by: null, created_at: "t", updated_at: "t" }], error: null };
			return { data: null, error: null };
		};
		const response = await accountWorkDocsRouter.request(`/roadmap?workspaceId=${WS}`);
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.projects[0]).toMatchObject({ id: "p1", initiativeId: "i1", startDate: "2026-11-01", targetDate: "2026-11-30", health: null });
		expect(body.initiatives[0]).toMatchObject({ id: "i1", name: "Launch" });
	});
});
