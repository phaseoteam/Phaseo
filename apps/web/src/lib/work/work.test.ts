import { formatCostNanos, frameLocation, normaliseGithubRepo, parseItemNumber, parseLabels, sampleFrames } from "./format";
import {
	EMPTY_FILTERS,
	activeFilterCount,
	assigneeKey,
	belongsToTab,
	collectLabels,
	filterItems,
	inboxTabQueries,
	listCursorReducer,
	listKeyCommand,
	mergeItems,
	parseAssigneeKey,
	parseInboxTab,
} from "./inbox";
import { errorScriptTag, intakeCurlExample, intakeFormHtml } from "./snippets";
import type { WorkItem } from "./types";

function item(overrides: Partial<WorkItem>): WorkItem {
	return {
		id: `id-${overrides.number ?? 1}`,
		number: 1,
		title: "Checkout fails",
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
		createdAt: "2026-11-01T10:00:00Z",
		updatedAt: "2026-11-01T10:00:00Z",
		closedAt: null,
		...overrides,
	};
}

describe("formatCostNanos", () => {
	it("shows four decimals under a cent and two above", () => {
		expect(formatCostNanos(4_200_000)).toBe("$0.0042");
		expect(formatCostNanos("12500000000")).toBe("$12.50");
		expect(formatCostNanos(0)).toBe("$0.00");
		expect(formatCostNanos(null)).toBe("$0.00");
	});
});

describe("parsing helpers", () => {
	it("normalises GitHub repos", () => {
		expect(normaliseGithubRepo("https://github.com/acme/api.git")).toBe("acme/api");
		expect(normaliseGithubRepo(" acme/web-app ")).toBe("acme/web-app");
		expect(normaliseGithubRepo("acme")).toBeNull();
		expect(normaliseGithubRepo("acme/api/issues")).toBeNull();
	});

	it("parses labels and item numbers", () => {
		expect(parseLabels("Bug, billing api, bug,,")).toEqual(["bug", "billing-api"]);
		expect(parseItemNumber("#42")).toBe(42);
		expect(parseItemNumber("WRK-7")).toBe(7);
		expect(parseItemNumber("0")).toBeNull();
		expect(parseItemNumber("checkout")).toBeNull();
	});

	it("reads sample frames defensively", () => {
		const frames = sampleFrames({ frames: [{ function: "pay", file: "app.js", line: 10, column: 2, inApp: true }, { line: 3 }, "x"] });
		expect(frames).toEqual([{ function: "pay", file: "app.js", line: 10, column: 2, inApp: true }]);
		expect(frameLocation(frames[0])).toBe("app.js:10:2");
		expect(sampleFrames(undefined)).toEqual([]);
	});
});

describe("inbox tabs", () => {
	it("maps tabs to queries", () => {
		expect(parseInboxTab("done")).toBe("done");
		expect(parseInboxTab("nope")).toBe("triage");
		expect(inboxTabQueries("done", null)).toEqual([{ state: "done,cancelled" }]);
		expect(inboxTabQueries("mine", "u1")).toEqual([{ state: "open", assignee: "me" }]);
		expect(inboxTabQueries("agents", null)).toEqual([{ state: "open", assignee: "agent" }]);
		expect(inboxTabQueries("mine", null)).toEqual([]);
	});

	it("keeps only the rows a tab should show", () => {
		expect(belongsToTab("agents", item({ assigneeAgent: "engineer" }), null)).toBe(true);
		expect(belongsToTab("agents", item({ assigneeAgent: "engineer", state: "done" }), null)).toBe(false);
		expect(belongsToTab("mine", item({ assigneeUserId: "u1" }), "u1")).toBe(true);
		expect(belongsToTab("mine", item({ assigneeUserId: "u2" }), "u1")).toBe(false);
		expect(belongsToTab("open", item({ state: "cancelled" }), null)).toBe(false);
	});

	it("merges and sorts pages by last update", () => {
		const a = item({ number: 1, updatedAt: "2026-11-01T10:00:00Z" });
		const b = item({ number: 2, updatedAt: "2026-11-02T10:00:00Z" });
		expect(mergeItems([[a], [b, a]]).map((entry) => entry.number)).toEqual([2, 1]);
	});
});

describe("inbox filters", () => {
	const items = [
		item({ number: 1, title: "Checkout fails", labels: ["bug", "billing"], source: "error", assigneeAgent: "engineer" }),
		item({ number: 2, title: "Add export", labels: ["feature"], source: "ask", assigneeUserId: "u1", state: "backlog" }),
		item({ number: 3, title: "Slow page", labels: ["bug"], source: "manual" }),
	];

	it("filters by each field and by text or number", () => {
		expect(filterItems(items, EMPTY_FILTERS)).toHaveLength(3);
		expect(filterItems(items, { ...EMPTY_FILTERS, label: "bug" }).map((entry) => entry.number)).toEqual([1, 3]);
		expect(filterItems(items, { ...EMPTY_FILTERS, source: "ask" }).map((entry) => entry.number)).toEqual([2]);
		expect(filterItems(items, { ...EMPTY_FILTERS, assignee: "agent:engineer" }).map((entry) => entry.number)).toEqual([1]);
		expect(filterItems(items, { ...EMPTY_FILTERS, assignee: "none" }).map((entry) => entry.number)).toEqual([3]);
		expect(filterItems(items, { ...EMPTY_FILTERS, state: "backlog" }).map((entry) => entry.number)).toEqual([2]);
		expect(filterItems(items, { ...EMPTY_FILTERS, query: "export" }).map((entry) => entry.number)).toEqual([2]);
		expect(filterItems(items, { ...EMPTY_FILTERS, query: "#3" }).map((entry) => entry.number)).toEqual([3]);
		expect(activeFilterCount({ ...EMPTY_FILTERS, label: "bug", query: " x " })).toBe(2);
	});

	it("collects labels by use", () => {
		expect(collectLabels(items)).toEqual(["bug", "billing", "feature"]);
	});

	it("round-trips assignee keys", () => {
		expect(assigneeKey(items[0])).toBe("agent:engineer");
		expect(parseAssigneeKey("agent:support")).toEqual({ assigneeUserId: null, assigneeAgent: "support" });
		expect(parseAssigneeKey("user:u1")).toEqual({ assigneeUserId: "u1", assigneeAgent: null });
		expect(parseAssigneeKey("agent:robot")).toEqual({ assigneeUserId: null, assigneeAgent: null });
	});
});

describe("keyboard navigation", () => {
	it("moves within bounds", () => {
		let state = { index: -1 };
		state = listCursorReducer(state, { type: "next", count: 3 });
		expect(state.index).toBe(0);
		state = listCursorReducer(state, { type: "next", count: 3 });
		state = listCursorReducer(state, { type: "next", count: 3 });
		state = listCursorReducer(state, { type: "next", count: 3 });
		expect(state.index).toBe(2);
		state = listCursorReducer(state, { type: "previous", count: 3 });
		expect(state.index).toBe(1);
		state = listCursorReducer(state, { type: "clamp", count: 1 });
		expect(state.index).toBe(0);
		expect(listCursorReducer(state, { type: "next", count: 0 }).index).toBe(-1);
	});

	it("ignores keys typed into fields or with modifiers", () => {
		expect(listKeyCommand({ key: "c" })).toBe("create");
		expect(listKeyCommand({ key: "j" })).toBe("next");
		expect(listKeyCommand({ key: "k" })).toBe("previous");
		expect(listKeyCommand({ key: "Enter", target: { tagName: "div" } })).toBe("open");
		expect(listKeyCommand({ key: "Enter", target: { tagName: "a" } })).toBeNull();
		expect(listKeyCommand({ key: "c", target: { tagName: "input" } })).toBeNull();
		expect(listKeyCommand({ key: "j", ctrlKey: true })).toBeNull();
	});
});

describe("snippets", () => {
	it("builds escaped setup snippets", () => {
		expect(intakeFormHtml("pwf_abc", { redirect: "https://example.com/?a=1&b=\"2\"" })).toContain('value="https://example.com/?a=1&amp;b=&quot;2&quot;"');
		expect(intakeFormHtml("pwf_abc")).toContain('action="https://phaseo.app/api/_web/work/asks/pwf_abc"');
		expect(intakeCurlExample("pwf_abc")).toContain("'https://phaseo.app/api/_web/work/asks/pwf_abc'");
		expect(errorScriptTag("pwe_key", { release: "1.2.3" })).toBe('<script src="https://phaseo.app/api/_web/work/errors.js" data-key="pwe_key" data-release="1.2.3" data-environment="production"></script>');
	});
});
