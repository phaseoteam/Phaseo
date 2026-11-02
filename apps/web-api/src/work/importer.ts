// Importing items (POST /items/import): rows the web app read from a CSV export, at most
// MAX_IMPORT_ROWS a request. State and priority names from other trackers are mapped onto ours;
// anything not recognised becomes backlog / no priority. Each row becomes a manual item with a
// note on its timeline saying where it came from. Rows are created one by one, so a failure
// stops the import at that row and the answer says how far it got.

import { addWorkItemEvent, createWorkItem, MAX_LABELS, type DataClient } from "./items";
import type { WorkItemState } from "./types";

/** Rows per request: each costs a few database calls, which stays well inside a Worker request's subrequest limit. */
export const MAX_IMPORT_ROWS = 100;
const LABEL = /^[a-z0-9][a-z0-9 ._-]{0,39}$/;

const STATE_NAMES: Record<string, WorkItemState> = {
	triage: "triage", new: "triage", open: "triage", inbox: "triage",
	backlog: "backlog", icebox: "backlog", later: "backlog",
	todo: "todo", "to do": "todo", unstarted: "todo", planned: "todo", ready: "todo", selected: "todo", "selected for development": "todo",
	"in progress": "in_progress", started: "in_progress", doing: "in_progress", active: "in_progress", "in development": "in_progress",
	"in review": "in_review", review: "in_review", "code review": "in_review", qa: "in_review", testing: "in_review",
	done: "done", closed: "done", completed: "done", resolved: "done", fixed: "done", shipped: "done",
	cancelled: "cancelled", canceled: "cancelled", "won't do": "cancelled", "wont do": "cancelled", "won't fix": "cancelled", duplicate: "cancelled", rejected: "cancelled", invalid: "cancelled",
};

const PRIORITY_NAMES: Record<string, number> = {
	urgent: 1, highest: 1, blocker: 1, critical: 1, p0: 1, "1": 1,
	high: 2, p1: 2, major: 2, "2": 2,
	medium: 3, normal: 3, p2: 3, "3": 3,
	low: 4, lowest: 4, minor: 4, trivial: 4, p3: 4, p4: 4, "4": 4,
	none: 0, "no priority": 0, "0": 0, "": 0,
};

export function importState(value: unknown): WorkItemState {
	const key = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
	return STATE_NAMES[key] ?? (STATE_NAMES[key.replace(/ /g, "_")] ?? "backlog");
}

export function importPriority(value: unknown): number {
	const key = String(value ?? "").trim().toLowerCase();
	return PRIORITY_NAMES[key] ?? 0;
}

export function importLabels(value: unknown): string[] {
	const parts = Array.isArray(value) ? value.map(String) : String(value ?? "").split(/[,;|]/);
	const labels = parts.map((part) => part.trim().toLowerCase().replace(/[^a-z0-9 ._-]/g, "").slice(0, 40)).filter((label) => LABEL.test(label));
	return [...new Set(labels)].slice(0, MAX_LABELS);
}

export type ImportRow = { title: string; description: string; state: WorkItemState; priority: number; labels: string[]; estimate: number | null; externalId: string | null };

/** Cleans one untrusted row. Null when it has no title. */
export function cleanImportRow(value: unknown): ImportRow | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	const title = String(raw.title ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
	if (!title) return null;
	const estimate = Number(raw.estimate);
	return {
		title,
		description: String(raw.description ?? "").slice(0, 20_000),
		state: importState(raw.state),
		priority: importPriority(raw.priority),
		labels: importLabels(raw.labels),
		estimate: raw.estimate !== undefined && raw.estimate !== "" && Number.isInteger(estimate) && estimate >= 0 && estimate <= 21 ? estimate : null,
		externalId: raw.externalId ? String(raw.externalId).trim().slice(0, 100) || null : null,
	};
}

export type ImportResult = { created: number; skipped: number; numbers: number[]; failedAt: number | null };

export async function importItems(args: { client: DataClient; workspaceId: string; userId: string; actorName: string | null; source: string; rows: unknown[]; projectId?: string | null }): Promise<ImportResult> {
	const result: ImportResult = { created: 0, skipped: 0, numbers: [], failedAt: null };
	const source = args.source.replace(/[^\w .-]/g, "").trim().slice(0, 60) || "a CSV file";
	for (const [index, value] of args.rows.slice(0, MAX_IMPORT_ROWS).entries()) {
		const row = cleanImportRow(value);
		if (!row) { result.skipped += 1; continue; }
		try {
			const item = await createWorkItem(args.client, {
				workspaceId: args.workspaceId,
				title: row.title,
				description: row.description,
				state: row.state,
				priority: row.priority,
				labels: row.labels,
				estimate: row.estimate,
				projectId: args.projectId ?? null,
				source: "manual",
				createdBy: args.userId,
				authorKind: "user",
				actorName: args.actorName,
			});
			result.created += 1;
			result.numbers.push(item.number);
			await addWorkItemEvent(args.client, {
				workspaceId: args.workspaceId,
				workItemId: item.id,
				kind: "link",
				authorKind: "user",
				authorUserId: args.userId,
				body: row.externalId ? `Imported from ${source} (${row.externalId})` : `Imported from ${source}`,
				data: { type: "import", source, externalId: row.externalId },
			}).catch(() => undefined);
		} catch {
			result.failedAt = index;
			break;
		}
	}
	return result;
}
