
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextRunAfter, parseMilestoneInput, parseProjectUpdateInput, parseTemplateInput, runRecurrences } from "./extras";
import { fakeDataClient, hasFilter, type FakeHandler } from "./fakeDataClient.testing";

const WS = "00000000-0000-4000-8000-000000000001";
const EVENT = "00000000-0000-4000-8000-0000000000e9";
const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> | null } = { handler: () => undefined, fake: null };
vi.mock("@/routes/account/work-shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/routes/account/work-shared")>();
	const access = async () => { state.fake = fakeDataClient((query) => state.handler(query)); return { context: { client: state.fake.client, workspaceId: WS, user: { id: "me" }, isOwner: false, role: "member" } }; };
	return { ...actual, accessFromQuery: access, workAccess: access };
});
const { accountWorkExtrasRouter } = await import("@/routes/account/work-extras");
const post = (path: string, body: unknown) => accountWorkExtrasRouter.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: WS, ...(body as object) }) });

beforeEach(() => {
	state.handler = () => ({ data: null, error: null });
});

describe("recurring items", () => {
	it("steps daily, weekly and monthly, never into the past", () => {
		const now = new Date("2026-11-02T12:00:00Z");
		expect(nextRunAfter(new Date("2026-11-02T09:00:00Z"), "daily", now).toISOString()).toBe("2026-11-03T09:00:00.000Z");
		expect(nextRunAfter(new Date("2026-10-01T09:00:00Z"), "weekly", now).toISOString()).toBe("2026-11-05T09:00:00.000Z");
		expect(nextRunAfter(new Date("2026-01-31T09:00:00Z"), "monthly", new Date("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T09:00:00.000Z");
		expect(nextRunAfter(new Date("2026-10-15T09:00:00Z"), "monthly", now).toISOString()).toBe("2026-11-15T09:00:00.000Z");
	});

	it("claims each due recurrence before making its item, so a second run makes none", async () => {
		let claimed = false;
		const fake = fakeDataClient((query) => {
			if (query.table === "work_recurrences" && query.op === "select") return { data: [{ id: "r1", workspace_id: WS, template_id: "t1", cadence: "weekly", next_run_at: "2026-11-02T09:00:00Z", enabled: true, last_item_id: null, last_run_at: null, created_by: "me", created_at: "t", template: { id: "t1", workspace_id: WS, name: "Weekly review", title: "Weekly review", description: "Check the board", priority: 3, labels: ["ops"], estimate: 1, project_id: null, assignee_agent: null, created_by: "me", created_at: "t" } }], error: null };
			if (query.table === "work_recurrences" && query.op === "update" && hasFilter(query, "eq", "next_run_at", "2026-11-02T09:00:00Z")) return claimed ? { data: null, error: null } : (claimed = true, { data: { id: "r1" }, error: null });
			return { data: null, error: null };
		});
		fake.onRpc(() => ({ data: { id: "item-9", workspace_id: WS, number: 9, state: "todo" }, error: null }));
		const now = new Date("2026-11-02T12:00:00Z");
		expect(await runRecurrences(fake.client, now)).toEqual({ due: 1, created: 1, failed: 0 });
		const create = fake.rpcCalls.find((call) => call.name === "create_work_item")!;
		expect(create.args).toMatchObject({ p_title: "Weekly review", p_priority: 3, p_state: "todo" });
		const claim = fake.queries.find((query) => query.table === "work_recurrences" && query.op === "update")!;
		expect(claim.payload).toMatchObject({ next_run_at: "2026-11-09T09:00:00.000Z" });
		expect(await runRecurrences(fake.client, now)).toEqual({ due: 1, created: 0, failed: 0 });
	});
});

describe("validation", () => {
	it("checks milestones, updates and templates", () => {
		expect(parseMilestoneInput({ name: " Beta ", targetDate: "2026-12-01" }, true)).toEqual({ ok: true, value: { name: "Beta", targetDate: "2026-12-01" } });
		expect(parseMilestoneInput({ targetDate: "soon" }, false).ok).toBe(false);
		expect(parseMilestoneInput({}, true).ok).toBe(false);
		expect(parseProjectUpdateInput({ health: "at_risk", body: " Waiting on the API " })).toEqual({ ok: true, value: { health: "at_risk", body: "Waiting on the API" } });
		expect(parseProjectUpdateInput({ health: "fine", body: "x" }).ok).toBe(false);
		expect(parseTemplateInput({ name: "Bug", labels: ["Bug", "bug"], priority: 2, assigneeAgent: "engineer" }, true)).toEqual({ ok: true, value: { name: "Bug", labels: ["bug"], priority: 2, assignee_agent: "engineer" } });
		expect(parseTemplateInput({ name: "x", priority: 9 }, true).ok).toBe(false);
		expect(parseTemplateInput({ name: "x", assigneeAgent: "boss" }, true).ok).toBe(false);
	});
});

describe("reactions", () => {
	it("adds a reaction, and takes it back on a second press", async () => {
		let had = false;
		state.handler = (query) => {
			if (query.table === "work_item_events") return { data: { id: EVENT, kind: "comment" }, error: null };
			if (query.table === "work_reactions" && query.op === "delete") return { data: had ? [{ event_id: EVENT }] : [], error: null };
			if (query.table === "work_reactions" && query.op === "insert") { had = true; return { data: null, error: null }; }
			return { data: null, error: null };
		};
		const first = await post(`/events/${EVENT}/reactions`, { emoji: "rocket" });
		expect(first.status).toBe(200);
		expect(state.fake!.queries.some((query) => query.table === "work_reactions" && query.op === "insert")).toBe(true);
		await post(`/events/${EVENT}/reactions`, { emoji: "rocket" });
		expect(state.fake!.queries.some((query) => query.table === "work_reactions" && query.op === "insert")).toBe(false);
	});

	it("takes only the fixed emoji, on comments only", async () => {
		expect((await post(`/events/${EVENT}/reactions`, { emoji: "poop" })).status).toBe(400);
		state.handler = (query) => (query.table === "work_item_events" ? { data: { id: EVENT, kind: "state" }, error: null } : { data: null, error: null });
		expect((await post(`/events/${EVENT}/reactions`, { emoji: "+1" })).status).toBe(400);
	});
});

describe("recurring item routes", () => {
	it("refuses a template from another workspace and a start time in the past", async () => {
		expect((await post("/recurrences", { templateId: "00000000-0000-4000-8000-0000000000f1", cadence: "weekly" })).status).toBe(400);
		expect((await post("/recurrences", { templateId: "00000000-0000-4000-8000-0000000000f1", cadence: "weekly", startAt: "2020-01-01T00:00:00Z" })).status).toBe(400);
		expect((await post("/recurrences", { templateId: "00000000-0000-4000-8000-0000000000f1", cadence: "hourly" })).status).toBe(400);
	});
});

