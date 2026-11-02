import { applyBoardMoves, boardColumns, boardMovesReducer, dropTarget } from "./board";
import { EMPTY_FILTERS, filterItems, listKeyCommand } from "./inbox";
import { createdBySourceRows, createdClosedRows, cycleBurnUp, nextCycleDates, closeTimeParts, runCostUsd } from "./insights";
import { activeMention, insertMention, mentionSuggestions } from "./mentions";
import { isPaletteShortcut, searchPalette, type PaletteEntry } from "./palette";
import { EMPTY_SELECTION, MAX_BULK_SELECTION, parseLabelChanges, selectionReducer } from "./selection";
import { slaStatus } from "./sla";
import { formatUsd } from "./format";
import type { WorkItem, WorkMember } from "./types";
import { filtersToView, sortViews, viewItemsQuery, viewToFilters } from "./views";

function item(overrides: Partial<WorkItem> & { number: number }): WorkItem {
	return {
		id: `id-${overrides.number}`,
		title: `Item ${overrides.number}`,
		description: "",
		state: "todo",
		priority: 0,
		source: "manual",
		labels: [],
		assigneeUserId: null,
		assigneeAgent: null,
		duplicateOf: null,
		duplicateOfNumber: null,
		errorGroupId: null,
		githubRepo: null,
		githubIssueNumber: null,
		githubIssueUrl: null,
		githubPrUrl: null,
		triageSummary: null,
		dueAt: null,
		createdBy: null,
		createdAt: "2026-11-01T00:00:00Z",
		updatedAt: "2026-11-01T00:00:00Z",
		closedAt: null,
		...overrides,
	};
}

describe("board", () => {
	const items = [item({ number: 1, state: "todo" }), item({ number: 2, state: "in_progress" }), item({ number: 3, state: "todo" })];

	it("groups items into columns in workflow order", () => {
		const columns = boardColumns(items);
		expect(columns.map((column) => column.state)).toEqual(["triage", "backlog", "todo", "in_progress", "in_review", "done", "cancelled"]);
		expect(columns.find((column) => column.state === "todo")?.items.map((entry) => entry.number)).toEqual([1, 3]);
	});

	it("applies a move optimistically and puts the moved card first", () => {
		const moves = boardMovesReducer({}, { type: "move", number: 3, state: "in_progress" });
		const shown = applyBoardMoves(items, moves, "2026-11-02T00:00:00Z");
		expect(shown[0]).toMatchObject({ number: 3, state: "in_progress", updatedAt: "2026-11-02T00:00:00Z" });
		expect(boardColumns(shown).find((column) => column.state === "in_progress")?.items.map((entry) => entry.number)).toEqual([3, 2]);
	});

	it("rolls a failed move back to the previous pending state", () => {
		let moves = boardMovesReducer({}, { type: "move", number: 1, state: "in_review" });
		moves = boardMovesReducer(moves, { type: "rollback", number: 1, previous: undefined });
		expect(moves).toEqual({});
		moves = boardMovesReducer({ 1: "in_progress" }, { type: "move", number: 1, state: "done" });
		expect(boardMovesReducer(moves, { type: "rollback", number: 1, previous: "in_progress" })).toEqual({ 1: "in_progress" });
	});

	it("drops moves once server data shows them", () => {
		const moves = { 1: "done" as const, 2: "todo" as const };
		expect(boardMovesReducer(moves, { type: "settle", items: [item({ number: 1, state: "done" }), item({ number: 2, state: "in_progress" })] })).toEqual({ 2: "todo" });
	});

	it("only accepts drops on another column", () => {
		expect(dropTarget({ state: "todo" }, "column:done")).toBe("done");
		expect(dropTarget({ state: "todo" }, "column:todo")).toBeNull();
		expect(dropTarget({ state: "todo" }, "column:nope")).toBeNull();
		expect(dropTarget({ state: "todo" }, "item:4")).toBeNull();
		expect(dropTarget({ state: "todo" }, null)).toBeNull();
	});
});

describe("bulk selection", () => {
	const order = [5, 4, 3, 2, 1];

	it("toggles rows and remembers the anchor", () => {
		let state = selectionReducer(EMPTY_SELECTION, { type: "toggle", number: 4 });
		expect(state).toEqual({ numbers: [4], anchor: 4 });
		state = selectionReducer(state, { type: "toggle", number: 4 });
		expect(state.numbers).toEqual([]);
	});

	it("shift-click selects the range from the anchor in shown order, either direction", () => {
		let state = selectionReducer(EMPTY_SELECTION, { type: "toggle", number: 4 });
		state = selectionReducer(state, { type: "range", number: 2, order });
		expect(state.numbers.sort()).toEqual([2, 3, 4]);
		state = selectionReducer({ numbers: [2], anchor: 2 }, { type: "range", number: 5, order });
		expect(state.numbers.sort()).toEqual([2, 3, 4, 5]);
	});

	it("treats a range without an anchor as a toggle", () => {
		expect(selectionReducer(EMPTY_SELECTION, { type: "range", number: 3, order }).numbers).toEqual([3]);
	});

	it("prunes rows that are no longer shown and caps at the bulk limit", () => {
		expect(selectionReducer({ numbers: [1, 9], anchor: 9 }, { type: "prune", order })).toEqual({ numbers: [1], anchor: null });
		const many = Array.from({ length: 150 }, (_, index) => index + 1);
		expect(selectionReducer(EMPTY_SELECTION, { type: "set", numbers: many }).numbers).toHaveLength(MAX_BULK_SELECTION);
	});

	it("reads label additions and removals", () => {
		expect(parseLabelChanges("+Bug, -billing api bug")).toEqual({ labelsAdd: ["bug", "api"], labelsRemove: ["billing"] });
		expect(parseLabelChanges(" - , + ")).toEqual({ labelsAdd: [], labelsRemove: [] });
	});

	it("maps x to select", () => {
		expect(listKeyCommand({ key: "x" })).toBe("select");
		expect(listKeyCommand({ key: "x", target: { tagName: "input" } })).toBeNull();
	});
});

describe("palette search", () => {
	const entries: PaletteEntry[] = [
		{ id: "action:create", group: "actions", label: "Create item" },
		{ id: "page:insights", group: "pages", label: "Insights" },
		{ id: "item:42", group: "items", label: "Billing export fails", number: 42 },
		{ id: "item:420", group: "items", label: "Login loop", number: 420 },
		{ id: "view:1", group: "views", label: "Urgent bugs" },
	];

	it("puts an exact number match first", () => {
		expect(searchPalette(entries, "#42").map((entry) => entry.id)).toEqual(["item:42", "item:420"]);
		expect(searchPalette(entries, "42")[0]?.id).toBe("item:42");
	});

	it("matches titles by prefix and by words", () => {
		expect(searchPalette(entries, "insi").map((entry) => entry.id)).toEqual(["page:insights"]);
		expect(searchPalette(entries, "export billing").map((entry) => entry.id)).toEqual(["item:42"]);
		expect(searchPalette(entries, "zzz")).toEqual([]);
	});

	it("shows everything for an empty query, capped per group", () => {
		expect(searchPalette(entries, "")).toHaveLength(entries.length);
		expect(searchPalette(entries, "", 1).filter((entry) => entry.group === "items")).toHaveLength(1);
	});

	it("opens on Ctrl+K and Cmd+K only", () => {
		expect(isPaletteShortcut({ key: "k", ctrlKey: true })).toBe(true);
		expect(isPaletteShortcut({ key: "K", metaKey: true })).toBe(true);
		expect(isPaletteShortcut({ key: "k" })).toBe(false);
		expect(isPaletteShortcut({ key: "k", ctrlKey: true, shiftKey: true })).toBe(false);
	});
});

describe("SLA badge", () => {
	const now = Date.parse("2026-11-02T12:00:00Z");

	it("uses the API flags when present", () => {
		expect(slaStatus({ state: "todo", priority: 1, closedAt: null, slaDueAt: null, slaBreached: true }, now)).toBe("breached");
		expect(slaStatus({ state: "todo", priority: 1, closedAt: null, slaDueAt: "2026-11-02T13:00:00Z", slaAtRisk: true }, now)).toBe("at_risk");
		expect(slaStatus({ state: "todo", priority: 1, closedAt: null, slaDueAt: "2026-11-02T11:00:00Z", slaBreached: false, slaAtRisk: false }, now)).toBe("ok");
	});

	it("is breached when open past the due time", () => {
		expect(slaStatus({ state: "in_progress", priority: 2, closedAt: null, slaDueAt: "2026-11-02T11:59:00Z" }, now)).toBe("breached");
	});

	it("is at risk with under a quarter of the window left", () => {
		// Priority 2 has 24 hours by default; 5 hours left is under 6.
		expect(slaStatus({ state: "todo", priority: 2, closedAt: null, slaDueAt: "2026-11-02T17:00:00Z" }, now)).toBe("at_risk");
		expect(slaStatus({ state: "todo", priority: 2, closedAt: null, slaDueAt: "2026-11-02T19:00:00Z" }, now)).toBe("ok");
		expect(slaStatus({ state: "todo", priority: 2, closedAt: null, slaDueAt: "2026-11-02T19:00:00Z" }, now, { slaHours: { "1": 4, "2": 48, "3": 72, "4": 168 } })).toBe("at_risk");
	});

	it("judges closed items by when they closed", () => {
		expect(slaStatus({ state: "done", priority: 1, closedAt: "2026-11-02T10:00:00Z", slaDueAt: "2026-11-02T09:00:00Z" }, now)).toBe("breached");
		expect(slaStatus({ state: "done", priority: 1, closedAt: "2026-11-02T08:00:00Z", slaDueAt: "2026-11-02T09:00:00Z" }, now)).toBe("ok");
	});

	it("has no badge without a due time", () => {
		expect(slaStatus({ state: "todo", priority: 0, closedAt: null, slaDueAt: null }, now)).toBe("none");
	});
});

describe("saved views", () => {
	it("round-trips list filters through a view", () => {
		const filters = { ...EMPTY_FILTERS, state: "todo" as const, label: "bug", query: " export ", project: "p1", priority: "2" };
		const view = filtersToView(filters);
		expect(view).toEqual({ q: "export", state: "todo", label: "bug", projectId: "p1", priority: 2 });
		expect(viewToFilters(view)).toEqual({ ...EMPTY_FILTERS, state: "todo", label: "bug", query: "export", project: "p1", priority: "2" });
	});

	it("ignores malformed view filters", () => {
		expect(viewToFilters({ state: "open", assignee: "robert'); drop", priority: 9 } as never)).toEqual(EMPTY_FILTERS);
	});

	it("builds the items query for a view", () => {
		expect(viewItemsQuery({ state: "open", assignee: "agent:engineer", blocked: true, cycleId: "c1" })).toEqual({ state: "open", assignee: "engineer", blocked: "true", cycleId: "c1" });
		expect(viewItemsQuery({ assignee: "user:0f4c0d39-0000-4000-8000-000000000000" }).assignee).toBe("0f4c0d39-0000-4000-8000-000000000000");
	});

	it("splits shared views from mine", () => {
		const views = [
			{ id: "a", ownerUserId: null, name: "B", filters: {}, layout: "list" as const, position: 1 },
			{ id: "b", ownerUserId: "me", name: "A", filters: {}, layout: "board" as const, position: 0 },
			{ id: "c", ownerUserId: "other", name: "C", filters: {}, layout: "list" as const, position: 0 },
			{ id: "d", ownerUserId: null, name: "A", filters: {}, layout: "list" as const, position: 1 },
		];
		const { shared, mine } = sortViews(views, "me");
		expect(shared.map((view) => view.id)).toEqual(["d", "a"]);
		expect(mine.map((view) => view.id)).toEqual(["b"]);
	});

	it("filters by project, cycle and priority", () => {
		const items = [item({ number: 1, projectId: "p1", priority: 2 }), item({ number: 2, cycleId: "c1", priority: 1 })];
		expect(filterItems(items, { ...EMPTY_FILTERS, project: "p1" }).map((entry) => entry.number)).toEqual([1]);
		expect(filterItems(items, { ...EMPTY_FILTERS, cycle: "c1" }).map((entry) => entry.number)).toEqual([2]);
		expect(filterItems(items, { ...EMPTY_FILTERS, priority: "1" }).map((entry) => entry.number)).toEqual([2]);
	});
});

describe("mentions", () => {
	const members: WorkMember[] = [
		{ userId: "u1", name: "Ada Lovelace", email: "ada@example.com" },
		{ userId: "u2", name: null, email: "grace@example.com" },
	];

	it("finds the mention being typed", () => {
		expect(activeMention("Thanks @Ad", 10)).toEqual({ query: "Ad", start: 7 });
		expect(activeMention("mail me@example", 15)).toBeNull();
		expect(activeMention("@", 1)).toEqual({ query: "", start: 0 });
	});

	it("suggests members by name, email or handle", () => {
		expect(mentionSuggestions(members, "love").map((member) => member.userId)).toEqual(["u1"]);
		expect(mentionSuggestions(members, "gra").map((member) => member.userId)).toEqual(["u2"]);
		expect(mentionSuggestions(members, "")).toHaveLength(2);
	});

	it("inserts the handle and moves the caret", () => {
		const text = "cc @ad please";
		const mention = activeMention(text, 6)!;
		expect(insertMention(text, mention, members[0]!)).toEqual({ text: "cc @AdaLovelace please", caret: 16 });
		expect(insertMention("@gr", activeMention("@gr", 3)!, members[1]!).text).toBe("@grace ");
	});
});

describe("insights shaping", () => {
	const insights = {
		from: "2026-11-01",
		to: "2026-11-03",
		created: [
			{ day: "2026-11-01", source: "manual" as const, items: 2 },
			{ day: "2026-11-01", source: "error" as const, items: 1 },
			{ day: "2026-11-03", source: "ask" as const, items: 4 },
		],
		closed: [{ day: "2026-11-02", items: 3, done: 2 }],
	};

	it("fills every day with created and closed", () => {
		expect(createdClosedRows(insights)).toEqual([
			{ day: "2026-11-01", created: 3, closed: 0 },
			{ day: "2026-11-02", created: 0, closed: 3 },
			{ day: "2026-11-03", created: 4, closed: 0 },
		]);
	});

	it("stacks sources in fixed order with zeros", () => {
		const { rows, sources } = createdBySourceRows(insights);
		expect(sources).toEqual(["manual", "ask", "error"]);
		expect(rows[1]).toEqual({ day: "2026-11-02", manual: 0, ask: 0, error: 0 });
	});

	it("formats close times and costs", () => {
		expect(closeTimeParts(18.26)).toEqual({ value: 18.3, unit: "hours" });
		expect(closeTimeParts(72)).toEqual({ value: 3, unit: "days" });
		expect(closeTimeParts(null)).toBeNull();
		expect(runCostUsd({ costUsd: 1.5 })).toBe(1.5);
		expect(runCostUsd({ costNanos: 4_200_000 })).toBeCloseTo(0.0042);
		expect(formatUsd(0.0042)).toBe("$0.0042");
		expect(formatUsd(12.5)).toBe("$12.50");
	});

	it("draws a burn-up from start to today", () => {
		const rows = cycleBurnUp({ startsOn: "2026-11-01", endsOn: "2026-11-05", scope: 8, completed: 3 }, "2026-11-03");
		expect(rows.map((row) => row.ideal)).toEqual([0, 2, 4, 6, 8]);
		expect(rows.map((row) => row.completed)).toEqual([0, null, 3, null, null]);
		expect(rows.every((row) => row.scope === 8)).toBe(true);
	});

	it("starts the next cycle after the latest one, for the same length", () => {
		expect(nextCycleDates([{ startsOn: "2026-10-19", endsOn: "2026-11-01" }])).toEqual({ startsOn: "2026-11-02", endsOn: "2026-11-15" });
		expect(nextCycleDates([], "2026-11-02")).toEqual({ startsOn: "2026-11-02", endsOn: "2026-11-15" });
	});
});
