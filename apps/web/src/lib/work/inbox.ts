import { WORK_AGENTS, WORK_ITEM_SOURCES, WORK_ITEM_STATES, type WorkAgent, type WorkItem, type WorkItemSource, type WorkItemState } from "./types";

export const INBOX_TABS = ["triage", "open", "mine", "agents", "done"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export function parseInboxTab(value: unknown): InboxTab {
	return typeof value === "string" && (INBOX_TABS as readonly string[]).includes(value) ? (value as InboxTab) : "triage";
}

/** state is "open" or a comma-separated list of states; assignee is "me", "agent", an agent or a user id. */
export type InboxQuery = { state: string; assignee?: string };

/** The API query behind a tab. Done shows done and cancelled items together. */
export function inboxTabQueries(tab: InboxTab, userId: string | null): InboxQuery[] {
	switch (tab) {
		case "triage": return [{ state: "triage" }];
		case "open": return [{ state: "open" }];
		case "agents": return [{ state: "open", assignee: "agent" }];
		case "mine": return userId ? [{ state: "open", assignee: "me" }] : [];
		case "done": return [{ state: "done,cancelled" }];
	}
}

/** What a tab keeps after loading, so a looser API answer still shows the right rows. */
export function belongsToTab(tab: InboxTab, item: WorkItem, userId: string | null): boolean {
	switch (tab) {
		case "triage": return item.state === "triage";
		case "open": return item.state !== "done" && item.state !== "cancelled";
		case "mine": return userId !== null && item.assigneeUserId === userId && item.state !== "done" && item.state !== "cancelled";
		case "agents": return item.assigneeAgent !== null && item.state !== "done" && item.state !== "cancelled";
		case "done": return item.state === "done" || item.state === "cancelled";
	}
}

/** Merges pages from several queries, drops duplicates and sorts by last update, newest first. */
export function mergeItems(lists: WorkItem[][]): WorkItem[] {
	const byId = new Map<string, WorkItem>();
	for (const list of lists) for (const item of list) byId.set(item.id, item);
	return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.number - a.number);
}

/** "all", "none", "agent:engineer" or "user:<id>". */
export type AssigneeFilter = string;

export type InboxFilters = {
	state: "all" | WorkItemState;
	source: "all" | WorkItemSource;
	assignee: AssigneeFilter;
	label: string;
	query: string;
	/** "all" or a project id. */
	project?: string;
	/** "all" or a cycle id. */
	cycle?: string;
	/** "all" or "0" to "4". */
	priority?: string;
};

export const EMPTY_FILTERS: InboxFilters = { state: "all", source: "all", assignee: "all", label: "all", query: "", project: "all", cycle: "all", priority: "all" };

export function assigneeKey(item: Pick<WorkItem, "assigneeAgent" | "assigneeUserId">): string {
	if (item.assigneeAgent) return `agent:${item.assigneeAgent}`;
	if (item.assigneeUserId) return `user:${item.assigneeUserId}`;
	return "none";
}

export function parseAssigneeKey(key: string): { assigneeUserId: string | null; assigneeAgent: WorkAgent | null } {
	if (key.startsWith("agent:")) {
		const agent = key.slice(6);
		if ((WORK_AGENTS as readonly string[]).includes(agent)) return { assigneeUserId: null, assigneeAgent: agent as WorkAgent };
	}
	if (key.startsWith("user:") && key.length > 5) return { assigneeUserId: key.slice(5), assigneeAgent: null };
	return { assigneeUserId: null, assigneeAgent: null };
}

export function filterItems(items: WorkItem[], filters: InboxFilters): WorkItem[] {
	const query = filters.query.trim().toLowerCase();
	const number = query.replace(/^#/, "");
	return items.filter((item) => {
		if (filters.state !== "all" && item.state !== filters.state) return false;
		if (filters.source !== "all" && item.source !== filters.source) return false;
		if (filters.assignee !== "all" && assigneeKey(item) !== filters.assignee) return false;
		if (filters.label !== "all" && !item.labels.includes(filters.label)) return false;
		if (filters.project && filters.project !== "all" && (item.projectId ?? null) !== filters.project) return false;
		if (filters.cycle && filters.cycle !== "all" && (item.cycleId ?? null) !== filters.cycle) return false;
		if (filters.priority && filters.priority !== "all" && String(item.priority) !== filters.priority) return false;
		if (query && !item.title.toLowerCase().includes(query) && String(item.number) !== number && !item.labels.some((label) => label.includes(query))) return false;
		return true;
	});
}

export function activeFilterCount(filters: InboxFilters): number {
	return (["state", "source", "assignee", "label", "project", "cycle", "priority"] as const).filter((key) => (filters[key] ?? "all") !== "all").length + (filters.query.trim() ? 1 : 0);
}

/** Every label in use, most used first, then alphabetically. */
export function collectLabels(items: WorkItem[]): string[] {
	const counts = new Map<string, number>();
	for (const item of items) for (const label of item.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
}

export function isWorkItemState(value: unknown): value is WorkItemState {
	return typeof value === "string" && (WORK_ITEM_STATES as readonly string[]).includes(value);
}

export function isWorkItemSource(value: unknown): value is WorkItemSource {
	return typeof value === "string" && (WORK_ITEM_SOURCES as readonly string[]).includes(value);
}

// Keyboard: c creates, j and k move, Enter opens.

export type ListCursor = { index: number };
export type ListCursorAction = { type: "next" | "previous"; count: number } | { type: "set"; index: number; count: number } | { type: "clamp"; count: number };

export function listCursorReducer(state: ListCursor, action: ListCursorAction): ListCursor {
	if (action.count <= 0) return state.index === -1 ? state : { index: -1 };
	// The list may have shrunk since the last move.
	const current = Math.min(state.index, action.count - 1);
	let index: number;
	switch (action.type) {
		case "next": index = current < 0 ? 0 : Math.min(action.count - 1, current + 1); break;
		case "previous": index = current < 0 ? 0 : Math.max(0, current - 1); break;
		case "set": index = Math.max(-1, Math.min(action.count - 1, action.index)); break;
		case "clamp": index = Math.min(action.count - 1, state.index); break;
	}
	return index === state.index ? state : { index };
}

export type ListKey = "create" | "next" | "previous" | "open" | "select" | null;

/** Maps a key press to a list command, ignoring typing in fields and modified keys. */
export function listKeyCommand(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null }): ListKey {
	if (event.metaKey || event.ctrlKey || event.altKey) return null;
	const tag = event.target?.tagName?.toUpperCase();
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return null;
	switch (event.key) {
		case "c": return "create";
		case "x": return "select";
		case "j":
		case "ArrowDown": return "next";
		case "k":
		case "ArrowUp": return "previous";
		// A focused link or button already handles Enter itself.
		case "Enter": return tag === "A" || tag === "BUTTON" ? null : "open";
		default: return null;
	}
}
