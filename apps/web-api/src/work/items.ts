import type { getDataClient } from "@/data/supabase";
import {
	CLOSED_WORK_ITEM_STATES,
	WORK_AGENTS,
	WORK_ITEM_STATES,
	type AgentRun,
	type AgentRunRow,
	type Customer,
	type CustomerRequest,
	type CustomerRequestRow,
	type CustomerRow,
	type ErrorGroup,
	type ErrorGroupRow,
	type ErrorProject,
	type ErrorProjectRow,
	type GithubRepo,
	type GithubRepoRow,
	type IntakeForm,
	type IntakeFormRow,
	type WorkAgent,
	type WorkAuthorKind,
	type WorkEventKind,
	type WorkItem,
	type WorkItemEvent,
	type WorkItemEventRow,
	type WorkItemRow,
	type WorkItemSource,
	type WorkItemState,
} from "./types";

// Work items: creation through the create_work_item RPC (numbering and the created event in one
// transaction), timeline events, changes that write their own events, and the row-to-API
// formatters every work route uses.

export type DataClient = ReturnType<typeof getDataClient>;

export const WORK_ITEM_COLUMNS = "id,workspace_id,number,title,description,state,priority,source,labels,assignee_user_id,assignee_agent,duplicate_of,error_group_id,github_repo,github_issue_number,github_issue_url,github_pr_url,triage_summary,due_at,created_by,created_at,updated_at,closed_at";
export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 100_000;
export const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Who made a change, for the timeline. */
export type WorkActor = { kind: WorkAuthorKind; userId?: string | null; name?: string | null };

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

export function isWorkItemState(value: unknown): value is WorkItemState {
	return typeof value === "string" && (WORK_ITEM_STATES as readonly string[]).includes(value);
}

export function isWorkAgent(value: unknown): value is WorkAgent {
	return typeof value === "string" && (WORK_AGENTS as readonly string[]).includes(value);
}

export function isClosedState(state: WorkItemState): boolean {
	return CLOSED_WORK_ITEM_STATES.includes(state);
}

export function isPriority(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

export function isGithubRepo(value: unknown): value is string {
	return typeof value === "string" && value.length <= 200 && REPO_PATTERN.test(value);
}

/** Lowercase, trimmed, deduplicated labels; null when the input is not a list of short strings. */
export function normalizeLabels(value: unknown, max = MAX_LABELS): string[] | null {
	if (!Array.isArray(value)) return null;
	const labels: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") return null;
		const label = entry.trim().toLowerCase().replace(/\s+/g, "-");
		if (!label) continue;
		if (label.length > MAX_LABEL_LENGTH) return null;
		if (!labels.includes(label)) labels.push(label);
	}
	return labels.length > max ? null : labels;
}

function toNumber(value: number | string | null | undefined): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

// ---------------------------------------------------------------------------------------------
// Formatting (rows to API shapes)
// ---------------------------------------------------------------------------------------------

export function formatWorkItem(row: WorkItemRow, duplicateOfNumber: number | null = null): WorkItem {
	return {
		id: row.id,
		number: row.number,
		title: row.title,
		description: row.description ?? "",
		state: row.state,
		priority: row.priority,
		source: row.source,
		labels: row.labels ?? [],
		assigneeUserId: row.assignee_user_id,
		assigneeAgent: row.assignee_agent,
		duplicateOf: row.duplicate_of,
		duplicateOfNumber,
		errorGroupId: row.error_group_id,
		githubRepo: row.github_repo,
		githubIssueNumber: row.github_issue_number,
		githubIssueUrl: row.github_issue_url,
		githubPrUrl: row.github_pr_url,
		triageSummary: row.triage_summary,
		dueAt: row.due_at,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		closedAt: row.closed_at,
	};
}

export function formatWorkItemEvent(row: WorkItemEventRow): WorkItemEvent {
	return {
		id: row.id,
		kind: row.kind,
		authorKind: row.author_kind,
		authorUserId: row.author_user_id,
		authorName: row.author_name,
		body: row.body ?? "",
		data: row.data ?? {},
		createdAt: row.created_at,
	};
}

export function formatCustomer(row: CustomerRow, counts: { requestCount: number; openItemCount: number } = { requestCount: 0, openItemCount: 0 }): Customer {
	return {
		id: row.id,
		name: row.name,
		domain: row.domain,
		externalRef: row.external_ref,
		tier: row.tier,
		notes: row.notes ?? "",
		requestCount: counts.requestCount,
		openItemCount: counts.openItemCount,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function formatCustomerRequest(row: CustomerRequestRow & { customer?: { name?: string | null } | null; item?: { number?: number | null } | null }): CustomerRequest {
	return {
		id: row.id,
		customerId: row.customer_id,
		customerName: row.customer?.name ?? null,
		workItemId: row.work_item_id,
		workItemNumber: row.item?.number ?? null,
		intakeFormId: row.intake_form_id,
		source: row.source,
		status: row.status,
		contactName: row.contact_name,
		contactEmail: row.contact_email,
		subject: row.subject,
		body: row.body,
		metadata: row.metadata ?? {},
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function formatIntakeForm(row: IntakeFormRow): IntakeForm {
	return {
		id: row.id,
		name: row.name,
		tokenPrefix: row.token_prefix,
		enabled: row.enabled,
		autoTriage: row.auto_triage,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
	};
}

export function formatErrorProject(row: ErrorProjectRow): ErrorProject {
	return {
		id: row.id,
		name: row.name,
		keyPrefix: row.key_prefix,
		enabled: row.enabled,
		autoTriage: row.auto_triage,
		githubRepo: row.github_repo,
		createdAt: row.created_at,
		lastEventAt: row.last_event_at,
	};
}

export function formatErrorGroup(row: ErrorGroupRow & { project?: { name?: string | null } | null; item?: { number?: number | null } | null }): ErrorGroup {
	return {
		id: row.id,
		projectId: row.project_id,
		projectName: row.project?.name ?? null,
		fingerprint: row.fingerprint,
		exceptionType: row.exception_type,
		message: row.message ?? "",
		culprit: row.culprit,
		status: row.status,
		eventCount: toNumber(row.event_count),
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
		lastRelease: row.last_release,
		lastEnvironment: row.last_environment,
		lastEvent: row.last_event ?? {},
		workItemId: row.work_item_id,
		workItemNumber: row.item?.number ?? null,
		resolvedAt: row.resolved_at,
	};
}

/** Never includes the hashes or the encrypted GitHub token, only whether one is stored. */
export function formatGithubRepo(row: GithubRepoRow): GithubRepo {
	return {
		id: row.id,
		repo: row.repo,
		bridgeTokenPrefix: row.bridge_token_prefix,
		hasGithubToken: Boolean(row.github_token_ciphertext),
		syncIssues: row.sync_issues,
		createdAt: row.created_at,
		lastEventAt: row.last_event_at,
	};
}

export function formatAgentRun(row: AgentRunRow & { item?: { number?: number | null } | null }): AgentRun {
	return {
		id: row.id,
		workItemId: row.work_item_id,
		workItemNumber: row.item?.number ?? null,
		agent: row.agent,
		runner: row.runner,
		status: row.status,
		model: row.model,
		costNanos: toNumber(row.cost_nanos),
		summary: row.summary,
		output: row.output ?? {},
		externalUrl: row.external_url,
		requestedBy: row.requested_by,
		createdAt: row.created_at,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

export type CreateWorkItemInput = {
	workspaceId: string;
	title: string;
	description?: string;
	state?: WorkItemState;
	priority?: number;
	source?: WorkItemSource;
	createdBy?: string | null;
	authorKind?: WorkAuthorKind;
	labels?: string[];
	assigneeUserId?: string | null;
	assigneeAgent?: WorkAgent | null;
	errorGroupId?: string | null;
	githubRepo?: string | null;
	githubIssueNumber?: number | null;
	githubIssueUrl?: string | null;
	dueAt?: string | null;
};

/** Creates a numbered work item and its created event (create_work_item RPC). Throws when the RPC fails. */
export async function createWorkItem(client: DataClient, input: CreateWorkItemInput): Promise<WorkItemRow> {
	const fields: Record<string, unknown> = {};
	if (input.labels?.length) fields.labels = input.labels.slice(0, MAX_LABELS);
	if (input.assigneeUserId) fields.assignee_user_id = input.assigneeUserId;
	if (input.assigneeAgent) fields.assignee_agent = input.assigneeAgent;
	if (input.errorGroupId) fields.error_group_id = input.errorGroupId;
	if (input.githubRepo) fields.github_repo = input.githubRepo;
	if (input.githubIssueNumber != null) fields.github_issue_number = input.githubIssueNumber;
	if (input.githubIssueUrl) fields.github_issue_url = input.githubIssueUrl;
	if (input.dueAt) fields.due_at = input.dueAt;
	const { data, error } = await client.rpc("create_work_item", {
		p_workspace_id: input.workspaceId,
		p_title: input.title.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled",
		p_description: (input.description ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
		p_state: input.state ?? "triage",
		p_priority: input.priority ?? 0,
		p_source: input.source ?? "manual",
		p_created_by: input.createdBy ?? null,
		p_author_kind: input.authorKind ?? (input.createdBy ? "user" : "system"),
		p_fields: fields,
	});
	const row = (Array.isArray(data) ? data[0] : data) as WorkItemRow | null;
	if (error || !row?.id) throw new Error(`create_work_item failed: ${error?.message ?? "no row returned"}`);
	return row;
}

export type WorkItemEventInput = {
	workspaceId: string;
	workItemId: string;
	kind: WorkEventKind;
	authorKind?: WorkAuthorKind;
	authorUserId?: string | null;
	authorName?: string | null;
	body?: string;
	data?: Record<string, unknown>;
};

function eventRow(event: WorkItemEventInput) {
	return {
		workspace_id: event.workspaceId,
		work_item_id: event.workItemId,
		kind: event.kind,
		author_kind: event.authorKind ?? "system",
		author_user_id: event.authorUserId ?? null,
		author_name: event.authorName?.slice(0, 200) ?? null,
		body: (event.body ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
		data: event.data ?? {},
	};
}

/** Adds one timeline event. Throws when the insert fails. */
export async function addWorkItemEvent(client: DataClient, event: WorkItemEventInput): Promise<void> {
	const { error } = await client.from("work_item_events").insert(eventRow(event));
	if (error) throw new Error(`work_item_events insert failed: ${error.message}`);
}

/** Adds one timeline event and returns the stored row. */
export async function insertWorkItemEvent(client: DataClient, event: WorkItemEventInput): Promise<WorkItemEventRow> {
	const { data, error } = await client.from("work_item_events").insert(eventRow(event)).select("*").maybeSingle();
	if (error || !data) throw new Error(`work_item_events insert failed: ${error?.message ?? "no row returned"}`);
	return data as WorkItemEventRow;
}

export type WorkItemChanges = {
	title?: string;
	description?: string;
	state?: WorkItemState;
	priority?: number;
	labels?: string[];
	assigneeUserId?: string | null;
	assigneeAgent?: WorkAgent | null;
	/** The id of the item this one duplicates, or null to clear it. */
	duplicateOf?: string | null;
	githubRepo?: string | null;
	githubIssueNumber?: number | null;
	githubIssueUrl?: string | null;
	githubPrUrl?: string | null;
	triageSummary?: string | null;
};

type PlannedChange = { patch: Record<string, unknown>; events: Array<Omit<WorkItemEventInput, "workspaceId" | "workItemId" | "authorKind" | "authorUserId" | "authorName">> };

/**
 * The column patch and timeline events for a change, compared with the current row. Only fields
 * that really change are written. Moving into done or cancelled sets closed_at; moving out clears it.
 */
export function planWorkItemChanges(item: WorkItemRow, changes: WorkItemChanges, now = new Date().toISOString()): PlannedChange {
	const patch: Record<string, unknown> = {};
	const events: PlannedChange["events"] = [];
	if (changes.title !== undefined && changes.title !== item.title) patch.title = changes.title;
	if (changes.description !== undefined && changes.description !== item.description) patch.description = changes.description;
	if (changes.labels !== undefined && JSON.stringify(changes.labels) !== JSON.stringify(item.labels ?? [])) patch.labels = changes.labels;
	if (changes.triageSummary !== undefined && changes.triageSummary !== item.triage_summary) patch.triage_summary = changes.triageSummary;
	if (changes.state !== undefined && changes.state !== item.state) {
		patch.state = changes.state;
		const closing = isClosedState(changes.state);
		if (closing && !isClosedState(item.state)) patch.closed_at = now;
		if (!closing && item.closed_at) patch.closed_at = null;
		events.push({ kind: "state", data: { from: item.state, to: changes.state } });
	}
	if (changes.priority !== undefined && changes.priority !== item.priority) {
		patch.priority = changes.priority;
		events.push({ kind: "priority", data: { from: item.priority, to: changes.priority } });
	}
	const userChanged = changes.assigneeUserId !== undefined && changes.assigneeUserId !== item.assignee_user_id;
	const agentChanged = changes.assigneeAgent !== undefined && changes.assigneeAgent !== item.assignee_agent;
	if (userChanged) patch.assignee_user_id = changes.assigneeUserId;
	if (agentChanged) patch.assignee_agent = changes.assigneeAgent;
	if (userChanged || agentChanged) {
		events.push({
			kind: "assignee",
			data: {
				...(userChanged ? { fromUserId: item.assignee_user_id, toUserId: changes.assigneeUserId } : {}),
				...(agentChanged ? { fromAgent: item.assignee_agent, toAgent: changes.assigneeAgent } : {}),
			},
		});
	}
	if (changes.duplicateOf !== undefined && changes.duplicateOf !== item.duplicate_of) {
		patch.duplicate_of = changes.duplicateOf;
		events.push({ kind: "link", data: { type: "duplicate_of", from: item.duplicate_of, to: changes.duplicateOf } });
	}
	if (changes.githubRepo !== undefined && changes.githubRepo !== item.github_repo) {
		patch.github_repo = changes.githubRepo;
		events.push({ kind: "link", data: { type: "github_repo", from: item.github_repo, to: changes.githubRepo } });
	}
	if (changes.githubIssueNumber !== undefined && changes.githubIssueNumber !== item.github_issue_number) patch.github_issue_number = changes.githubIssueNumber;
	if (changes.githubIssueUrl !== undefined && changes.githubIssueUrl !== item.github_issue_url) {
		patch.github_issue_url = changes.githubIssueUrl;
		events.push({ kind: "link", data: { type: "github_issue", from: item.github_issue_url, to: changes.githubIssueUrl } });
	}
	if (changes.githubPrUrl !== undefined && changes.githubPrUrl !== item.github_pr_url) {
		patch.github_pr_url = changes.githubPrUrl;
		events.push({ kind: "link", data: { type: "github_pr", from: item.github_pr_url, to: changes.githubPrUrl } });
	}
	if (Object.keys(patch).length) patch.updated_at = now;
	return { patch, events };
}

/**
 * Applies a change to an item and writes its state, priority, assignee and link events. Returns
 * the updated row (the same row when nothing changed). Throws when the update fails.
 */
export async function updateWorkItem(client: DataClient, item: WorkItemRow, changes: WorkItemChanges, actor: WorkActor): Promise<WorkItemRow> {
	const { patch, events } = planWorkItemChanges(item, changes);
	if (!Object.keys(patch).length) return item;
	const { data, error } = await client.from("work_items").update(patch)
		.eq("workspace_id", item.workspace_id).eq("id", item.id)
		.select(WORK_ITEM_COLUMNS).maybeSingle();
	if (error || !data) throw new Error(`work_items update failed: ${error?.message ?? "not found"}`);
	if (events.length) {
		const { error: eventError } = await client.from("work_item_events").insert(events.map((event) => eventRow({
			...event,
			workspaceId: item.workspace_id,
			workItemId: item.id,
			authorKind: actor.kind,
			authorUserId: actor.userId ?? null,
			authorName: actor.name ?? null,
		})));
		if (eventError) console.error("[work] events not written", { itemId: item.id, message: eventError.message });
	}
	return data as unknown as WorkItemRow;
}

/** Moves an item to a state, with its state event and closed_at. */
export function setWorkItemState(client: DataClient, item: WorkItemRow, state: WorkItemState, actor: WorkActor): Promise<WorkItemRow> {
	return updateWorkItem(client, item, { state }, actor);
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export async function loadWorkItemById(client: DataClient, workspaceId: string, id: string): Promise<WorkItemRow | null> {
	const { data, error } = await client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(`work_items read failed: ${error.message}`);
	return (data as unknown as WorkItemRow | null) ?? null;
}

export async function loadWorkItemByNumber(client: DataClient, workspaceId: string, number: number): Promise<WorkItemRow | null> {
	const { data, error } = await client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", workspaceId).eq("number", number).maybeSingle();
	if (error) throw new Error(`work_items read failed: ${error.message}`);
	return (data as unknown as WorkItemRow | null) ?? null;
}
