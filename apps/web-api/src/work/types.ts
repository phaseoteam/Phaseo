// Shared types for the work tracker: database rows (snake_case, as Supabase returns them) and the
// camelCase shapes the account API returns. Rows match supabase/migrations/20261102113319_work_tracker.sql.

export const WORK_ITEM_STATES = ["triage", "backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type WorkItemState = (typeof WORK_ITEM_STATES)[number];
export const CLOSED_WORK_ITEM_STATES: readonly WorkItemState[] = ["done", "cancelled"];

export const WORK_ITEM_SOURCES = ["manual", "ask", "error", "github", "slack", "gateway", "agent"] as const;
export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];

export const WORK_AGENTS = ["triage", "engineer", "support"] as const;
export type WorkAgent = (typeof WORK_AGENTS)[number];

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type WorkPriority = 0 | 1 | 2 | 3 | 4;

export const WORK_EVENT_KINDS = [
	"created",
	"comment",
	"state",
	"priority",
	"assignee",
	"link",
	"triage",
	"agent_run",
	"customer_request",
	"github",
	"error",
	"project",
	"cycle",
	"parent",
	"relation",
	"estimate",
	"reply",
	"sla",
	"stalled",
] as const;
export type WorkEventKind = (typeof WORK_EVENT_KINDS)[number];

export const WORK_AUTHOR_KINDS = ["user", "agent", "system", "github", "customer"] as const;
export type WorkAuthorKind = (typeof WORK_AUTHOR_KINDS)[number];

export type CustomerRequestSource = "manual" | "form" | "email" | "slack" | "api";
export const CUSTOMER_REQUEST_STATUSES = ["new", "linked", "dismissed"] as const;
export type CustomerRequestStatus = (typeof CUSTOMER_REQUEST_STATUSES)[number];

export const ERROR_GROUP_STATUSES = ["open", "resolved", "ignored"] as const;
export type ErrorGroupStatus = (typeof ERROR_GROUP_STATUSES)[number];

export const AGENT_RUN_RUNNERS = ["gateway", "github_actions", "desktop"] as const;
export type AgentRunRunner = (typeof AGENT_RUN_RUNNERS)[number];
export const AGENT_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export const FINISHED_AGENT_RUN_STATUSES: readonly AgentRunStatus[] = ["succeeded", "failed", "cancelled"];

export const WORK_PROJECT_STATES = ["planned", "active", "paused", "completed", "cancelled"] as const;
export type WorkProjectState = (typeof WORK_PROJECT_STATES)[number];

export const WORK_RELATION_KINDS = ["blocks", "related"] as const;
export type WorkRelationKind = (typeof WORK_RELATION_KINDS)[number];
/** How a relation reads from one item: it blocks the other, is blocked by it, or is related. */
export type WorkRelationDirection = "blocks" | "blocked_by" | "related";

export const WORK_VIEW_LAYOUTS = ["list", "board"] as const;
export type WorkViewLayout = (typeof WORK_VIEW_LAYOUTS)[number];

export const WORK_SUBSCRIPTION_REASONS = ["creator", "assignee", "commenter", "mention", "manual"] as const;
export type WorkSubscriptionReason = (typeof WORK_SUBSCRIPTION_REASONS)[number];

export const WORK_NOTIFICATION_KINDS = ["assigned", "comment", "mention", "state", "sla", "stalled", "error_spike", "agent", "reply_draft"] as const;
export type WorkNotificationKind = (typeof WORK_NOTIFICATION_KINDS)[number];

export const REPLY_DRAFT_STATUSES = ["draft", "sent", "discarded"] as const;
export type ReplyDraftStatus = (typeof REPLY_DRAFT_STATUSES)[number];

/** Estimates are points from 0 to 21. */
export const MAX_WORK_ESTIMATE = 21;

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

export type WorkItemRow = {
	id: string;
	workspace_id: string;
	number: number;
	title: string;
	description: string;
	state: WorkItemState;
	priority: number;
	source: WorkItemSource;
	labels: string[];
	assignee_user_id: string | null;
	assignee_agent: WorkAgent | null;
	duplicate_of: string | null;
	error_group_id: string | null;
	github_repo: string | null;
	github_issue_number: number | null;
	github_issue_url: string | null;
	github_pr_url: string | null;
	triage_summary: string | null;
	due_at: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	project_id: string | null;
	cycle_id: string | null;
	parent_id: string | null;
	estimate: number | null;
	sla_due_at: string | null;
	last_activity_at: string;
};

export type WorkItemEventRow = {
	id: string;
	workspace_id: string;
	work_item_id: string;
	kind: WorkEventKind;
	author_kind: WorkAuthorKind;
	author_user_id: string | null;
	author_name: string | null;
	body: string;
	data: Record<string, unknown>;
	created_at: string;
};

export type CustomerRow = {
	id: string;
	workspace_id: string;
	name: string;
	domain: string | null;
	external_ref: string | null;
	tier: string | null;
	notes: string;
	created_at: string;
	updated_at: string;
};

export type CustomerRequestRow = {
	id: string;
	workspace_id: string;
	customer_id: string | null;
	work_item_id: string | null;
	intake_form_id: string | null;
	source: CustomerRequestSource;
	status: CustomerRequestStatus;
	contact_name: string | null;
	contact_email: string | null;
	subject: string | null;
	body: string;
	metadata: Record<string, unknown>;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

export type IntakeFormRow = {
	id: string;
	workspace_id: string;
	name: string;
	token_hash: string;
	token_prefix: string;
	enabled: boolean;
	auto_triage: boolean;
	created_by: string | null;
	created_at: string;
	last_used_at: string | null;
};

export type ErrorProjectRow = {
	id: string;
	workspace_id: string;
	name: string;
	key_hash: string;
	key_prefix: string;
	enabled: boolean;
	auto_triage: boolean;
	github_repo: string | null;
	created_by: string | null;
	created_at: string;
	last_event_at: string | null;
};

export type ErrorGroupRow = {
	id: string;
	workspace_id: string;
	project_id: string;
	fingerprint: string;
	exception_type: string;
	message: string;
	culprit: string | null;
	status: ErrorGroupStatus;
	/** bigint: Supabase may return it as a number or a string. */
	event_count: number | string;
	first_seen_at: string;
	last_seen_at: string;
	last_release: string | null;
	last_environment: string | null;
	last_event: Record<string, unknown>;
	work_item_id: string | null;
	resolved_at: string | null;
	spike_alerted_at?: string | null;
};

export type GithubRepoRow = {
	id: string;
	workspace_id: string;
	repo: string;
	bridge_token_hash: string;
	bridge_token_prefix: string;
	github_token_ciphertext: string | null;
	sync_issues: boolean;
	created_by: string | null;
	created_at: string;
	last_event_at: string | null;
};

export type AgentRunRow = {
	id: string;
	workspace_id: string;
	work_item_id: string;
	agent: WorkAgent;
	runner: AgentRunRunner;
	status: AgentRunStatus;
	model: string | null;
	/** bigint: Supabase may return it as a number or a string. */
	cost_nanos: number | string;
	summary: string | null;
	output: Record<string, unknown>;
	external_url: string | null;
	requested_by: string | null;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
};

/** What public.record_work_error_event returns (null when the project is unknown or disabled). */
export type RecordErrorEventResult = {
	group_id: string;
	workspace_id: string;
	is_new: boolean;
	reopened: boolean;
	status: ErrorGroupStatus;
	work_item_id: string | null;
	event_count: number;
	auto_triage: boolean;
	github_repo: string | null;
	/** Events in the group's current hour. */
	hour_count?: number;
	/** True at most once every 6 hours per group: at least 10 events this hour and 5x the previous day's hourly average. */
	spiking?: boolean;
};

export type WorkProjectRow = {
	id: string;
	workspace_id: string;
	name: string;
	description: string;
	state: WorkProjectState;
	lead_user_id: string | null;
	/** A date (YYYY-MM-DD). */
	target_date: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

export type WorkCycleRow = {
	id: string;
	workspace_id: string;
	number: number;
	name: string | null;
	/** Dates (YYYY-MM-DD), both inclusive; ends_on is after starts_on. */
	starts_on: string;
	ends_on: string;
	created_at: string;
};

export type WorkItemRelationRow = {
	id: string;
	workspace_id: string;
	/** For blocks: this item blocks related_item_id. */
	item_id: string;
	related_item_id: string;
	kind: WorkRelationKind;
	created_by: string | null;
	created_at: string;
};

export type WorkViewRow = {
	id: string;
	workspace_id: string;
	/** Null means shared with the workspace. */
	owner_user_id: string | null;
	name: string;
	filters: Record<string, unknown>;
	layout: WorkViewLayout;
	position: number;
	created_at: string;
	updated_at: string;
};

/** SLA hours by priority ("1" urgent to "4" low). */
export type WorkSlaHours = Record<"1" | "2" | "3" | "4", number>;

export type WorkSettingsRow = {
	workspace_id: string;
	sla_hours: Partial<Record<string, number>>;
	stall_days: number;
	ambient_enabled: boolean;
	support_drafts_enabled: boolean;
	updated_by: string | null;
	updated_at: string;
};

export type WorkSubscriptionRow = {
	work_item_id: string;
	user_id: string;
	workspace_id: string;
	reason: WorkSubscriptionReason;
	created_at: string;
};

export type WorkNotificationRow = {
	id: string;
	workspace_id: string;
	user_id: string;
	work_item_id: string | null;
	kind: WorkNotificationKind;
	actor_name: string | null;
	body: string;
	read_at: string | null;
	created_at: string;
};

export type ReplyDraftRow = {
	id: string;
	workspace_id: string;
	work_item_id: string;
	request_id: string;
	subject: string;
	body: string;
	status: ReplyDraftStatus;
	model: string | null;
	/** bigint: Supabase may return it as a number or a string. */
	cost_nanos: number | string;
	sent_to: string | null;
	sent_by: string | null;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
};

/** What public.work_insights returns (snake_case, aggregated in SQL). */
export type WorkInsightsRow = {
	created: Array<{ day: string; source: WorkItemSource; items: number }>;
	closed: Array<{ day: string; items: number; done: number }>;
	open_by_state: Partial<Record<WorkItemState, number>>;
	open_by_priority: Partial<Record<string, number>>;
	open_past_sla: number;
	open_stalled: number;
	close_hours_p50: number | string | null;
	close_hours_p90: number | string | null;
	runs: Array<{ agent: WorkAgent; runs: number; succeeded: number; cost_nanos: number | string }>;
};

// ---------------------------------------------------------------------------------------------
// API response shapes (camelCase)
// ---------------------------------------------------------------------------------------------

export type WorkItem = {
	id: string;
	number: number;
	title: string;
	description: string;
	state: WorkItemState;
	priority: number;
	source: WorkItemSource;
	labels: string[];
	assigneeUserId: string | null;
	assigneeAgent: WorkAgent | null;
	/** The item id this one duplicates. */
	duplicateOf: string | null;
	/** The number of the item this one duplicates, when known. */
	duplicateOfNumber: number | null;
	errorGroupId: string | null;
	githubRepo: string | null;
	githubIssueNumber: number | null;
	githubIssueUrl: string | null;
	githubPrUrl: string | null;
	triageSummary: string | null;
	dueAt: string | null;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
	projectId: string | null;
	cycleId: string | null;
	/** The parent item's id (sub-items). */
	parentId: string | null;
	/** The parent item's number, when known. */
	parentNumber: number | null;
	estimate: number | null;
	slaDueAt: string | null;
	/** Closed after its SLA due time, or open and past it. */
	slaBreached: boolean;
	/** Open, not yet breached, with under 25% of its SLA time left. */
	slaAtRisk: boolean;
	lastActivityAt: string;
	/** Sub-items, on list responses (count query per page). */
	childCount?: number;
	/** Open items blocking this one, on list responses (count query per page). */
	blockedByCount?: number;
};

export type WorkItemEvent = {
	id: string;
	kind: WorkEventKind;
	authorKind: WorkAuthorKind;
	authorUserId: string | null;
	authorName: string | null;
	body: string;
	data: Record<string, unknown>;
	createdAt: string;
};

export type Customer = {
	id: string;
	name: string;
	domain: string | null;
	externalRef: string | null;
	tier: string | null;
	notes: string;
	requestCount: number;
	openItemCount: number;
	createdAt: string;
	updatedAt: string;
};

export type CustomerRequest = {
	id: string;
	customerId: string | null;
	customerName: string | null;
	workItemId: string | null;
	workItemNumber: number | null;
	intakeFormId: string | null;
	source: CustomerRequestSource;
	status: CustomerRequestStatus;
	contactName: string | null;
	contactEmail: string | null;
	subject: string | null;
	body: string;
	metadata: Record<string, unknown>;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
};

export type IntakeForm = {
	id: string;
	name: string;
	tokenPrefix: string;
	enabled: boolean;
	autoTriage: boolean;
	createdAt: string;
	lastUsedAt: string | null;
};

export type ErrorProject = {
	id: string;
	name: string;
	keyPrefix: string;
	enabled: boolean;
	autoTriage: boolean;
	githubRepo: string | null;
	createdAt: string;
	lastEventAt: string | null;
};

export type ErrorGroup = {
	id: string;
	projectId: string;
	projectName: string | null;
	fingerprint: string;
	exceptionType: string;
	message: string;
	culprit: string | null;
	status: ErrorGroupStatus;
	eventCount: number;
	firstSeenAt: string;
	lastSeenAt: string;
	lastRelease: string | null;
	lastEnvironment: string | null;
	lastEvent: Record<string, unknown>;
	workItemId: string | null;
	workItemNumber: number | null;
	resolvedAt: string | null;
};

export type GithubRepo = {
	id: string;
	repo: string;
	bridgeTokenPrefix: string;
	hasGithubToken: boolean;
	syncIssues: boolean;
	createdAt: string;
	lastEventAt: string | null;
};

export type AgentRun = {
	id: string;
	workItemId: string;
	workItemNumber: number | null;
	agent: WorkAgent;
	runner: AgentRunRunner;
	status: AgentRunStatus;
	model: string | null;
	costNanos: number;
	summary: string | null;
	output: Record<string, unknown>;
	externalUrl: string | null;
	requestedBy: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
};

export type WorkMember = { userId: string; name: string | null; email: string | null };

export type WorkProject = {
	id: string;
	name: string;
	description: string;
	state: WorkProjectState;
	leadUserId: string | null;
	targetDate: string | null;
	itemCount: number;
	doneCount: number;
	/** doneCount / itemCount, 0 to 1 (0 when the project has no items). */
	progress: number;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
};

export type WorkCycle = {
	id: string;
	number: number;
	name: string | null;
	startsOn: string;
	endsOn: string;
	itemCount: number;
	doneCount: number;
	/** Sum of the cycle's item estimates; null when the database could not sum them. */
	scope: number | null;
	/** Sum of the cycle's done item estimates; null when the database could not sum them. */
	completed: number | null;
	createdAt: string;
};

export type WorkItemRelation = {
	id: string;
	kind: WorkRelationKind;
	/** Read from this item: it blocks the other, is blocked by it, or they are related. */
	direction: WorkRelationDirection;
	otherItemId: string;
	otherNumber: number | null;
	otherTitle: string | null;
	otherState: WorkItemState | null;
	createdAt: string;
};

/** The item filters a saved view stores (the same names as GET /items' query parameters). */
export type WorkViewFilters = {
	q?: string;
	state?: string;
	source?: WorkItemSource;
	assignee?: string;
	label?: string;
	projectId?: string;
	cycleId?: string;
	priority?: number;
	parent?: number;
	blocked?: boolean;
};

export type WorkView = {
	id: string;
	name: string;
	shared: boolean;
	ownerUserId: string | null;
	filters: WorkViewFilters;
	layout: WorkViewLayout;
	position: number;
	createdAt: string;
	updatedAt: string;
};

export type WorkSettings = {
	slaHours: WorkSlaHours;
	stallDays: number;
	ambientEnabled: boolean;
	supportDraftsEnabled: boolean;
	updatedAt: string | null;
};

export type WorkNotification = {
	id: string;
	kind: WorkNotificationKind;
	workItemId: string | null;
	workItemNumber: number | null;
	workItemTitle: string | null;
	actorName: string | null;
	body: string;
	readAt: string | null;
	createdAt: string;
};

export type ReplyDraft = {
	id: string;
	workItemId: string;
	requestId: string;
	subject: string;
	body: string;
	status: ReplyDraftStatus;
	model: string | null;
	costNanos: number;
	sentTo: string | null;
	sentBy: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type WorkInsights = {
	from: string;
	to: string;
	created: Array<{ day: string; source: WorkItemSource; items: number }>;
	closed: Array<{ day: string; items: number; done: number }>;
	openByState: Partial<Record<WorkItemState, number>>;
	openByPriority: Partial<Record<string, number>>;
	openPastSla: number;
	openStalled: number;
	closeHoursP50: number | null;
	closeHoursP90: number | null;
	/** costUsd is cost_nanos / 1e9 (US dollars). */
	runs: Array<{ agent: WorkAgent; runs: number; succeeded: number; costNanos: number; costUsd: number }>;
	totalCostUsd: number;
};
