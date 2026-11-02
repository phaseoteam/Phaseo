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
	WorkAgent,
	WorkItem,
	WorkItemEvent,
	WorkItemState,
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

async function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, body: Record<string, unknown> = {}): Promise<T> {
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
