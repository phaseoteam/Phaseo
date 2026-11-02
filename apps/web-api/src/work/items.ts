import type { getDataClient } from "@/data/supabase";
import { notify, notifySubscribers, subscribe } from "./notifications";
import { loadWorkSettingsOrDefaults } from "./settings";
import { slaDueAt, slaStatus } from "./sla";
import {
	CLOSED_WORK_ITEM_STATES,
	WORK_AGENTS,
	WORK_ITEM_STATES,
	MAX_WORK_ESTIMATE,
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

export const WORK_ITEM_COLUMNS = "id,workspace_id,number,title,description,state,priority,source,labels,assignee_user_id,assignee_agent,duplicate_of,error_group_id,github_repo,github_issue_number,github_issue_url,github_pr_url,triage_summary,due_at,created_by,created_at,updated_at,closed_at,project_id,cycle_id,parent_id,estimate,sla_due_at,last_activity_at";
export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 100_000;
export const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Event kinds that are not activity: they never bump last_activity_at. */
export const NON_ACTIVITY_EVENT_KINDS: readonly WorkEventKind[] = ["stalled", "sla"];
/** How many parent levels are checked for cycles (and the deepest nesting allowed). */
export const MAX_PARENT_DEPTH = 10;

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

export function isEstimate(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_WORK_ESTIMATE;
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

export type WorkItemFormatExtras = {
	parentNumber?: number | null;
	childCount?: number;
	blockedByCount?: number;
	now?: Date | string;
};

export function formatWorkItem(row: WorkItemRow, duplicateOfNumber: number | null = null, extras: WorkItemFormatExtras = {}): WorkItem {
	const sla = slaStatus({ sla_due_at: row.sla_due_at ?? null, closed_at: row.closed_at, created_at: row.created_at }, extras.now ?? new Date());
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
		projectId: row.project_id ?? null,
		cycleId: row.cycle_id ?? null,
		parentId: row.parent_id ?? null,
		parentNumber: extras.parentNumber ?? null,
		estimate: row.estimate ?? null,
		slaDueAt: row.sla_due_at ?? null,
		slaBreached: sla.breached,
		slaAtRisk: sla.atRisk,
		lastActivityAt: row.last_activity_at ?? row.updated_at,
		...(extras.childCount !== undefined ? { childCount: extras.childCount } : {}),
		...(extras.blockedByCount !== undefined ? { blockedByCount: extras.blockedByCount } : {}),
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
	projectId?: string | null;
	cycleId?: string | null;
	parentId?: string | null;
	estimate?: number | null;
	/** The SLA due time; computed from the workspace's settings when omitted and the priority is 1 to 4. */
	slaDueAt?: string | null;
	/** The creator's display name, for the assignee's notification. */
	actorName?: string | null;
};

/**
 * Creates a numbered work item and its created event (create_work_item RPC). Throws when the RPC
 * fails. Afterwards (never failing the creation) it subscribes the creator and the assignee and
 * notifies the assignee.
 */
export async function createWorkItem(client: DataClient, input: CreateWorkItemInput): Promise<WorkItemRow> {
	const fields: Record<string, unknown> = {};
	const priority = input.priority ?? 0;
	if (input.labels?.length) fields.labels = input.labels.slice(0, MAX_LABELS);
	if (input.assigneeUserId) fields.assignee_user_id = input.assigneeUserId;
	if (input.assigneeAgent) fields.assignee_agent = input.assigneeAgent;
	if (input.errorGroupId) fields.error_group_id = input.errorGroupId;
	if (input.githubRepo) fields.github_repo = input.githubRepo;
	if (input.githubIssueNumber != null) fields.github_issue_number = input.githubIssueNumber;
	if (input.githubIssueUrl) fields.github_issue_url = input.githubIssueUrl;
	if (input.dueAt) fields.due_at = input.dueAt;
	if (input.projectId) fields.project_id = input.projectId;
	if (input.cycleId) fields.cycle_id = input.cycleId;
	if (input.parentId) fields.parent_id = input.parentId;
	if (input.estimate != null) fields.estimate = input.estimate;
	const sla = input.slaDueAt !== undefined
		? input.slaDueAt
		: priority >= 1 && priority <= 4
			? slaDueAt(await loadWorkSettingsOrDefaults(client, input.workspaceId), priority)
			: null;
	if (sla) fields.sla_due_at = sla;
	const { data, error } = await client.rpc("create_work_item", {
		p_workspace_id: input.workspaceId,
		p_title: input.title.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled",
		p_description: (input.description ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
		p_state: input.state ?? "triage",
		p_priority: priority,
		p_source: input.source ?? "manual",
		p_created_by: input.createdBy ?? null,
		p_author_kind: input.authorKind ?? (input.createdBy ? "user" : "system"),
		p_fields: fields,
	});
	const row = (Array.isArray(data) ? data[0] : data) as WorkItemRow | null;
	if (error || !row?.id) throw new Error(`create_work_item failed: ${error?.message ?? "no row returned"}`);
	await afterCreate(client, row, input);
	return row;
}

async function afterCreate(client: DataClient, row: WorkItemRow, input: CreateWorkItemInput): Promise<void> {
	try {
		if (typeof (client as { from?: unknown }).from !== "function") return;
		if (input.createdBy) await subscribe(client, { workspaceId: input.workspaceId, workItemId: row.id, userId: input.createdBy, reason: "creator" });
		if (input.assigneeUserId) {
			await subscribe(client, { workspaceId: input.workspaceId, workItemId: row.id, userId: input.assigneeUserId, reason: "assignee" });
			await notify(client, {
				workspaceId: input.workspaceId,
				userIds: [input.assigneeUserId],
				workItemId: row.id,
				kind: "assigned",
				actorName: input.actorName ?? null,
				body: `#${row.number} ${row.title}`,
				exceptUserId: input.createdBy ?? null,
			});
		}
	} catch (error) {
		console.error("[work] subscriptions not written", { itemId: row.id, message: error instanceof Error ? error.message : String(error) });
	}
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

/**
 * Sets an item's last_activity_at (comments, GitHub events, agent runs: anything a person or agent
 * did). Stalled and SLA notices are not activity and must not call this. Never throws.
 */
export async function bumpWorkItemActivity(client: DataClient, workspaceId: string, workItemId: string, at: string = new Date().toISOString()): Promise<void> {
	try {
		const { error } = await client.from("work_items").update({ last_activity_at: at, updated_at: at })
			.eq("workspace_id", workspaceId).eq("id", workItemId);
		if (error) console.error("[work] activity not bumped", { itemId: workItemId, message: error.message });
	} catch (error) {
		console.error("[work] activity not bumped", { itemId: workItemId, message: error instanceof Error ? error.message : String(error) });
	}
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
	projectId?: string | null;
	cycleId?: string | null;
	/** The parent item's id, or null to clear it. The caller checks for cycles (wouldCreateParentCycle). */
	parentId?: string | null;
	estimate?: number | null;
	dueAt?: string | null;
	/**
	 * The SLA due time. updateWorkItem computes it from the workspace settings when the priority
	 * changes and this is left out; priority 0 clears it.
	 */
	slaDueAt?: string | null;
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
	if (changes.projectId !== undefined && changes.projectId !== (item.project_id ?? null)) {
		patch.project_id = changes.projectId;
		events.push({ kind: "project", data: { from: item.project_id ?? null, to: changes.projectId } });
	}
	if (changes.cycleId !== undefined && changes.cycleId !== (item.cycle_id ?? null)) {
		patch.cycle_id = changes.cycleId;
		events.push({ kind: "cycle", data: { from: item.cycle_id ?? null, to: changes.cycleId } });
	}
	if (changes.parentId !== undefined && changes.parentId !== (item.parent_id ?? null)) {
		patch.parent_id = changes.parentId;
		events.push({ kind: "parent", data: { from: item.parent_id ?? null, to: changes.parentId } });
	}
	if (changes.estimate !== undefined && changes.estimate !== (item.estimate ?? null)) {
		patch.estimate = changes.estimate;
		events.push({ kind: "estimate", data: { from: item.estimate ?? null, to: changes.estimate } });
	}
	if (changes.dueAt !== undefined && changes.dueAt !== item.due_at) {
		patch.due_at = changes.dueAt;
		events.push({ kind: "link", data: { type: "due_at", from: item.due_at, to: changes.dueAt } });
	}
	if (changes.slaDueAt !== undefined && changes.slaDueAt !== (item.sla_due_at ?? null)) patch.sla_due_at = changes.slaDueAt;
	if (Object.keys(patch).length) {
		patch.updated_at = now;
		// Anything that writes an event (or edits the text) is activity; a recomputed SLA alone is not.
		if (events.length || patch.title !== undefined || patch.description !== undefined || patch.labels !== undefined || patch.triage_summary !== undefined) patch.last_activity_at = now;
	}
	return { patch, events };
}

export type UpdateWorkItemOptions = {
	/** Skip subscriptions and notifications (bulk callers that notify once themselves). */
	quiet?: boolean;
};

/**
 * Applies a change to an item and writes its events. Returns the updated row (the same row when
 * nothing changed). Throws when the update fails. A priority change recomputes sla_due_at from the
 * workspace settings (unless changes.slaDueAt is given). Afterwards, never failing the change: a
 * new assignee is subscribed and notified, and moving to done or cancelled notifies subscribers.
 */
export async function updateWorkItem(client: DataClient, item: WorkItemRow, changes: WorkItemChanges, actor: WorkActor, options: UpdateWorkItemOptions = {}): Promise<WorkItemRow> {
	const resolved = { ...changes };
	if (resolved.priority !== undefined && resolved.priority !== item.priority && resolved.slaDueAt === undefined) {
		resolved.slaDueAt = resolved.priority >= 1 && resolved.priority <= 4
			? slaDueAt(await loadWorkSettingsOrDefaults(client, item.workspace_id), resolved.priority)
			: null;
	}
	const { patch, events } = planWorkItemChanges(item, resolved);
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
	const updated = data as unknown as WorkItemRow;
	if (!options.quiet) await afterUpdate(client, item, updated, actor);
	return updated;
}

const STATE_LABELS: Record<WorkItemState, string> = {
	triage: "triage",
	backlog: "backlog",
	todo: "to do",
	in_progress: "in progress",
	in_review: "in review",
	done: "done",
	cancelled: "cancelled",
};

/** Subscriptions and notifications after a change. Never throws. */
export async function afterUpdate(client: DataClient, before: WorkItemRow, after: WorkItemRow, actor: WorkActor): Promise<void> {
	try {
		const label = `#${after.number} ${after.title}`;
		const newAssignee = after.assignee_user_id && after.assignee_user_id !== before.assignee_user_id ? after.assignee_user_id : null;
		if (newAssignee) {
			await subscribe(client, { workspaceId: after.workspace_id, workItemId: after.id, userId: newAssignee, reason: "assignee" });
			await notify(client, { workspaceId: after.workspace_id, userIds: [newAssignee], workItemId: after.id, kind: "assigned", actorName: actor.name ?? null, body: label, exceptUserId: actor.userId ?? null });
		}
		if (after.state !== before.state && isClosedState(after.state)) {
			await notifySubscribers(client, {
				workspaceId: after.workspace_id,
				workItemId: after.id,
				kind: "state",
				actorName: actor.name ?? null,
				body: `${label} moved to ${STATE_LABELS[after.state]}`,
				exceptUserId: actor.userId ?? null,
			});
		}
	} catch (error) {
		console.error("[work] notifications not written", { itemId: after.id, message: error instanceof Error ? error.message : String(error) });
	}
}

/**
 * Whether making `parentId` the parent of `itemId` would make the item its own ancestor. Walks up
 * at most MAX_PARENT_DEPTH levels; a chain deeper than that is refused too.
 */
export async function wouldCreateParentCycle(client: DataClient, workspaceId: string, itemId: string, parentId: string): Promise<boolean> {
	let current: string | null = parentId;
	for (let depth = 0; depth < MAX_PARENT_DEPTH; depth += 1) {
		if (!current) return false;
		if (current === itemId) return true;
		const { data, error } = await client.from("work_items").select("id,parent_id").eq("workspace_id", workspaceId).eq("id", current).maybeSingle();
		if (error) throw new Error(`work_items read failed: ${error.message}`);
		current = (data as { parent_id?: string | null } | null)?.parent_id ?? null;
	}
	return current !== null;
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
