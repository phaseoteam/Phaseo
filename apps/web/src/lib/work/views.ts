import { EMPTY_FILTERS, isWorkItemSource, isWorkItemState, type InboxFilters } from "./inbox";
import { WORK_VIEW_LAYOUTS, type WorkView, type WorkViewFilters, type WorkViewLayout } from "./types";

export function parseLayout(value: unknown): WorkViewLayout {
	return typeof value === "string" && (WORK_VIEW_LAYOUTS as readonly string[]).includes(value) ? (value as WorkViewLayout) : "list";
}

const ASSIGNEE_PATTERN = /^(none|agent:(triage|engineer|support)|user:[0-9a-f-]{36})$/i;

/** The list filters saved as a view. "all" and empty values are left out. */
export function filtersToView(filters: InboxFilters): WorkViewFilters {
	const view: WorkViewFilters = {};
	const query = filters.query.trim();
	if (query) view.q = query.slice(0, 200);
	if (filters.state !== "all") view.state = filters.state;
	if (filters.source !== "all") view.source = filters.source;
	if (filters.assignee !== "all") view.assignee = filters.assignee;
	if (filters.label !== "all") view.label = filters.label;
	if (filters.project && filters.project !== "all") view.projectId = filters.project;
	if (filters.cycle && filters.cycle !== "all") view.cycleId = filters.cycle;
	if (filters.priority && filters.priority !== "all") view.priority = Number(filters.priority);
	return view;
}

/** A saved view's filters as list filters. Unknown or malformed values fall back to "all". */
export function viewToFilters(view: WorkViewFilters | null | undefined): InboxFilters {
	const filters: InboxFilters = { ...EMPTY_FILTERS };
	if (!view || typeof view !== "object") return filters;
	if (typeof view.q === "string") filters.query = view.q;
	// A view saved with "open" or several states is narrowed on the server instead.
	if (isWorkItemState(view.state)) filters.state = view.state;
	if (isWorkItemSource(view.source)) filters.source = view.source;
	if (typeof view.assignee === "string" && ASSIGNEE_PATTERN.test(view.assignee)) filters.assignee = view.assignee;
	if (typeof view.label === "string" && view.label) filters.label = view.label;
	if (typeof view.projectId === "string" && view.projectId) filters.project = view.projectId;
	if (typeof view.cycleId === "string" && view.cycleId) filters.cycle = view.cycleId;
	if (typeof view.priority === "number" && Number.isInteger(view.priority) && view.priority >= 0 && view.priority <= 4) filters.priority = String(view.priority);
	return filters;
}

type Query = Record<string, string | number | undefined>;

/** The GET /items query for a saved view. "user:<id>" and "agent:<name>" become the API's assignee forms. */
export function viewItemsQuery(view: WorkViewFilters | null | undefined): Query {
	const query: Query = {};
	if (!view || typeof view !== "object") return query;
	if (typeof view.state === "string" && view.state) query.state = view.state;
	if (typeof view.source === "string" && isWorkItemSource(view.source)) query.source = view.source;
	if (typeof view.assignee === "string" && view.assignee) {
		query.assignee = view.assignee.startsWith("user:") ? view.assignee.slice(5) : view.assignee.startsWith("agent:") ? view.assignee.slice(6) : view.assignee;
	}
	if (typeof view.label === "string" && view.label) query.label = view.label;
	if (typeof view.q === "string" && view.q.trim()) query.q = view.q.trim();
	if (typeof view.projectId === "string" && view.projectId) query.projectId = view.projectId;
	if (typeof view.cycleId === "string" && view.cycleId) query.cycleId = view.cycleId;
	if (typeof view.priority === "number") query.priority = view.priority;
	if (typeof view.parent === "number") query.parent = view.parent;
	if (view.blocked === true) query.blocked = "true";
	return query;
}

/** Shared views first, then mine, each by position then name. */
export function sortViews(views: WorkView[], userId: string | null): { shared: WorkView[]; mine: WorkView[] } {
	const order = (a: WorkView, b: WorkView) => a.position - b.position || a.name.localeCompare(b.name);
	return {
		shared: views.filter((view) => view.shared ?? view.ownerUserId === null).sort(order),
		mine: views.filter((view) => !(view.shared ?? view.ownerUserId === null) && view.ownerUserId === userId).sort(order),
	};
}
