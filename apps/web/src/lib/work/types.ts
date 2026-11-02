// The work tracker's account API shapes, copied from apps/web-api/src/work/types.ts
// (the web app doesn't import web-api). Keep the two in step.

export const WORK_ITEM_STATES = ["triage", "backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type WorkItemState = (typeof WORK_ITEM_STATES)[number];
export const CLOSED_WORK_ITEM_STATES: readonly WorkItemState[] = ["done", "cancelled"];

export const WORK_ITEM_SOURCES = ["manual", "ask", "error", "github", "slack", "gateway", "agent"] as const;
export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];

export const WORK_AGENTS = ["triage", "engineer", "support"] as const;
export type WorkAgent = (typeof WORK_AGENTS)[number];

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const WORK_PRIORITIES = [0, 1, 2, 3, 4] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export const WORK_EVENT_KINDS = ["created", "comment", "state", "priority", "assignee", "link", "triage", "agent_run", "customer_request", "github", "error"] as const;
export type WorkEventKind = (typeof WORK_EVENT_KINDS)[number];

export const WORK_AUTHOR_KINDS = ["user", "agent", "system", "github", "customer"] as const;
export type WorkAuthorKind = (typeof WORK_AUTHOR_KINDS)[number];

export const CUSTOMER_REQUEST_SOURCES = ["manual", "form", "email", "slack", "api"] as const;
export type CustomerRequestSource = (typeof CUSTOMER_REQUEST_SOURCES)[number];
export const CUSTOMER_REQUEST_STATUSES = ["new", "linked", "dismissed"] as const;
export type CustomerRequestStatus = (typeof CUSTOMER_REQUEST_STATUSES)[number];

export const ERROR_GROUP_STATUSES = ["open", "resolved", "ignored"] as const;
export type ErrorGroupStatus = (typeof ERROR_GROUP_STATUSES)[number];

export const AGENT_RUN_RUNNERS = ["gateway", "github_actions", "desktop"] as const;
export type AgentRunRunner = (typeof AGENT_RUN_RUNNERS)[number];
export const AGENT_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

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

// Responses

export type WorkItemsResponse = { items: WorkItem[]; nextCursor: string | null };
export type WorkItemDetailResponse = {
	item: WorkItem;
	events: WorkItemEvent[];
	requests: CustomerRequest[];
	runs: AgentRun[];
	errorGroup?: ErrorGroup | null;
};
export type WorkMembersResponse = { members: WorkMember[] };
export type WorkCustomersResponse = { customers: Customer[] };
export type WorkRequestsResponse = { requests: CustomerRequest[] };
export type WorkErrorGroupsResponse = { groups: ErrorGroup[] };
export type WorkIntakeFormsResponse = { forms: IntakeForm[] };
export type WorkErrorProjectsResponse = { projects: ErrorProject[] };
export type WorkGithubReposResponse = { repos: GithubRepo[] };
export type WorkAgentRunsResponse = { runs: AgentRun[] };

/** The browser and server error event shared by the capture script and ingest. */
export type WorkErrorFrame = { function?: string; file?: string; line?: number; column?: number; inApp?: boolean };
