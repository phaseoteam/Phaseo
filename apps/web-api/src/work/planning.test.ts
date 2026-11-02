import { describe, expect, it } from "vitest";
import { insertCycle, parseCycleInput, cycleEstimates } from "./cycles";
import { fakeDataClient, hasFilter } from "./fakeDataClient.testing";
import { formatWorkInsights, insightsRange } from "./insights";
import { formatWorkProject, isIsoDate, parseProjectInput } from "./projects";
import { formatRelation, storedRelation } from "./relations";
import { parseViewFilters, parseViewInput } from "./views";

const NOW = "2026-11-02T12:00:00.000Z";

describe("projects", () => {
	it("validates names, states, leads and dates", () => {
		expect(parseProjectInput({ name: " Checkout ", state: "active", targetDate: "2026-12-01" }, true)).toEqual({ ok: true, value: { name: "Checkout", state: "active", targetDate: "2026-12-01" } });
		expect(parseProjectInput({}, true).ok).toBe(false);
		expect(parseProjectInput({ state: "done" }, false).ok).toBe(false);
		expect(parseProjectInput({ targetDate: "2026-02-30" }, false).ok).toBe(false);
		expect(parseProjectInput({ leadUserId: "nope" }, false).ok).toBe(false);
		expect(isIsoDate("2028-02-29")).toBe(true);
	});

	it("reports progress as the done share", () => {
		const row = { id: "p", workspace_id: "ws", name: "P", description: "", state: "active" as const, lead_user_id: null, target_date: null, created_by: null, created_at: NOW, updated_at: NOW };
		expect(formatWorkProject(row, { itemCount: 3, doneCount: 1 }).progress).toBe(0.3333);
		expect(formatWorkProject(row, { itemCount: 0, doneCount: 0 }).progress).toBe(0);
	});
});

describe("cycles", () => {
	it("requires dates on creation and an end after the start", () => {
		expect(parseCycleInput({ startsOn: "2026-11-02", endsOn: "2026-11-16" }, true)).toEqual({ ok: true, value: { startsOn: "2026-11-02", endsOn: "2026-11-16" } });
		expect(parseCycleInput({ startsOn: "2026-11-02" }, true).ok).toBe(false);
		expect(parseCycleInput({ startsOn: "2026-11-16", endsOn: "2026-11-02" }, true).ok).toBe(false);
		expect(parseCycleInput({ endsOn: "2026-11-01" }, false, { starts_on: "2026-11-02", ends_on: "2026-11-16" }).ok).toBe(false);
	});

	it("numbers a new cycle max + 1 and retries once on a unique violation", async () => {
		let inserts = 0;
		const fake = fakeDataClient((query) => {
			if (query.table !== "work_cycles") return undefined;
			if (query.op === "select") return { data: [{ number: 4 + inserts }], error: null };
			inserts += 1;
			return inserts === 1
				? { data: null, error: { message: "duplicate", code: "23505" } as any }
				: { data: { id: "c", number: (query.payload as any).number }, error: null };
		});
		const row = await insertCycle(fake.client, "ws", { startsOn: "2026-11-02", endsOn: "2026-11-16" });
		expect(row.number).toBe(6);
		expect(fake.queries.filter((query) => query.op === "insert").map((query) => (query.payload as any).number)).toEqual([5, 6]);
	});

	it("reads estimate totals from the database function", async () => {
		const fake = fakeDataClient(() => ({ data: null, error: null }));
		fake.onRpc(() => ({ data: { scope: 13, completed: 5 }, error: null }));
		expect(await cycleEstimates(fake.client, "ws", "c")).toEqual({ scope: 13, completed: 5 });
		expect(fake.rpcCalls[0]).toEqual({ name: "work_cycle_estimates", args: { p_workspace_id: "ws", p_cycle_id: "c" } });
	});

	it("returns null totals instead of adding up rows when the function fails", async () => {
		const fake = fakeDataClient(() => ({ data: null, error: null }));
		fake.onRpc(() => ({ data: null, error: { message: "boom" } }));
		expect(await cycleEstimates(fake.client, "ws", "c")).toEqual({ scope: null, completed: null });
	});
});

describe("relations", () => {
	it("stores blocked_by as the other item blocking this one", () => {
		expect(storedRelation("a", "b", "blocked_by")).toEqual({ item_id: "b", related_item_id: "a", kind: "blocks" });
		expect(storedRelation("a", "b", "blocks")).toEqual({ item_id: "a", related_item_id: "b", kind: "blocks" });
	});

	it("reads a stored relation from both ends", () => {
		const row = {
			id: "r", workspace_id: "ws", item_id: "a", related_item_id: "b", kind: "blocks" as const, created_by: null, created_at: NOW,
			item: { id: "a", number: 1, title: "A", state: "todo" as const }, related: { id: "b", number: 2, title: "B", state: "backlog" as const },
		};
		expect(formatRelation(row, "a")).toMatchObject({ direction: "blocks", otherNumber: 2, otherTitle: "B", otherState: "backlog" });
		expect(formatRelation(row, "b")).toMatchObject({ direction: "blocked_by", otherNumber: 1, otherTitle: "A", otherState: "todo" });
		expect(formatRelation({ ...row, kind: "related" }, "b").direction).toBe("related");
	});
});

describe("views", () => {
	it("accepts the item list's filters", () => {
		expect(parseViewFilters({ q: "login", state: "open", assignee: "engineer", priority: 1, blocked: true, parent: 3, projectId: "00000000-0000-4000-8000-000000000001" })).toEqual({
			ok: true, value: { q: "login", state: "open", assignee: "engineer", priority: 1, blocked: true, parent: 3, projectId: "00000000-0000-4000-8000-000000000001" },
		});
		expect(parseViewFilters({ state: "todo,in_review" }).ok).toBe(true);
	});

	it("refuses unknown filters and bad values", () => {
		expect(parseViewFilters({ owner: "me" }).ok).toBe(false);
		expect(parseViewFilters({ state: "doing" }).ok).toBe(false);
		expect(parseViewFilters({ priority: 9 }).ok).toBe(false);
		expect(parseViewFilters({ assignee: "someone" }).ok).toBe(false);
		expect(parseViewFilters([]).ok).toBe(false);
		expect(parseViewInput({ name: "Mine", layout: "grid" }, true).ok).toBe(false);
	});
});

describe("insights", () => {
	const now = new Date(NOW);

	it("defaults to the last 30 days and refuses more than 180", () => {
		expect(insightsRange(undefined, undefined, now)).toEqual({ ok: true, from: "2026-10-03T12:00:00.000Z", to: NOW });
		expect(insightsRange("2026-01-01", "2026-11-01", now).ok).toBe(false);
		expect(insightsRange("2026-11-02", "2026-11-01", now).ok).toBe(false);
		expect(insightsRange("soon", undefined, now).ok).toBe(false);
	});

	it("renames the RPC result and converts cost to US dollars", () => {
		const insights = formatWorkInsights({
			created: [{ day: "2026-11-01", source: "ask", items: 2 }],
			closed: [{ day: "2026-11-01", items: 1, done: 1 }],
			open_by_state: { todo: 3 },
			open_by_priority: { "1": 2 },
			open_past_sla: 1,
			open_stalled: 0,
			close_hours_p50: "4.5",
			close_hours_p90: null,
			runs: [{ agent: "triage", runs: 3, succeeded: 2, cost_nanos: "4200000" }],
		}, { from: "a", to: "b" });
		expect(insights).toMatchObject({
			openByState: { todo: 3 }, openByPriority: { "1": 2 }, openPastSla: 1, closeHoursP50: 4.5, closeHoursP90: null,
			runs: [{ agent: "triage", runs: 3, succeeded: 2, costNanos: 4_200_000, costUsd: 0.0042 }], totalCostUsd: 0.0042,
		});
	});
});
