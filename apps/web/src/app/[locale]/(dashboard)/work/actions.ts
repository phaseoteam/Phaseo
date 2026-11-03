"use server";

import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type {
	AgentRun,
	Customer,
	CustomerRequest,
	ErrorGroupStatus,
	ErrorProject,
	GithubRepo,
	IntakeForm,
	ReplyDraft,
	ReplyDraftSendResponse,
	WorkAgent,
	WorkCycle,
	WorkItem,
	WorkItemEvent,
	WorkItemState,
	WorkMember,
	WorkNotification,
	WorkProject,
	WorkProjectState,
	WorkRelation,
	WorkRelationKind,
	WorkSettings,
	WorkView,
	WorkViewFilters,
	WorkViewLayout,
	WorkMemberSettingsResponse,
	ErrorRelease,
	ErrorRule,
	ErrorRuleAction,
	ErrorRuleField,
	ErrorSourcemap,
	ProjectHealth,
	ProjectUpdate,
	ReactionCount,
	ReactionEmoji,
	RecurrenceCadence,
	WorkMilestone,
	WorkRecurrence,
	WorkTemplate,
	WorkApiKey,
	WorkWebhook,
	WorkDocument,
	WorkInitiative,
	InitiativeState,
} from "@/lib/work/types";

export type WorkActionError = { ok: false; status: number | null; code: string | null; message: string | null };
type Result<T> = ({ ok: true } & T) | WorkActionError;

const BASE = "/api/account/work";

class WorkAccessError extends Error {
	constructor(readonly status: number) { super("work_access"); }
}

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn) throw new WorkAccessError(401);
	if (!status.isAdmin) throw new WorkAccessError(403);
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WorkAccessError(401);
	if (!workspaceId) throw new WorkAccessError(400);
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown): WorkActionError {
	if (error instanceof WorkAccessError) return { ok: false, status: error.status, code: null, message: null };
	if (error instanceof WebApiError) {
		const detail = error.detail ?? null;
		const code = error.code && /^[a-z_]+$/.test(error.code) ? error.code : detail && /^[a-z_]+$/.test(detail) ? detail : null;
		return { ok: false, status: error.status, code, message: detail && detail !== code ? detail : null };
	}
	return { ok: false, status: null, code: null, message: null };
}

async function send<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body: Record<string, unknown> = {}): Promise<T> {
	const context = await account();
	return fetchAccountWebApi<T>(`${BASE}/${path}`, context.accessToken, {
		method,
		body: JSON.stringify({ ...body, workspaceId: context.workspaceId }),
	});
}

async function get<T>(path: string): Promise<T> {
	const context = await account();
	const separator = path.includes("?") ? "&" : "?";
	return fetchAccountWebApi<T>(`${BASE}/${path}${separator}workspaceId=${encodeURIComponent(context.workspaceId)}`, context.accessToken);
}

async function run<T>(task: () => Promise<T>): Promise<Result<T>> {
	try {
		return { ok: true as const, ...(await task()) };
	} catch (error) {
		return failure(error);
	}
}

const id = (value: string) => encodeURIComponent(value);
const itemPath = (number: number) => `items/${Math.trunc(number)}`;

// Items

export type CreateWorkItemInput = {
	title: string;
	description?: string;
	state?: WorkItemState;
	priority?: number;
	labels?: string[];
	assigneeUserId?: string | null;
	assigneeAgent?: WorkAgent | null;
	githubRepo?: string | null;
	projectId?: string | null;
	cycleId?: string | null;
	parentNumber?: number | null;
	estimate?: number | null;
	dueAt?: string | null;
	milestoneId?: string | null;
};

export async function createWorkItem(input: CreateWorkItemInput) {
	return run(() => send<{ item: WorkItem }>("POST", "items", input));
}

export type UpdateWorkItemInput = Partial<Omit<CreateWorkItemInput, "title">> & { title?: string; duplicateOf?: number | null };

export async function updateWorkItem(number: number, input: UpdateWorkItemInput) {
	return run(() => send<{ item: WorkItem }>("PATCH", itemPath(number), input));
}

export async function commentOnWorkItem(number: number, body: string) {
	return run(() => send<{ event: WorkItemEvent }>("POST", `${itemPath(number)}/comments`, { body }));
}

export async function triageWorkItem(number: number) {
	return run(() => send<{ run: AgentRun; item: WorkItem }>("POST", `${itemPath(number)}/triage`));
}

export async function createGithubIssueForItem(number: number, repo?: string) {
	return run(() => send<{ item: WorkItem }>("POST", `${itemPath(number)}/github`, repo ? { repo } : {}));
}

/** The next page of an inbox query. */
export async function listWorkItems(query: { state: string; assignee?: string }, cursor: string) {
	const search = new URLSearchParams({ state: query.state, limit: "100", cursor });
	if (query.assignee) search.set("assignee", query.assignee);
	return run(() => get<{ items: WorkItem[]; nextCursor: string | null }>(`items?${search.toString()}`));
}

/** Open items for the link picker, searched by title or number. */
export async function searchWorkItems(query: string) {
	return run(() => get<{ items: WorkItem[] }>(`items?state=open&limit=20&q=${encodeURIComponent(query.slice(0, 200))}`));
}

// Customers

export type CustomerInput = { name: string; domain?: string | null; tier?: string | null; externalRef?: string | null; notes?: string };

export async function createCustomer(input: CustomerInput) {
	return run(() => send<{ customer: Customer }>("POST", "customers", input));
}

export async function updateCustomer(customerId: string, input: Partial<CustomerInput>) {
	return run(() => send<{ customer: Customer }>("PATCH", `customers/${id(customerId)}`, input));
}

// Requests

export type CustomerRequestInput = { body: string; subject?: string; contactName?: string; contactEmail?: string; customerId?: string; workItemNumber?: number };

export async function createCustomerRequest(input: CustomerRequestInput) {
	return run(() => send<{ request: CustomerRequest }>("POST", "requests", input));
}

export async function updateCustomerRequest(requestId: string, input: { status?: "new" | "dismissed"; customerId?: string | null; workItemNumber?: number }) {
	return run(() => send<{ request: CustomerRequest }>("PATCH", `requests/${id(requestId)}`, input));
}

export async function createItemFromRequest(requestId: string) {
	return run(() => send<{ item: WorkItem }>("POST", `requests/${id(requestId)}/item`));
}

// Errors

export async function updateErrorGroup(groupId: string, status: ErrorGroupStatus) {
	return run(() => send<Record<string, unknown>>("PATCH", `errors/${id(groupId)}`, { status }));
}

export async function createItemFromErrorGroup(groupId: string) {
	return run(() => send<{ item: WorkItem }>("POST", `errors/${id(groupId)}/item`));
}

// Settings

export async function createIntakeForm(input: { name: string; autoTriage: boolean }) {
	return run(() => send<{ form: IntakeForm; token: string }>("POST", "intake-forms", input));
}

export async function createIntakeEmailAlias(formId: string) {
	return run(() => send<{ form: IntakeForm }>("POST", `intake-forms/${id(formId)}/email-alias`));
}

export async function updateIntakeForm(formId: string, input: { name?: string; enabled?: boolean; autoTriage?: boolean }) {
	return run(() => send<Record<string, unknown>>("PATCH", `intake-forms/${id(formId)}`, input));
}

export async function deleteIntakeForm(formId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `intake-forms/${id(formId)}`));
}

export async function createErrorProject(input: { name: string; autoTriage: boolean; githubRepo?: string | null }) {
	return run(() => send<{ project: ErrorProject; key: string }>("POST", "error-projects", input));
}

export async function updateErrorProject(projectId: string, input: { name?: string; enabled?: boolean; autoTriage?: boolean; githubRepo?: string | null }) {
	return run(() => send<Record<string, unknown>>("PATCH", `error-projects/${id(projectId)}`, input));
}

export async function deleteErrorProject(projectId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `error-projects/${id(projectId)}`));
}

export async function linkGithubRepo(input: { repo: string; githubToken?: string }) {
	return run(() => send<{ repo: GithubRepo; bridgeToken: string; workflow: string }>("POST", "github-repos", input));
}

export async function updateGithubRepo(repoId: string, input: { syncIssues?: boolean; githubToken?: string | null }) {
	return run(() => send<Record<string, unknown>>("PATCH", `github-repos/${id(repoId)}`, input));
}

export async function deleteGithubRepo(repoId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `github-repos/${id(repoId)}`));
}

export async function getGithubWorkflow(repoId: string) {
	return run(() => get<{ workflow: string }>(`github-repos/${id(repoId)}/workflow`));
}

// Batch 2: bulk edits, relations, subscriptions

export type BulkWorkChanges = {
	state?: WorkItemState;
	priority?: number;
	assigneeUserId?: string | null;
	assigneeAgent?: WorkAgent | null;
	labelsAdd?: string[];
	labelsRemove?: string[];
	projectId?: string | null;
	cycleId?: string | null;
};

export async function bulkUpdateWorkItems(numbers: number[], changes: BulkWorkChanges) {
	const unique = [...new Set(numbers.map((number) => Math.trunc(number)).filter((number) => number > 0))].slice(0, 100);
	return run(() => send<{ updated: number; failed?: number; notFound?: number }>("POST", "items/bulk", { numbers: unique, changes }));
}

export async function addWorkRelation(number: number, kind: WorkRelationKind | "blocked_by", otherNumber: number) {
	return run(() => send<{ relations: WorkRelation[] }>("POST", `${itemPath(number)}/relations`, { kind, otherNumber: Math.trunc(otherNumber) }));
}

export async function removeWorkRelation(number: number, relationId: string) {
	return run(() => send<{ relations?: WorkRelation[] }>("DELETE", `${itemPath(number)}/relations/${id(relationId)}`));
}

export async function setWorkSubscription(number: number, subscribed: boolean) {
	return run(() => send<{ subscribed: boolean }>("POST", `${itemPath(number)}/subscription`, { subscribed }));
}

/** Items for the palette and pickers, searched by title or number across every state. */
export async function findWorkItems(query: string) {
	const q = query.trim().slice(0, 200);
	return run(() => get<{ items: WorkItem[] }>(`items?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`));
}

export async function listWorkMembers() {
	return run(() => get<{ members: WorkMember[] }>("members"));
}

// Projects

export type WorkProjectInput = { name: string; description?: string; state?: WorkProjectState; leadUserId?: string | null; targetDate?: string | null; startDate?: string | null; initiativeId?: string | null };

export async function createWorkProject(input: WorkProjectInput) {
	return run(() => send<{ project: WorkProject }>("POST", "projects", input));
}

export async function updateWorkProject(projectId: string, input: Partial<WorkProjectInput>) {
	return run(() => send<{ project: WorkProject }>("PATCH", `projects/${id(projectId)}`, input));
}

export async function deleteWorkProject(projectId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `projects/${id(projectId)}`));
}

// Cycles

export type WorkCycleInput = { name?: string | null; startsOn: string; endsOn: string };

export async function createWorkCycle(input: WorkCycleInput) {
	return run(() => send<{ cycle: WorkCycle }>("POST", "cycles", input));
}

export async function updateWorkCycle(cycleId: string, input: Partial<WorkCycleInput>) {
	return run(() => send<{ cycle: WorkCycle }>("PATCH", `cycles/${id(cycleId)}`, input));
}

export async function deleteWorkCycle(cycleId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `cycles/${id(cycleId)}`));
}

export async function rolloverWorkCycle(cycleId: string) {
	return run(() => send<{ moved: number; failed?: number; more?: boolean; nextCycle?: WorkCycle }>("POST", `cycles/${id(cycleId)}/rollover`));
}

// Views

export type WorkViewInput = { name: string; filters: WorkViewFilters; layout: WorkViewLayout; shared?: boolean };

export async function listWorkViews() {
	return run(() => get<{ views: WorkView[] }>("views"));
}

export async function createWorkView(input: WorkViewInput) {
	return run(() => send<{ view: WorkView }>("POST", "views", input));
}

export async function updateWorkView(viewId: string, input: Partial<WorkViewInput>) {
	return run(() => send<{ view: WorkView }>("PATCH", `views/${id(viewId)}`, input));
}

export async function deleteWorkView(viewId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `views/${id(viewId)}`));
}

// Settings

export async function saveWorkSettings(settings: WorkSettings) {
	return run(() => send<{ settings: WorkSettings }>("PUT", "settings", settings));
}

// Error project tools: source map upload token, rules, releases and source maps

/** Makes (or replaces) the project's source map upload token; the token is returned once. */
export async function createErrorUploadKey(projectId: string) {
	return run(() => send<{ project: ErrorProject; uploadKey: string }>("POST", `error-projects/${id(projectId)}/upload-key`));
}

/** The project's rules, recent releases and source maps, read together. */
export async function getErrorProjectTools(projectId: string) {
	return run(async () => {
		const [rules, releases, maps] = await Promise.all([
			get<{ rules: ErrorRule[] }>(`error-projects/${id(projectId)}/rules`),
			get<{ releases: ErrorRelease[] }>(`error-projects/${id(projectId)}/releases?limit=10`),
			get<{ sourcemaps: ErrorSourcemap[]; available: boolean }>(`error-projects/${id(projectId)}/sourcemaps?limit=50`),
		]);
		return { rules: rules.rules, releases: releases.releases, sourcemaps: maps.sourcemaps, sourcemapsAvailable: maps.available };
	});
}

export async function createErrorRule(projectId: string, input: { action: ErrorRuleAction; field: ErrorRuleField; pattern: string; assigneeUserId?: string | null }) {
	return run(() => send<{ rule: ErrorRule }>("POST", `error-projects/${id(projectId)}/rules`, input));
}

export async function setErrorRuleEnabled(ruleId: string, enabled: boolean) {
	return run(() => send<{ rule: ErrorRule }>("PATCH", `error-rules/${id(ruleId)}`, { enabled }));
}

export async function deleteErrorRule(ruleId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `error-rules/${id(ruleId)}`));
}

export async function deleteErrorSourcemap(projectId: string, mapId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `error-projects/${id(projectId)}/sourcemaps/${id(mapId)}`));
}

// Milestones and project updates

export async function createWorkMilestone(projectId: string, input: { name: string; targetDate?: string | null }) {
	return run(() => send<{ milestone: WorkMilestone }>("POST", `projects/${id(projectId)}/milestones`, input));
}

export async function updateWorkMilestone(milestoneId: string, input: { name?: string; targetDate?: string | null; position?: number }) {
	return run(() => send<{ milestone: WorkMilestone }>("PATCH", `milestones/${id(milestoneId)}`, input));
}

export async function deleteWorkMilestone(milestoneId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `milestones/${id(milestoneId)}`));
}

export async function postProjectUpdate(projectId: string, input: { health: ProjectHealth; body: string }) {
	return run(() => send<{ update: ProjectUpdate }>("POST", `projects/${id(projectId)}/updates`, input));
}

export async function deleteProjectUpdate(updateId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `project-updates/${id(updateId)}`));
}

// Templates and recurring items

export type WorkTemplateInput = { name: string; title?: string; description?: string; priority?: number; labels?: string[]; estimate?: number | null; projectId?: string | null; assigneeAgent?: string | null };

export async function listWorkTemplates() {
	return run(() => get<{ templates: WorkTemplate[] }>("templates"));
}

export async function createWorkTemplate(input: WorkTemplateInput) {
	return run(() => send<{ template: WorkTemplate }>("POST", "templates", input));
}

export async function updateWorkTemplate(templateId: string, input: Partial<WorkTemplateInput>) {
	return run(() => send<{ template: WorkTemplate }>("PATCH", `templates/${id(templateId)}`, input));
}

export async function deleteWorkTemplate(templateId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `templates/${id(templateId)}`));
}

export async function createWorkRecurrence(input: { templateId: string; cadence: RecurrenceCadence; startAt?: string | null }) {
	return run(() => send<{ recurrence: WorkRecurrence }>("POST", "recurrences", input));
}

export async function updateWorkRecurrence(recurrenceId: string, input: { enabled?: boolean; cadence?: RecurrenceCadence }) {
	return run(() => send<{ recurrence: WorkRecurrence }>("PATCH", `recurrences/${id(recurrenceId)}`, input));
}

export async function deleteWorkRecurrence(recurrenceId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `recurrences/${id(recurrenceId)}`));
}

// API keys and webhooks (workspace owners and admins)

export async function getWorkIntegrations() {
	return run(async () => {
		const [keys, hooks] = await Promise.all([
			get<{ keys: WorkApiKey[]; canManage: boolean }>("api-keys"),
			get<{ webhooks: WorkWebhook[]; canManage: boolean }>("webhooks"),
		]);
		return { keys: keys.keys, webhooks: hooks.webhooks, canManage: keys.canManage };
	});
}

export async function createWorkApiKey(input: { name: string; access: "read" | "write" }) {
	return run(() => send<{ key: WorkApiKey; token: string }>("POST", "api-keys", input));
}

export async function revokeWorkApiKey(keyId: string) {
	return run(() => send<{ key: WorkApiKey }>("POST", `api-keys/${id(keyId)}/revoke`));
}

export async function createWorkWebhook(input: { url: string }) {
	return run(() => send<{ webhook: WorkWebhook; secret: string }>("POST", "webhooks", input));
}

export async function updateWorkWebhook(webhookId: string, input: { enabled?: boolean }) {
	return run(() => send<{ webhook: WorkWebhook }>("PATCH", `webhooks/${id(webhookId)}`, input));
}

export async function deleteWorkWebhook(webhookId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `webhooks/${id(webhookId)}`));
}

// Documents and initiatives

export async function createWorkDocument(input: { title: string; body?: string; projectId?: string | null }) {
	return run(() => send<{ document: WorkDocument }>("POST", "documents", input));
}

export async function saveWorkDocument(documentId: string, input: { title?: string; body?: string; projectId?: string | null; baseUpdatedAt?: string }) {
	return run(() => send<{ document: WorkDocument }>("PATCH", `documents/${id(documentId)}`, input));
}

export async function deleteWorkDocument(documentId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `documents/${id(documentId)}`));
}

export async function createWorkInitiative(input: { name: string; description?: string; state?: InitiativeState; targetDate?: string | null }) {
	return run(() => send<{ initiative: WorkInitiative }>("POST", "initiatives", input));
}

export async function updateWorkInitiative(initiativeId: string, input: { name?: string; description?: string; state?: InitiativeState; targetDate?: string | null }) {
	return run(() => send<{ initiative: WorkInitiative }>("PATCH", `initiatives/${id(initiativeId)}`, input));
}

export async function deleteWorkInitiative(initiativeId: string) {
	return run(() => send<Record<string, unknown>>("DELETE", `initiatives/${id(initiativeId)}`));
}

// Import

export async function importWorkItems(input: { rows: Array<Record<string, string>>; source: string; projectId?: string | null }) {
	return run(() => send<{ created: number; skipped: number; numbers: number[]; failedAt: number | null }>("POST", "items/import", input));
}

// Reactions

export async function toggleWorkReaction(eventId: string, emoji: ReactionEmoji) {
	return run(() => send<{ eventId: string; reactions: ReactionCount[] }>("POST", `events/${id(eventId)}/reactions`, { emoji }));
}

// Notifications

export async function saveMyWorkSettings(input: { emailNotifications: "off" | "digest" }) {
	return run(() => send<WorkMemberSettingsResponse>("PATCH", "me/settings", input));
}

export async function getWorkNotifications(options: { unread?: boolean; limit?: number; cursor?: string } = {}) {
	const search = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, options.limit ?? 50))) });
	if (options.unread) search.set("unread", "1");
	if (options.cursor) search.set("cursor", options.cursor);
	return run(() => get<{ notifications: WorkNotification[]; unreadCount: number; nextCursor?: string | null }>(`notifications?${search.toString()}`));
}

export async function markWorkNotificationsRead(input: { ids: string[] } | { all: true }) {
	const body = "all" in input ? { all: true } : { ids: input.ids.slice(0, 200) };
	return run(() => send<Record<string, unknown>>("POST", "notifications/read", body));
}

// Reply drafts. Sending only ever happens from a person's confirmed click.

export async function updateReplyDraft(draftId: string, input: { subject?: string; body?: string }) {
	return run(() => send<{ draft: ReplyDraft }>("PATCH", `reply-drafts/${id(draftId)}`, input));
}

export async function discardReplyDraft(draftId: string) {
	return run(() => send<{ draft?: ReplyDraft }>("POST", `reply-drafts/${id(draftId)}/discard`));
}

/**
 * Sends a reviewed draft to the recipient the person confirmed; the API refuses if the request's
 * address has changed since. delivery "email" means Phaseo emailed it; "manual" means work email is
 * off, so web-api only marked it sent and the UI copies the reply and offers a mailto link.
 */
export async function sendReplyDraft(draftId: string, confirmRecipient: string) {
	return run(() => send<ReplyDraftSendResponse>("POST", `reply-drafts/${id(draftId)}/send`, { confirmRecipient }));
}
