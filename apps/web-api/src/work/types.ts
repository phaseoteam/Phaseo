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
] as const;
export type WorkEventKind = (typeof WORK_EVENT_KINDS)[number];

export const WORK_AUTHOR_KINDS = ["user", "agent", "system", "github", "customer"] as const;
export type WorkAuthorKind = (typeof WORK_AUTHOR_KINDS)[number];

export type CustomerRequestSource = "manual" | "form" | "email" | "slack" | "api";
export const CUSTOMER_REQUEST_STATUSES = ["new", "linked", "dismissed"] as const;
export type CustomerRequestStatus = (typeof CUSTOMER_REQUEST_STATUSES)[number];

export const ERROR_GROUP_STATUSES = ["open", "resolved", "ignored"] as const;
export type ErrorGroupStatus = (typeof ERROR_GROUP_STATUSES)[number];

export type AgentRunRunner = "gateway" | "github_actions" | "desktop";
export const AGENT_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

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
