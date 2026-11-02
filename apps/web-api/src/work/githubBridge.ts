// The GitHub bridge (POST /api/_web/work/github/:token). The repository's Phaseo workflow (see
// githubWorkflow.ts) posts trimmed issue, comment, pull request and agent run events here; this
// keeps the linked work items in step:
// - issue opened/edited/labeled: upsert the item (source "github") when the repo syncs issues;
// - issue closed: done; reopened: todo;
// - issue comment: a comment event by the GitHub user;
// - pull request mentioning "#N": link it to item N; opened moves it to in review, merged to done;
// - agent_run: upsert the work_agent_runs row (runner github_actions) for the issue's item.
// All text here comes from GitHub and is stored as data only.

import {
	addWorkItemEvent,
	createWorkItem,
	isClosedState,
	normalizeLabels,
	updateWorkItem,
	WORK_ITEM_COLUMNS,
	type DataClient,
	type WorkActor,
} from "./items";
import type { AgentRunStatus, GithubRepoRow, WorkItemRow } from "./types";

export const MAX_GITHUB_BYTES = 256 * 1024;
const MAX_TEXT = 20_000;
const MAX_LINKED_ISSUES = 5;
const MAX_SUMMARY = 4_000;
const BRIDGE_EVENTS = ["issues", "issue_comment", "pull_request", "agent_run"] as const;
type BridgeEventName = (typeof BRIDGE_EVENTS)[number];
const RUN_STATUSES: readonly AgentRunStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];

export type BridgeIssue = { number: number; title: string; body: string; state: string | null; html_url: string | null; user: string | null; labels: string[]; is_pull_request: boolean };
export type BridgeComment = { body: string; user: string | null; html_url: string | null };
export type BridgePullRequest = { number: number; title: string; html_url: string | null; state: string | null; merged: boolean; body: string };
export type BridgeRun = { id: string | null; status: AgentRunStatus; summary: string | null; pr_url: string | null; run_url: string | null; cost_nanos: number | null; model: string | null };

export type BridgePayload = {
	event: BridgeEventName;
	action: string | null;
	repo: string;
	issue: BridgeIssue | null;
	comment: BridgeComment | null;
	pull_request: BridgePullRequest | null;
	run: BridgeRun | null;
};

export type BridgeOutcome = { handled: string; itemIds: string[] };

type RepoLink = Pick<GithubRepoRow, "id" | "workspace_id" | "repo" | "sync_issues">;

function str(value: unknown, max = MAX_TEXT): string | null {
	return typeof value === "string" ? value.slice(0, max) : null;
}

function positiveInt(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 2 ** 31 ? value : null;
}

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function login(value: unknown): string | null {
	if (typeof value === "string") return value.slice(0, 100);
	const user = object(value);
	return user && typeof user.login === "string" ? user.login.slice(0, 100) : null;
}

/** Only https links on github.com are stored as links. */
function githubUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 500) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && (url.hostname === "github.com" || url.hostname.endsWith(".github.com")) ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Any https URL (run links on GitHub Enterprise hosts too). */
function httpsUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 500) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Reads the workflow's payload. Null when it isn't one. */
export function parseBridgePayload(value: unknown): BridgePayload | null {
	const raw = object(value);
	if (!raw) return null;
	const event = raw.event;
	if (typeof event !== "string" || !(BRIDGE_EVENTS as readonly string[]).includes(event)) return null;
	const repo = str(raw.repo, 200);
	if (!repo) return null;

	let issue: BridgeIssue | null = null;
	const rawIssue = object(raw.issue);
	if (rawIssue) {
		const number = positiveInt(rawIssue.number);
		if (number === null) return null;
		issue = {
			number,
			title: str(rawIssue.title, 300)?.trim() ?? "",
			body: str(rawIssue.body) ?? "",
			state: str(rawIssue.state, 20),
			html_url: githubUrl(rawIssue.html_url),
			user: login(rawIssue.user),
			labels: Array.isArray(rawIssue.labels)
				? rawIssue.labels.map((label) => (typeof label === "string" ? label : str(object(label)?.name, 50))).filter((label): label is string => !!label)
				: [],
			is_pull_request: rawIssue.is_pull_request === true || object(rawIssue.pull_request) !== null,
		};
	}

	const rawComment = object(raw.comment);
	const comment: BridgeComment | null = rawComment
		? { body: str(rawComment.body) ?? "", user: login(rawComment.user), html_url: githubUrl(rawComment.html_url) }
		: null;

	let pullRequest: BridgePullRequest | null = null;
	const rawPull = object(raw.pull_request);
	if (rawPull) {
		const number = positiveInt(rawPull.number);
		if (number !== null) {
			pullRequest = {
				number,
				title: str(rawPull.title, 300) ?? "",
				html_url: githubUrl(rawPull.html_url),
				state: str(rawPull.state, 20),
				merged: rawPull.merged === true,
				body: str(rawPull.body) ?? "",
			};
		}
	}

	let run: BridgeRun | null = null;
	const rawRun = object(raw.run);
	if (rawRun) {
		const status = rawRun.status;
		if (typeof status !== "string" || !(RUN_STATUSES as readonly string[]).includes(status)) return null;
		const cost = rawRun.cost_nanos;
		run = {
			id: str(rawRun.id, 100),
			status: status as AgentRunStatus,
			summary: str(rawRun.summary, MAX_SUMMARY)?.trim() || null,
			pr_url: githubUrl(rawRun.pr_url),
			run_url: httpsUrl(rawRun.run_url),
			cost_nanos: typeof cost === "number" && Number.isSafeInteger(cost) && cost >= 0 ? cost : null,
			model: str(rawRun.model, 128)?.trim() || null,
		};
	}

	return { event: event as BridgeEventName, action: str(raw.action, 40), repo, issue, comment, pull_request: pullRequest, run };
}

/**
 * Issue numbers a pull request refers to in this repository: "#12", "Fixes #12", "owner/repo#12"
 * for the same repository. References to other repositories are ignored. Closing keywords first.
 */
export function linkedIssueNumbers(text: string, repo: string): number[] {
	const closing: number[] = [];
	const mentioned: number[] = [];
	const pattern = /(?:\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+)?(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d{1,9})\b/gi;
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0;
		const before = start > 0 ? text[start - 1] : "";
		if (before && /[A-Za-z0-9_&/]/.test(before)) continue; // "abc#1", "&#123;", URLs
		if (match[2] && match[2].toLowerCase() !== repo.toLowerCase()) continue;
		const number = Number(match[3]);
		if (!number) continue;
		(match[1] ? closing : mentioned).push(number);
	}
	return [...new Set([...closing, ...mentioned])].slice(0, MAX_LINKED_ISSUES);
}

/** GitHub label names as work item labels: lowercased, at most 40 characters each and 20 in all. */
export function githubLabels(names: string[]): string[] {
	const labels: string[] = [];
	for (const name of names) {
		const [label] = normalizeLabels([name.trim().slice(0, 40)], 1) ?? [];
		if (label && !labels.includes(label)) labels.push(label);
		if (labels.length >= 20) break;
	}
	return labels;
}

const GITHUB_ACTOR =(name: string | null): WorkActor => ({ kind: "github", name });

async function findIssueItem(client: DataClient, link: RepoLink, number: number): Promise<WorkItemRow | null> {
	const { data, error } = await client.from("work_items")
		.select(WORK_ITEM_COLUMNS)
		.eq("workspace_id", link.workspace_id)
		.eq("github_repo", link.repo)
		.eq("github_issue_number", number)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) throw new Error(`work_items read failed: ${error.message}`);
	return (data as unknown as WorkItemRow | null) ?? null;
}

async function handleIssue(client: DataClient, link: RepoLink, payload: BridgePayload): Promise<BridgeOutcome> {
	const issue = payload.issue;
	if (!issue || issue.is_pull_request) return { handled: "ignored", itemIds: [] };
	const action = payload.action ?? "";
	const actor = GITHUB_ACTOR(issue.user);
	const item = await findIssueItem(client, link, issue.number);
	const labels = githubLabels(issue.labels);

	if (action === "closed" || action === "reopened") {
		if (!item) return { handled: "no_item", itemIds: [] };
		if (action === "closed" && !isClosedState(item.state)) await updateWorkItem(client, item, { state: "done" }, actor);
		if (action === "reopened" && isClosedState(item.state)) await updateWorkItem(client, item, { state: "todo" }, actor);
		return { handled: action, itemIds: [item.id] };
	}

	if (action !== "opened" && action !== "edited" && action !== "labeled") return { handled: "ignored", itemIds: [] };

	if (!item) {
		if (!link.sync_issues || issue.state === "closed") return { handled: "not_synced", itemIds: [] };
		const created = await createWorkItem(client, {
			workspaceId: link.workspace_id,
			title: issue.title || `GitHub issue #${issue.number}`,
			description: issue.body,
			state: "triage",
			source: "github",
			authorKind: "github",
			labels,
			githubRepo: link.repo,
			githubIssueNumber: issue.number,
			githubIssueUrl: issue.html_url,
		});
		return { handled: "created", itemIds: [created.id] };
	}

	// Phaseo's own text wins for items made in Phaseo; issues that started on GitHub follow it.
	const fromGithub = item.source === "github";
	const mergedLabels = githubLabels([...(item.labels ?? []), ...labels]);
	await updateWorkItem(client, item, {
		...(fromGithub && issue.title ? { title: issue.title } : {}),
		...(fromGithub ? { description: issue.body } : {}),
		labels: mergedLabels,
		...(issue.html_url && !item.github_issue_url ? { githubIssueUrl: issue.html_url } : {}),
	}, actor);
	return { handled: "updated", itemIds: [item.id] };
}

async function handleComment(client: DataClient, link: RepoLink, payload: BridgePayload): Promise<BridgeOutcome> {
	const issue = payload.issue;
	const comment = payload.comment;
	if (payload.action !== "created" || !issue || !comment || issue.is_pull_request || !comment.body.trim()) {
		return { handled: "ignored", itemIds: [] };
	}
	const item = await findIssueItem(client, link, issue.number);
	if (!item) return { handled: "no_item", itemIds: [] };
	await addWorkItemEvent(client, {
		workspaceId: link.workspace_id,
		workItemId: item.id,
		kind: "comment",
		authorKind: "github",
		authorName: comment.user,
		body: comment.body,
		data: { url: comment.html_url, issueNumber: issue.number },
	});
	return { handled: "comment", itemIds: [item.id] };
}

async function handlePullRequest(client: DataClient, link: RepoLink, payload: BridgePayload): Promise<BridgeOutcome> {
	const pull = payload.pull_request;
	const action = payload.action ?? "";
	if (!pull || !pull.html_url || !["opened", "edited", "closed"].includes(action)) return { handled: "ignored", itemIds: [] };
	const numbers = linkedIssueNumbers(`${pull.title}\n${pull.body}`, link.repo).filter((number) => number !== pull.number);
	const itemIds: string[] = [];
	for (const number of numbers) {
		const item = await findIssueItem(client, link, number);
		if (!item) continue;
		itemIds.push(item.id);
		const actor = GITHUB_ACTOR(null);
		let current = item;
		if (current.github_pr_url !== pull.html_url) {
			current = await updateWorkItem(client, current, { githubPrUrl: pull.html_url }, actor);
		}
		if (action === "opened" && !isClosedState(current.state) && current.state !== "in_review") {
			await updateWorkItem(client, current, { state: "in_review" }, actor);
		}
		if (action === "closed" && pull.merged) {
			if (!isClosedState(current.state)) current = await updateWorkItem(client, current, { state: "done" }, actor);
			await addWorkItemEvent(client, {
				workspaceId: link.workspace_id,
				workItemId: item.id,
				kind: "github",
				authorKind: "github",
				body: `Pull request #${pull.number} merged`,
				data: { type: "pull_request_merged", url: pull.html_url, number: pull.number },
			});
		}
	}
	return { handled: itemIds.length ? `pull_request_${action}` : "no_item", itemIds };
}

const FINISHED: readonly AgentRunStatus[] = ["succeeded", "failed", "cancelled"];

async function handleAgentRun(client: DataClient, link: RepoLink, payload: BridgePayload): Promise<BridgeOutcome> {
	const run = payload.run;
	const issue = payload.issue;
	if (!run || !issue) return { handled: "ignored", itemIds: [] };
	const item = await findIssueItem(client, link, issue.number);
	if (!item) return { handled: "no_item", itemIds: [] };
	const now = new Date().toISOString();
	const finished = FINISHED.includes(run.status);

	// One row per workflow run: matched by the run link, which the workflow sends every time.
	let existing: { id: string; started_at: string | null; output: Record<string, unknown> } | null = null;
	if (run.run_url) {
		const { data, error } = await client.from("work_agent_runs")
			.select("id,started_at,output")
			.eq("work_item_id", item.id)
			.eq("runner", "github_actions")
			.eq("external_url", run.run_url)
			.limit(1)
			.maybeSingle();
		if (error) throw new Error(`work_agent_runs read failed: ${error.message}`);
		existing = data as typeof existing;
	}
	const output = { ...(existing?.output ?? {}), ...(run.id ? { runId: run.id } : {}), ...(run.pr_url ? { prUrl: run.pr_url } : {}) };
	const row: Record<string, unknown> = {
		status: run.status,
		output,
		...(run.summary ? { summary: run.summary } : {}),
		...(run.model ? { model: run.model } : {}),
		...(run.cost_nanos !== null ? { cost_nanos: run.cost_nanos } : {}),
		...(!existing?.started_at && (run.status === "running" || finished) ? { started_at: now } : {}),
		...(finished ? { finished_at: now } : {}),
	};
	if (existing) {
		const { error } = await client.from("work_agent_runs").update(row).eq("id", existing.id);
		if (error) throw new Error(`work_agent_runs update failed: ${error.message}`);
	} else {
		const { error } = await client.from("work_agent_runs").insert({
			workspace_id: link.workspace_id,
			work_item_id: item.id,
			agent: "engineer",
			runner: "github_actions",
			external_url: run.run_url,
			...row,
		});
		if (error) throw new Error(`work_agent_runs insert failed: ${error.message}`);
	}

	const actor: WorkActor = { kind: "agent", name: "Engineer agent" };
	if (run.status === "running") {
		if (!isClosedState(item.state) && item.state !== "in_progress" && item.state !== "in_review") {
			await updateWorkItem(client, item, { state: "in_progress", assigneeAgent: "engineer" }, actor);
		}
	} else if (finished) {
		// Pull requests opened with the workflow's token don't start workflows, so the run reports
		// its own pull request.
		if (run.status === "succeeded" && run.pr_url && !isClosedState(item.state)) {
			await updateWorkItem(client, item, { githubPrUrl: run.pr_url, state: "in_review" }, actor);
		}
		await addWorkItemEvent(client, {
			workspaceId: link.workspace_id,
			workItemId: item.id,
			kind: "agent_run",
			authorKind: "agent",
			authorName: "Engineer agent",
			body: run.status === "succeeded"
				? run.pr_url ? "The engineer agent opened a pull request." : "The engineer agent finished without changes."
				: "The engineer agent run failed.",
			data: { status: run.status, runUrl: run.run_url, prUrl: run.pr_url, model: run.model },
		});
	}
	return { handled: `agent_run_${run.status}`, itemIds: [item.id] };
}

/** Applies one bridge event for a linked repository. The caller has checked the token and repo. */
export async function handleBridgeEvent(client: DataClient, link: RepoLink, payload: BridgePayload): Promise<BridgeOutcome> {
	switch (payload.event) {
		case "issues":
			return handleIssue(client, link, payload);
		case "issue_comment":
			return handleComment(client, link, payload);
		case "pull_request":
			return handlePullRequest(client, link, payload);
		case "agent_run":
			return handleAgentRun(client, link, payload);
	}
}

/** The linked repository for a bridge token hash, or null. */
export async function loadGithubRepoLink(client: DataClient, tokenHash: string): Promise<RepoLink | null> {
	const { data, error } = await client.from("work_github_repos")
		.select("id,workspace_id,repo,sync_issues")
		.eq("bridge_token_hash", tokenHash)
		.maybeSingle();
	if (error) throw new Error(`work_github_repos read failed: ${error.message}`);
	return (data as RepoLink | null) ?? null;
}
