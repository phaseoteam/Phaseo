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

export const WORK_EVENT_KINDS = [
	"created", "comment", "state", "priority", "assignee", "link", "triage", "agent_run", "customer_request", "github", "error",
	"project", "cycle", "parent", "relation", "estimate", "reply", "sla", "stalled",
] as const;
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
	// Batch 2. Optional while the API rolls out, so older answers still parse.
	projectId?: string | null;
	cycleId?: string | null;
	parentId?: string | null;
	parentNumber?: number | null;
	/** 0 to 21 points. */
	estimate?: number | null;
	slaDueAt?: string | null;
	slaBreached?: boolean;
	slaAtRisk?: boolean;
	lastActivityAt?: string;
	/** Sub-items, from GET /items. */
	childCount?: number;
	/** Open items blocking this one, from GET /items. */
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
	/** The source map upload token's prefix, or null when none was made. */
	uploadKeyPrefix?: string | null;
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
	/** People affected (counted by a hash of the app's user id). */
	usersCount?: number;
	firstRelease?: string | null;
	resolvedInRelease?: string | null;
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
} & WorkItemRelationsDetail;
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
/** A frame with its original position, when the release's source map covers it. */
export type WorkMappedFrame = WorkErrorFrame & { original?: { file: string; line: number; column: number; function?: string } };

export const ERROR_RULE_ACTIONS = ["ignore", "assign"] as const;
export const ERROR_RULE_FIELDS = ["message", "type", "file", "environment"] as const;
export type ErrorRuleAction = (typeof ERROR_RULE_ACTIONS)[number];
export type ErrorRuleField = (typeof ERROR_RULE_FIELDS)[number];
export type ErrorRule = { id: string; action: ErrorRuleAction; field: ErrorRuleField; pattern: string; assigneeUserId: string | null; enabled: boolean; createdAt: string };
export type ErrorSourcemap = { id: string; release: string; file: string; sizeBytes: number; createdAt: string };
export type ErrorRelease = { version: string; firstSeenAt: string; lastSeenAt: string; eventCount: number; newGroups: number };

// Batch 2: projects, cycles, relations, views, settings, notifications, reply drafts and insights.

export const WORK_PROJECT_STATES = ["planned", "active", "paused", "completed", "cancelled"] as const;
export type WorkProjectState = (typeof WORK_PROJECT_STATES)[number];

export type WorkProject = {
	id: string;
	name: string;
	description: string;
	state: WorkProjectState;
	leadUserId: string | null;
	/** yyyy-mm-dd */
	targetDate: string | null;
	itemCount: number;
	doneCount: number;
	/** 0 to 1. */
	progress: number;
	createdAt: string;
	updatedAt: string;
};

export type WorkCycle = {
	id: string;
	number: number;
	name: string | null;
	/** yyyy-mm-dd */
	startsOn: string;
	/** yyyy-mm-dd */
	endsOn: string;
	itemCount: number;
	doneCount: number;
	/** Sum of estimates in the cycle; null when the database couldn't sum them. */
	scope: number | null;
	/** Sum of estimates of done items in the cycle. */
	completed: number | null;
	createdAt: string;
	/** The cycle's totals as recorded each day, oldest first. Only on the current cycle and a cycle's own page. */
	history?: WorkCycleDay[];
};

/** One recorded day of a cycle (yyyy-mm-dd, UTC). */
export type WorkCycleDay = { day: string; scope: number; completed: number; itemCount: number; doneCount: number };

export const WORK_RELATION_KINDS = ["blocks", "related"] as const;
export type WorkRelationKind = (typeof WORK_RELATION_KINDS)[number];

export type WorkRelationDirection = "blocks" | "blocked_by" | "related";

/** A relation read from this item's side: it blocks the other, is blocked by it, or they are related. */
export type WorkRelation = {
	id: string;
	kind: WorkRelationKind;
	direction: WorkRelationDirection;
	otherItemId?: string;
	otherNumber: number | null;
	otherTitle: string | null;
	otherState: WorkItemState | null;
	createdAt?: string;
};

export type WorkItemSummary = Pick<WorkItem, "id" | "number" | "title" | "state"> & Partial<Pick<WorkItem, "priority" | "assigneeUserId" | "assigneeAgent" | "estimate">>;

export const WORK_VIEW_LAYOUTS = ["list", "board"] as const;
export type WorkViewLayout = (typeof WORK_VIEW_LAYOUTS)[number];

/** The filters a saved view stores. Every key is optional. */
export type WorkViewFilters = {
	q?: string;
	state?: string;
	source?: string;
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
	/** null means shared with the workspace. */
	ownerUserId: string | null;
	shared?: boolean;
	name: string;
	filters: WorkViewFilters;
	layout: WorkViewLayout;
	position: number;
	createdAt?: string;
	updatedAt?: string;
};

export type WorkSettings = {
	/** Priority "1" to "4" to hours. */
	slaHours: Record<"1" | "2" | "3" | "4", number>;
	stallDays: number;
	ambientEnabled: boolean;
	supportDraftsEnabled: boolean;
};

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
	slaHours: { "1": 4, "2": 24, "3": 72, "4": 168 },
	stallDays: 7,
	ambientEnabled: false,
	supportDraftsEnabled: true,
};

export const WORK_NOTIFICATION_KINDS = ["assigned", "comment", "mention", "state", "sla", "stalled", "error_spike", "agent", "reply_draft"] as const;
export type WorkNotificationKind = (typeof WORK_NOTIFICATION_KINDS)[number];

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

export const REPLY_DRAFT_STATUSES = ["draft", "sent", "discarded"] as const;
export type ReplyDraftStatus = (typeof REPLY_DRAFT_STATUSES)[number];

export type ReplyDraft = {
	id: string;
	workItemId: string;
	workItemNumber?: number | null;
	requestId: string;
	subject: string;
	body: string;
	status: ReplyDraftStatus;
	model: string | null;
	costNanos: number;
	/** The recipient, when the API returns it. Otherwise the request's contact email is used. */
	contactEmail?: string | null;
	sentTo: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type WorkInsights = {
	from: string;
	to: string;
	created: Array<{ day: string; source: WorkItemSource; items: number }>;
	closed: Array<{ day: string; items: number; done: number }>;
	/** State to count. Older answers sent a list of { state, items }. */
	openByState: Partial<Record<WorkItemState, number>> | Array<{ state: WorkItemState; items: number }>;
	/** Priority "0" to "4" to count. Older answers sent a list of { priority, items }. */
	openByPriority: Partial<Record<string, number>> | Array<{ priority: number; items: number }>;
	openPastSla: number;
	openStalled: number;
	closeHoursP50: number | null;
	closeHoursP90: number | null;
	/** costUsd is in US dollars, as the API returns it. */
	runs: Array<{ agent: WorkAgent; runs: number; succeeded: number; costUsd?: number; costNanos?: number }>;
	totalCostUsd?: number;
};

export type WorkItemRelationsDetail = {
	children?: WorkItemSummary[];
	parent?: WorkItemSummary | null;
	relations?: WorkRelation[];
	subscribed?: boolean;
};

export type WorkProjectsResponse = { projects: WorkProject[] };
export type WorkProjectDetailResponse = { project: WorkProject; items: WorkItem[] };
export type WorkCyclesResponse = { cycles: WorkCycle[] };
export type WorkCurrentCycleResponse = { cycle: WorkCycle | null };
export type WorkViewsResponse = { views: WorkView[] };
export type WorkSettingsResponse = { settings: WorkSettings; canEdit?: boolean };
export type WorkNotificationsResponse = { notifications: WorkNotification[]; unreadCount: number; nextCursor?: string | null };
export type ReplyDraftsResponse = { drafts: ReplyDraft[] };
/** web-api has no email sender for arbitrary recipients yet: "manual" means marked sent, for the person to send. */
/** GET/PATCH /me/settings: the person's own work settings; emailAvailable says whether work email is on at all. */
export type WorkMemberSettingsResponse = { settings: { emailNotifications: "off" | "digest" }; emailAvailable: boolean };

export type ReplyDraftSendResponse = { draft: ReplyDraft; delivery?: "manual" | "email"; email?: { to: string; subject: string; body: string }; mailto?: string };
