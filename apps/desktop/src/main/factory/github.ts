import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStages } from "../../shared/factory/stages";
import { githubRepoOf } from "./clones";
import type { CheckRun, CiStatus, CloseReason, IssueComment, Mentionable, PullFile, PullFiles, RepoLabel, Reviewer, MergeMethod, MergeState, ReviewState, ReviewVerdict, TimelineComment, TimelineEntry, TimelineEventIcon, WorkItem } from "../../shared/factory/types";

/** Reads issues and pull requests through the GitHub CLI, so Factory uses the account `gh` is signed in to. */

/** "failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)" → what GitHub said. */
export function ghError(stderr: string): string {
	const text = stderr.trim().split(/\r?\n/).filter((line) => line.trim()).at(-1) ?? "";
	const said = text.match(/GraphQL: (.+?)(?: \(\w+\))?$/)?.[1]?.replace(/^Review /, "");
	return said ? `GitHub said: ${said[0]!.toUpperCase()}${said.slice(1)}` : text;
}

function gh(args: string[], cwd?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("gh", args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
			if (error) reject(new Error(ghError(stderr) || error.message));
			else resolve(stdout);
		});
	});
}

/** Runs a paginated GraphQL query and hands over each node as it arrives, so a big import can show its progress. */
function ghNodes<T>(query: string, variables: Record<string, string>, nodes: string, onNode: (node: T) => void): Promise<void> {
	const args = ["api", "graphql", "--paginate", "-f", `query=${query}`, ...Object.entries(variables).flatMap(([key, value]) => ["-F", `${key}=${value}`]), "--jq", `${nodes}[]`];
	return new Promise((resolve, reject) => {
		const child = spawn("gh", args, { windowsHide: true });
		let buffered = "";
		let stderr = "";
		let failed: Error | null = null;
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffered += chunk;
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim() || failed) continue;
				try {
					onNode(JSON.parse(line) as T);
				} catch (error) {
					failed = error instanceof Error ? error : new Error(String(error));
				}
			}
		});
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => {
			if (failed) reject(failed);
			else if (code !== 0) reject(new Error(stderr.trim() || `gh exited with ${code}`));
			else resolve();
		});
	});
}

interface GqlNode {
	__typename?: "Issue" | "PullRequest";
	number: number;
	title: string;
	body: string | null;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	createdAt: string;
	updatedAt: string;
	author: { login: string; __typename: string; avatarUrl?: string } | null;
	labels: { nodes: { name: string; color?: string }[] } | null;
	assignees?: { nodes: { login: string; avatarUrl?: string }[] };
	isCrossRepository?: boolean;
	maintainerCanModify?: boolean;
	headRepository?: { nameWithOwner: string } | null;
	reviewRequests?: { nodes: { requestedReviewer: { login?: string; name?: string; avatarUrl?: string } | null }[] };
	latestReviews?: { nodes: { state: string; author: { login: string; avatarUrl?: string } | null }[] };
	comments: { totalCount: number };
	isDraft?: boolean;
	headRefName?: string;
	headRefOid?: string;
	additions?: number;
	deletions?: number;
	changedFiles?: number;
	closingIssuesReferences?: { nodes: { number: number; repository: { nameWithOwner: string } }[] };
}

const ISSUE_FIELDS = "number title body url state createdAt updatedAt author{login __typename avatarUrl(size:64)} labels(first:30){nodes{name color}} assignees(first:10){nodes{login avatarUrl(size:64)}} comments{totalCount}";
// closingIssuesReferences covers issues linked in GitHub's Development box as well as "Fixes #12".
const PULL_FIELDS = `${ISSUE_FIELDS} isDraft headRefName headRefOid isCrossRepository maintainerCanModify headRepository{nameWithOwner} reviewRequests(first:10){nodes{requestedReviewer{... on User{login avatarUrl(size:64)} ... on Team{name} ... on Bot{login avatarUrl(size:64)}}}} latestReviews(first:10){nodes{state author{login avatarUrl(size:64)}}} additions deletions changedFiles closingIssuesReferences(first:5){nodes{number repository{nameWithOwner}}}`;
const PAGE = "pageInfo{hasNextPage endCursor}";

function priorityFrom(labels: string[]): WorkItem["priority"] {
	const names = labels.map((label) => label.toLowerCase());
	if (names.some((name) => name.includes("urgent") || name === "p0")) return "urgent";
	if (names.some((name) => name.includes("high") || name === "p1")) return "high";
	if (names.some((name) => name.includes("low") || name === "p3")) return "low";
	return "normal";
}

/** The issue a pull request says it fixes, from "Fixes #12" and the like in its description. */
export function closesIssue(body: string): number | undefined {
	const match = body.match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i);
	return match ? Number(match[1]) : undefined;
}

export function workItem(repo: string, node: GqlNode, kind: WorkItem["kind"]): WorkItem {
	const labels = node.labels?.nodes.map((label) => label.name) ?? [];
	const colours = Object.fromEntries((node.labels?.nodes ?? []).filter((label) => label.color).map((label) => [label.name, label.color!]));
	const body = node.body ?? "";
	const item: WorkItem = {
		id: `${repo}#${node.number}`,
		source: "github",
		repo,
		number: node.number,
		kind,
		state: node.state === "MERGED" ? "merged" : node.state === "CLOSED" ? "closed" : node.isDraft ? "draft" : "open",
		title: node.title,
		body,
		author: { login: node.author?.login ?? "ghost", bot: node.author?.__typename === "Bot" || undefined, avatar: node.author?.avatarUrl || undefined },
		labels,
		labelColors: Object.keys(colours).length ? colours : undefined,
		assignees: node.assignees?.nodes.length ? node.assignees.nodes.map((person) => ({ login: person.login, avatar: person.avatarUrl || undefined })) : undefined,
		url: node.url,
		createdAt: Date.parse(node.createdAt),
		updatedAt: Date.parse(node.updatedAt),
		comments: node.comments?.totalCount ?? 0,
		priority: priorityFrom(labels),
		stages: emptyStages(),
	};
	if (kind === "pull") {
		item.branch = node.headRefName;
		item.head = node.headRefOid;
		// From someone's fork: its branch lives there, not in this repository.
		if (node.isCrossRepository) item.fork = { repo: node.headRepository?.nameWithOwner ?? "a deleted fork", canPush: Boolean(node.maintainerCanModify && node.headRepository) };
		const closing = node.closingIssuesReferences?.nodes.find((issue) => issue.repository.nameWithOwner.toLowerCase() === repo.toLowerCase());
		item.linked = closesIssue(body) ?? closing?.number;
		item.diff = { files: node.changedFiles ?? 0, additions: node.additions ?? 0, deletions: node.deletions ?? 0 };
		// Who's been asked to review, and how those who already did left it.
		const reviewers = new Map<string, Reviewer>();
		for (const request of node.reviewRequests?.nodes ?? []) {
			const who = request.requestedReviewer;
			const login = who?.login ?? who?.name;
			if (login) reviewers.set(login, { login, avatar: who?.avatarUrl || undefined, team: !who?.login || undefined, state: "requested" });
		}
		for (const review of node.latestReviews?.nodes ?? []) {
			const login = review.author?.login;
			if (!login || reviewers.has(login)) continue;
			const state = ({ APPROVED: "approved", CHANGES_REQUESTED: "changes", DISMISSED: "dismissed" } as Record<string, Reviewer["state"]>)[review.state] ?? "commented";
			reviewers.set(login, { login, avatar: review.author?.avatarUrl || undefined, state });
		}
		if (reviewers.size) item.reviewers = [...reviewers.values()];
	}
	return item;
}

/** Points each issue at the pull request that says it fixes it, within the same repository. */
export function linkWork(items: WorkItem[]): WorkItem[] {
	const fixes = new Map<string, number>();
	for (const pull of items) if (pull.kind === "pull" && pull.linked) fixes.set(`${pull.repo}#${pull.linked}`, pull.number);
	return items.map((item) => (item.kind === "issue" && !item.linked && fixes.has(item.id) ? { ...item, linked: fixes.get(item.id) } : item));
}

function ownerAndName(repo: string): { owner: string; name: string } {
	const [owner, name] = repo.split("/");
	if (!owner || !name) throw new Error(`"${repo}" isn't a repository: use owner/name`);
	return { owner, name };
}

/** How many issues and pull requests are open, to show how far an import has got. */
export async function openCounts(repo: string): Promise<{ issues: number; pulls: number }> {
	const { owner, name } = ownerAndName(repo);
	const out = await gh(["api", "graphql", "-f", "query=query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issues(states:OPEN){totalCount} pullRequests(states:OPEN){totalCount}}}", "-F", `owner=${owner}`, "-F", `name=${name}`, "--jq", ".data.repository"]);
	const counts = JSON.parse(out) as { issues: { totalCount: number }; pullRequests: { totalCount: number } };
	return { issues: counts.issues.totalCount, pulls: counts.pullRequests.totalCount };
}

/**
 * Open items a request reads. 50 takes about as long per item as 100 does, and lets a small
 * repository's progress move before the whole list has arrived.
 */
const IMPORT_PAGE = 50;

/** Every open issue and pull request. Both lists are read at once, and progress is reported as each page lands. */
export async function importOpen(repo: string, onProgress: (done: number) => void): Promise<WorkItem[]> {
	const { owner, name } = ownerAndName(repo);
	const items: WorkItem[] = [];
	let reported = 0;
	const add = (kind: WorkItem["kind"]) => (node: GqlNode) => {
		items.push(workItem(repo, node, kind));
		// A page's nodes arrive together, so reporting once they've all been taken in is enough.
		if (items.length - reported === 1) queueMicrotask(() => onProgress((reported = items.length)));
	};
	const list = (field: string, fields: string) => `query($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){${field}(first:${IMPORT_PAGE},after:$endCursor,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{${fields}} ${PAGE}}}}`;
	await Promise.all([
		ghNodes(list("issues", ISSUE_FIELDS), { owner, name }, ".data.repository.issues.nodes", add("issue")),
		ghNodes(list("pullRequests", PULL_FIELDS), { owner, name }, ".data.repository.pullRequests.nodes", add("pull")),
	]);
	onProgress(items.length);
	return linkWork(items);
}

/** GitHub search stops at 1,000 results. A longer gap than that is read again in full. */
export const SEARCH_LIMIT = 1_000;

/** How many of the most recently updated pull requests each check reads, whatever their place in GitHub's lagging order. */
const RECENT_PULLS = 100;

/**
 * Issues and pull requests updated since a time, open or not, so closed and merged ones can leave the list.
 * GitHub's search, and its order by update time, both lag behind a change by minutes: a comment can be
 * missing from both well after it was made. So three reads are joined: issues filtered by update time
 * (which doesn't lag), the latest pull requests kept by their own update time rather than their place in
 * the order, and search for anything older the other two can't reach.
 */
export async function changesSince(repo: string, since: number): Promise<WorkItem[]> {
	const { owner, name } = ownerAndName(repo);
	const iso = new Date(since).toISOString().replace(/\.\d+Z$/, "Z");
	const found = new Map<string, WorkItem>();
	const take = (item: WorkItem) => {
		const known = found.get(item.id);
		if (!known || item.updatedAt >= known.updatedAt) found.set(item.id, item);
	};
	const search = `query($q:String!,$endCursor:String){search(query:$q,type:ISSUE,first:100,after:$endCursor){nodes{__typename ... on Issue{${ISSUE_FIELDS}} ... on PullRequest{${PULL_FIELDS}}} ${PAGE}}}`;
	const issues = `query($owner:String!,$name:String!,$since:DateTime!,$endCursor:String){repository(owner:$owner,name:$name){issues(first:100,after:$endCursor,filterBy:{since:$since},orderBy:{field:UPDATED_AT,direction:DESC}){nodes{${ISSUE_FIELDS}} ${PAGE}}}}`;
	const pulls = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(first:${RECENT_PULLS},orderBy:{field:UPDATED_AT,direction:DESC}){nodes{${PULL_FIELDS}}}}}`;
	await Promise.all([
		ghNodes<GqlNode>(search, { q: `repo:${repo} updated:>=${iso}` }, ".data.search.nodes", (node) => {
			if (node.__typename === "Issue" || node.__typename === "PullRequest") take(workItem(repo, node, node.__typename === "Issue" ? "issue" : "pull"));
		}),
		ghNodes<GqlNode>(issues, { owner, name, since: iso }, ".data.repository.issues.nodes", (node) => take(workItem(repo, node, "issue"))),
		gh(["api", "graphql", "-f", `query=${pulls}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "--jq", ".data.repository.pullRequests.nodes"], OUTSIDE).then((out) => {
			for (const node of JSON.parse(out || "[]") as GqlNode[]) {
				const item = workItem(repo, node, "pull");
				if (item.updatedAt >= since) take(item);
			}
		}),
	]);
	return [...found.values()];
}

/** One issue or pull request as GitHub has it now. Search lags behind a change by a while; this doesn't. */
export async function readItem(repo: string, number: number): Promise<WorkItem | null> {
	const { owner, name } = ownerAndName(repo);
	const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issueOrPullRequest(number:$number){__typename ... on Issue{${ISSUE_FIELDS}} ... on PullRequest{${PULL_FIELDS}}}}}`;
	const out = await gh(["api", "graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`, "--jq", ".data.repository.issueOrPullRequest"], OUTSIDE);
	const node = out.trim() ? (JSON.parse(out) as GqlNode | null) : null;
	return node?.__typename === "Issue" || node?.__typename === "PullRequest" ? workItem(repo, node, node.__typename === "Issue" ? "issue" : "pull") : null;
}

/** People who can be @mentioned in a repository, matching what's been typed: the list GitHub's own comment box offers. */
export async function mentionable(repo: string, query: string): Promise<Mentionable[]> {
	const { owner, name } = ownerAndName(repo);
	const gql = "query($owner:String!,$name:String!,$q:String){repository(owner:$owner,name:$name){mentionableUsers(first:8,query:$q){nodes{login name avatarUrl(size:64)}}}}";
	const out = await gh(["api", "graphql", "-f", `query=${gql}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `q=${query}`, "--jq", ".data.repository.mentionableUsers.nodes"], OUTSIDE);
	return (JSON.parse(out || "[]") as { login: string; name: string | null; avatarUrl?: string }[]).map((user) => ({ login: user.login, name: user.name || undefined, avatar: user.avatarUrl || undefined }));
}

const ACTOR = "actor{login avatarUrl(size:64)}";
const WHO = "author{login avatarUrl(size:64)}";
const COMMENT_FIELDS = `id databaseId ${WHO} body createdAt url viewerCanUpdate viewerCanDelete`;
const SHARED_EVENTS = `
	... on IssueComment{${COMMENT_FIELDS}}
	... on ClosedEvent{${ACTOR} createdAt stateReason closer{__typename ... on PullRequest{number} ... on Commit{abbreviatedOid}}}
	... on ReopenedEvent{${ACTOR} createdAt}
	... on LabeledEvent{${ACTOR} createdAt label{name}}
	... on UnlabeledEvent{${ACTOR} createdAt label{name}}
	... on AssignedEvent{${ACTOR} createdAt assignee{... on User{login} ... on Bot{login}}}
	... on UnassignedEvent{${ACTOR} createdAt assignee{... on User{login} ... on Bot{login}}}
	... on RenamedTitleEvent{${ACTOR} createdAt previousTitle currentTitle}
	... on CrossReferencedEvent{${ACTOR} createdAt willCloseTarget source{__typename ... on Issue{number title repository{nameWithOwner}} ... on PullRequest{number title repository{nameWithOwner}}}}`;
const PULL_EVENTS = `
	... on PullRequestReview{id databaseId ${WHO} body state submittedAt createdAt url comments(first:30){nodes{${COMMENT_FIELDS} path line originalLine}}}
	... on MergedEvent{${ACTOR} createdAt mergeRefName commit{abbreviatedOid}}
	... on ReviewRequestedEvent{${ACTOR} createdAt requestedReviewer{... on User{login} ... on Team{name} ... on Bot{login}}}
	... on ReadyForReviewEvent{${ACTOR} createdAt}
	... on ConvertToDraftEvent{${ACTOR} createdAt}
	... on HeadRefForcePushedEvent{${ACTOR} createdAt}
	... on PullRequestCommit{commit{abbreviatedOid messageHeadline committedDate author{name user{login avatarUrl(size:64)}}}}`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Everything that happened on an issue or pull request, oldest first: comments, reviews, commits and changes. */
export async function itemTimeline(repo: string, kind: WorkItem["kind"], number: number): Promise<TimelineEntry[]> {
	const { owner, name } = ownerAndName(repo);
	const field = kind === "pull" ? "pullRequest" : "issue";
	const query = `query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){${field}(number:$number){timelineItems(first:100,after:$endCursor){nodes{__typename ${SHARED_EVENTS} ${kind === "pull" ? PULL_EVENTS : ""}} ${PAGE}}}}}`;
	const nodes: Json[] = [];
	await ghNodes<Json>(query, { owner, name, number: String(number) }, `.data.repository.${field}.timelineItems.nodes`, (node) => nodes.push(node));
	return timelineFrom(repo, nodes);
}

/** GitHub's timeline nodes as entries Factory shows. Kinds it doesn't show are left out. */
export function timelineFrom(repo: string, nodes: Json[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	const actor = (node: Json) => ({ actor: node.actor?.login as string | undefined, avatar: (node.actor?.avatarUrl as string | undefined) || undefined });
	const ref = (source: Json | undefined) => source && (source.__typename === "Issue" || source.__typename === "PullRequest")
		? { number: source.number as number, title: source.title as string, repo: source.repository?.nameWithOwner as string, pull: source.__typename === "PullRequest" }
		: undefined;
	const comment = (node: Json): TimelineComment => ({
		id: node.id, databaseId: node.databaseId, author: node.author?.login ?? "ghost", avatar: node.author?.avatarUrl || undefined, body: node.body ?? "", at: Date.parse(node.createdAt), url: node.url,
		factory: FACTORY_SIGNATURE.test((node.body ?? "").trim()) || undefined, canEdit: node.viewerCanUpdate || undefined, canDelete: node.viewerCanDelete || undefined,
	});
	for (const node of nodes) {
		const at = Date.parse(node.createdAt ?? node.submittedAt ?? node.commit?.committedDate ?? "");
		const event = (icon: TimelineEventIcon, text: string, extra: Partial<Extract<TimelineEntry, { kind: "event" }>> = {}) => entries.push({ kind: "event", icon, text, at, ...actor(node), ...extra });
		switch (node.__typename) {
			case "IssueComment":
				entries.push({ kind: "comment", ...comment(node) });
				break;
			case "PullRequestReview": {
				// A review still being written is only the author's, and shows on GitHub once submitted.
				if (node.state === "PENDING") break;
				const state = ({ APPROVED: "approved", CHANGES_REQUESTED: "changes", DISMISSED: "dismissed" } as Record<string, ReviewState>)[node.state] ?? "commented";
				const inline = ((node.comments?.nodes ?? []) as Json[]).map((entry) => ({ ...comment(entry), path: entry.path as string, line: (entry.line ?? entry.originalLine ?? undefined) as number | undefined }));
				// A review that's only a reply in a thread says nothing of its own here; the thread is in Files changed.
				if (state === "commented" && !node.body?.trim() && !inline.length) break;
				entries.push({ kind: "review", ...comment(node), at: Date.parse(node.submittedAt ?? node.createdAt), state, comments: inline });
				break;
			}
			case "ClosedEvent": {
				const by = node.closer?.__typename === "PullRequest" ? ` in #${node.closer.number}` : node.closer?.__typename === "Commit" ? ` in ${node.closer.abbreviatedOid}` : "";
				const reason = node.stateReason === "NOT_PLANNED" ? " as not planned" : node.stateReason === "DUPLICATE" ? " as a duplicate" : node.stateReason === "COMPLETED" ? " as completed" : "";
				event(node.stateReason === "NOT_PLANNED" ? "skipped" : "closed", `closed this${reason}${by}`);
				break;
			}
			case "ReopenedEvent":
				event("reopened", "reopened this");
				break;
			case "MergedEvent":
				event("merged", `merged commit ${node.commit?.abbreviatedOid ?? ""} into ${node.mergeRefName ?? "the base branch"}`.replace("  ", " "));
				break;
			case "LabeledEvent":
				event("label", `added the ${node.label?.name} label`, { label: node.label?.name });
				break;
			case "UnlabeledEvent":
				event("label", `removed the ${node.label?.name} label`, { label: node.label?.name });
				break;
			case "AssignedEvent":
				event("person", node.assignee?.login === node.actor?.login ? "self-assigned this" : `assigned ${node.assignee?.login ?? "someone"}`);
				break;
			case "UnassignedEvent":
				event("person", `unassigned ${node.assignee?.login ?? "someone"}`);
				break;
			case "RenamedTitleEvent":
				event("edit", `changed the title from "${node.previousTitle}" to "${node.currentTitle}"`);
				break;
			case "CrossReferencedEvent": {
				const source = ref(node.source);
				if (!source) break;
				const here = source.repo === repo ? "" : source.repo;
				event("reference", node.willCloseTarget ? "linked a pull request that will close this" : `mentioned this in ${source.pull ? "a pull request" : "an issue"}`, { ref: { ...source, repo: here || repo } });
				break;
			}
			case "ReviewRequestedEvent":
				event("review", `requested a review from ${node.requestedReviewer?.login ?? node.requestedReviewer?.name ?? "someone"}`);
				break;
			case "ReadyForReviewEvent":
				event("ready", "marked this pull request as ready for review");
				break;
			case "ConvertToDraftEvent":
				event("draft", "converted this to a draft");
				break;
			case "HeadRefForcePushedEvent":
				event("push", "force-pushed the branch");
				break;
			case "PullRequestCommit": {
				const author = node.commit?.author;
				entries.push({ kind: "event", icon: "commit", at, text: node.commit?.messageHeadline ?? "", actor: author?.user?.login ?? author?.name, avatar: author?.user?.avatarUrl || undefined, commit: node.commit?.abbreviatedOid });
				break;
			}
		}
	}
	return entries.filter((entry) => Number.isFinite(entry.at));
}

/** Factory's own comments end with a "… Phaseo Factory" signature, whoever's account posted them. */
export const FACTORY_SIGNATURE = /<sub>[^<]*Phaseo Factory[^<]*<\/sub>\s*$/;

/** Comments on an issue made after a moment, oldest first, without Factory's own. */
export async function commentsSince(repo: string, number: number, since: number): Promise<IssueComment[]> {
	const out = await gh(["api", `repos/${repo}/issues/${number}/comments?since=${new Date(since).toISOString()}&per_page=100`, "--jq", ".[] | {author: .user.login, body: .body, at: .created_at}"]);
	return out.split("\n").filter(Boolean)
		.map((line) => JSON.parse(line) as { author: string; body: string; at: string })
		.map((entry) => ({ author: entry.author, body: entry.body ?? "", at: Date.parse(entry.at) }))
		.filter((entry) => entry.at > since && !FACTORY_SIGNATURE.test(entry.body.trim()));
}

/** Every comment on an issue or pull request, oldest first. Factory's own are marked by their signature. */
export async function allComments(repo: string, number: number): Promise<IssueComment[]> {
	const out = await gh(["api", "--paginate", `repos/${repo}/issues/${number}/comments?per_page=100`, "--jq", ".[] | {author: .user.login, body: .body, at: .created_at, url: .html_url, avatar: .user.avatar_url}"]);
	return out.split("\n").filter(Boolean)
		.map((line) => JSON.parse(line) as { author: string; body: string | null; at: string; url: string; avatar?: string })
		.map((entry) => ({ author: entry.author, body: entry.body ?? "", at: Date.parse(entry.at), url: entry.url, avatar: entry.avatar || undefined, factory: FACTORY_SIGNATURE.test((entry.body ?? "").trim()) || undefined }));
}

/** Who gh is signed in as, and their photo. */
export async function githubLogin(): Promise<{ login: string; avatar?: string } | null> {
	try {
		const user = JSON.parse(await gh(["api", "user", "--jq", "{login: .login, avatar: .avatar_url}"], OUTSIDE)) as { login?: string; avatar?: string };
		return user.login ? { login: user.login, avatar: user.avatar || undefined } : null;
	} catch {
		return null;
	}
}

/** The installed GitHub CLI's version, such as "2.99.0", or null when it can't be run. */
export async function ghVersion(): Promise<string | null> {
	try {
		return (await gh(["--version"])).match(/gh version (\d+\.\d+\.\d+)/)?.[1] ?? null;
	} catch {
		return null;
	}
}

/**
 * gh 2.99 uploads images and videos the way the web page does: each becomes a user-attachments link,
 * and a Markdown reference to the same local path is rewritten to it. Up to 50 files a command.
 */
function attachArgs(files: string[] = []): string[] {
	return files.slice(0, MAX_ATTACH).flatMap((file) => ["--attach", file]);
}

export const MAX_ATTACH = 50;

/** Long Markdown goes through a file, so it never meets a command-line length limit. */
async function withBody<T>(body: string, use: (file: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "phaseo-factory-"));
	const file = path.join(dir, "body.md");
	try {
		await writeFile(file, body, "utf8");
		return await use(file);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Opens an issue and returns its number. */
export async function createIssue(input: { repo: string; title: string; body: string; labels: string[]; attach?: string[] }): Promise<number> {
	const labels = input.labels.flatMap((label) => ["--label", label]);
	const url = (await withBody(input.body, (file) => gh(["issue", "create", "--repo", input.repo, "--title", input.title, "--body-file", file, ...labels, ...attachArgs(input.attach)]))).trim().split("\n").at(-1) ?? "";
	const number = Number(url.match(/\/issues\/(\d+)/)?.[1]);
	if (!number) throw new Error(`GitHub didn't return an issue: ${url}`);
	return number;
}

/** Opens a draft pull request from a branch that's already pushed, and returns its number. */
export async function createPullRequest(input: { repo: string; cwd: string; branch: string; title: string; body: string; attach?: string[] }): Promise<{ number: number; url: string }> {
	const url = (await withBody(input.body, (file) => gh(["pr", "create", "--repo", input.repo, "--draft", "--head", input.branch, "--title", input.title, "--body-file", file, ...attachArgs(input.attach)], input.cwd))).trim().split("\n").at(-1) ?? "";
	const number = Number(url.match(/\/pull\/(\d+)/)?.[1]);
	if (!number) throw new Error(`GitHub didn't return a pull request: ${url}`);
	return { number, url };
}

export async function comment(repo: string, kind: WorkItem["kind"], number: number, body: string, attach?: string[]): Promise<void> {
	await withBody(body, (file) => gh([kind === "pull" ? "pr" : "issue", "comment", String(number), "--repo", repo, "--body-file", file, ...attachArgs(attach)]));
}

/** The token gh is signed in with, kept for this session: only ever sent to GitHub, for images in private repositories. */
let token: Promise<string | null> | null = null;
export function githubToken(): Promise<string | null> {
	token ??= gh(["auth", "token"], OUTSIDE).then((out) => out.trim() || null).catch(() => {
		token = null;
		return null;
	});
	return token;
}


/** Commands that change a pull request run outside any checkout, so gh never switches a local branch. */
const OUTSIDE = os.tmpdir();

export async function markReady(repo: string, number: number): Promise<void> {
	await gh(["pr", "ready", String(number), "--repo", repo], OUTSIDE);
}

/** Back to draft: GitHub stops asking for reviews until it's ready again. */
export async function markDraft(repo: string, number: number): Promise<void> {
	await gh(["pr", "ready", String(number), "--repo", repo, "--undo"], OUTSIDE);
}

/** Closes an issue (as completed or not planned) or a pull request, after the comment that says why, if any. */
export async function closeItem(repo: string, kind: WorkItem["kind"], number: number, reason?: CloseReason, body?: string): Promise<void> {
	if (body?.trim()) await comment(repo, kind, number, body);
	await gh([kind === "pull" ? "pr" : "issue", "close", String(number), "--repo", repo, ...(kind === "issue" && reason ? ["--reason", reason] : [])], OUTSIDE);
}

export async function reopenItem(repo: string, kind: WorkItem["kind"], number: number, body?: string): Promise<void> {
	await gh([kind === "pull" ? "pr" : "issue", "reopen", String(number), "--repo", repo], OUTSIDE);
	if (body?.trim()) await comment(repo, kind, number, body);
}

export async function mergePull(repo: string, number: number, method: MergeMethod): Promise<void> {
	await gh(["pr", "merge", String(number), "--repo", repo, `--${method}`], OUTSIDE);
}

/** Approves, asks for changes, or leaves a review comment. Asking for changes needs a body. */
export async function reviewPull(repo: string, number: number, verdict: ReviewVerdict, body: string): Promise<void> {
	if (verdict !== "approve" && !body.trim()) throw new Error(verdict === "request-changes" ? "Say what needs to change" : "Write the review first");
	await withBody(body, (file) => gh(["pr", "review", String(number), "--repo", repo, `--${verdict}`, ...(body.trim() ? ["--body-file", file] : [])], OUTSIDE));
}

/** Edits a comment: one on the conversation, or `inline`, one on a line of a pull request's code. */
export async function editComment(repo: string, commentId: number, inline: boolean, body: string): Promise<void> {
	await withBody(body, (file) => gh(["api", "-X", "PATCH", `repos/${repo}/${inline ? "pulls" : "issues"}/comments/${commentId}`, "-F", `body=@${file}`, "--silent"], OUTSIDE));
}

export async function deleteComment(repo: string, commentId: number, inline: boolean): Promise<void> {
	await gh(["api", "-X", "DELETE", `repos/${repo}/${inline ? "pulls" : "issues"}/comments/${commentId}`, "--silent"], OUTSIDE);
}

export async function editItem(repo: string, kind: WorkItem["kind"], number: number, change: { title?: string; body?: string }): Promise<void> {
	const verb = kind === "pull" ? "pr" : "issue";
	if (change.body !== undefined) await withBody(change.body, (file) => gh([verb, "edit", String(number), "--repo", repo, "--body-file", file, ...(change.title ? ["--title", change.title] : [])], OUTSIDE));
	else if (change.title) await gh([verb, "edit", String(number), "--repo", repo, "--title", change.title], OUTSIDE);
}

/** Adds and removes labels, assignees or requested reviewers in one go. */
export async function editPeopleOrLabels(repo: string, kind: WorkItem["kind"], number: number, what: "label" | "assignee" | "reviewer", add: string[], remove: string[]): Promise<void> {
	if (!add.length && !remove.length) return;
	if (what === "reviewer" && kind !== "pull") throw new Error("Only pull requests have reviewers");
	await gh([kind === "pull" ? "pr" : "issue", "edit", String(number), "--repo", repo, ...add.flatMap((name) => [`--add-${what}`, name]), ...remove.flatMap((name) => [`--remove-${what}`, name])], OUTSIDE);
}

/** The labels a repository has, to pick from. */
export async function repoLabels(repo: string): Promise<RepoLabel[]> {
	const out = await gh(["label", "list", "--repo", repo, "--limit", "300", "--json", "name,color,description"], OUTSIDE);
	return (JSON.parse(out || "[]") as { name: string; color: string; description: string }[]).map((label) => ({ name: label.name, color: label.color, description: label.description || undefined }));
}

/** People who can be assigned issues in a repository, or asked to review, matching what's been typed. */
export async function assignable(repo: string, query: string): Promise<Mentionable[]> {
	const { owner, name } = ownerAndName(repo);
	const gql = "query($owner:String!,$name:String!,$q:String){repository(owner:$owner,name:$name){assignableUsers(first:10,query:$q){nodes{login name avatarUrl(size:64)}}}}";
	const out = await gh(["api", "graphql", "-f", `query=${gql}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `q=${query}`, "--jq", ".data.repository.assignableUsers.nodes"], OUTSIDE);
	return (JSON.parse(out || "[]") as { login: string; name: string | null; avatarUrl?: string }[]).map((user) => ({ login: user.login, name: user.name || undefined, avatar: user.avatarUrl || undefined }));
}

/** Brings the base branch into a pull request's branch: a merge commit, or a rebase. GitHub refuses when they conflict. */
export async function updateBranch(repo: string, number: number, rebase: boolean): Promise<void> {
	await gh(["pr", "update-branch", String(number), "--repo", repo, ...(rebase ? ["--rebase"] : [])], OUTSIDE);
}

/** Runs the failed jobs of each GitHub Actions run behind these check links again. Checks from other services can't be. */
export async function rerunFailed(repo: string, links: (string | undefined)[]): Promise<number> {
	const runs = [...new Set(links.map((link) => link?.match(/\/actions\/runs\/(\d+)/)?.[1]).filter((id): id is string => !!id))];
	if (!runs.length) throw new Error("None of the failed checks are GitHub Actions runs, so they can't be re-run from here");
	await Promise.all(runs.map((id) => gh(["run", "rerun", id, "--failed", "--repo", repo], OUTSIDE)));
	return runs.length;
}

/** Every check on a pull request, not just the failed ones. */
export async function allChecks(repo: string, number: number): Promise<CheckRun[]> {
	return new Promise((resolve, reject) => {
		execFile("gh", ["pr", "checks", String(number), "--repo", repo, "--json", "name,bucket,link,workflow,description,startedAt,completedAt"], { cwd: OUTSIDE, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (/no checks reported/i.test(stderr)) return resolve([]);
			try {
				const checks = JSON.parse(stdout) as { name: string; bucket: CheckRun["state"] | "skipping" | "cancel"; link?: string; workflow?: string; description?: string; startedAt?: string; completedAt?: string }[];
				resolve(checks.map((check) => ({
					name: check.name, workflow: check.workflow || undefined, description: check.description || undefined, link: check.link || undefined,
					state: check.bucket === "skipping" ? "skipped" : check.bucket === "cancel" ? "cancelled" : check.bucket,
					seconds: check.startedAt && check.completedAt && !check.completedAt.startsWith("0001") ? Math.max(0, Math.round((Date.parse(check.completedAt) - Date.parse(check.startedAt)) / 1000)) : undefined,
				})));
			} catch {
				reject(new Error(ghError(stderr) || error?.message || "gh pr checks gave nothing back"));
			}
		});
	});
}

/** A pull request's changed files with their diffs, the review threads on them, and the commit they're on. */
export async function pullFiles(repo: string, number: number): Promise<PullFiles> {
	const { owner, name } = ownerAndName(repo);
	const threadsQuery = `query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:50,after:$endCursor){nodes{id isResolved isOutdated path line originalLine startLine diffSide viewerCanResolve viewerCanUnresolve comments(first:50){nodes{${COMMENT_FIELDS}}}} ${PAGE}}}}}`;
	const threads: Json[] = [];
	const [files, head] = await Promise.all([
		gh(["api", "--paginate", `repos/${repo}/pulls/${number}/files?per_page=100`, "--jq", ".[] | {path: .filename, previous: .previous_filename, status, additions, deletions, patch}"], OUTSIDE)
			.then((out) => out.split("\n").filter(Boolean).map((line) => JSON.parse(line) as PullFile)),
		gh(["pr", "view", String(number), "--repo", repo, "--json", "headRefOid", "--jq", ".headRefOid"], OUTSIDE).then((out) => out.trim()),
		ghNodes<Json>(threadsQuery, { owner, name, number: String(number) }, ".data.repository.pullRequest.reviewThreads.nodes", (node) => threads.push(node)),
	]);
	return {
		head,
		files: files.map((file) => ({ ...file, previous: file.previous || undefined, patch: file.patch || undefined })),
		threads: threads.map((thread) => ({
			id: thread.id, path: thread.path, line: thread.line ?? undefined, originalLine: thread.originalLine ?? undefined, side: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT",
			resolved: !!thread.isResolved, outdated: !!thread.isOutdated, canResolve: thread.isResolved ? !!thread.viewerCanUnresolve : !!thread.viewerCanResolve,
			comments: ((thread.comments?.nodes ?? []) as Json[]).map((entry) => ({
				id: entry.id, databaseId: entry.databaseId, author: entry.author?.login ?? "ghost", avatar: entry.author?.avatarUrl || undefined, body: entry.body ?? "", at: Date.parse(entry.createdAt), url: entry.url,
				factory: FACTORY_SIGNATURE.test((entry.body ?? "").trim()) || undefined, canEdit: entry.viewerCanUpdate || undefined, canDelete: entry.viewerCanDelete || undefined,
			})),
		})),
	};
}

/** A comment on one line of a pull request's code, on the commit given. */
export async function lineComment(repo: string, number: number, input: { commit: string; path: string; line: number; side: "LEFT" | "RIGHT"; body: string }): Promise<void> {
	await withBody(input.body, (file) => gh(["api", "-X", "POST", `repos/${repo}/pulls/${number}/comments`, "-F", `body=@${file}`, "-f", `commit_id=${input.commit}`, "-f", `path=${input.path}`, "-F", `line=${input.line}`, "-f", `side=${input.side}`, "--silent"], OUTSIDE));
}

export async function replyToThread(repo: string, number: number, commentId: number, body: string): Promise<void> {
	await withBody(body, (file) => gh(["api", "-X", "POST", `repos/${repo}/pulls/${number}/comments/${commentId}/replies`, "-F", `body=@${file}`, "--silent"], OUTSIDE));
}

export async function resolveThread(threadId: string, resolved: boolean): Promise<void> {
	const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
	await gh(["api", "graphql", "-f", `query=mutation($id:ID!){${mutation}(input:{threadId:$id}){thread{id}}}`, "-f", `id=${threadId}`, "--silent"], OUTSIDE);
}

const METHODS: Record<string, MergeMethod> = { MERGE: "merge", SQUASH: "squash", REBASE: "rebase" };

/** Whether a pull request can be merged now, and how the repository lets it be merged. */
export async function mergeState(repo: string, number: number): Promise<MergeState> {
	const [pull, settings] = await Promise.all([
		gh(["pr", "view", String(number), "--repo", repo, "--json", "mergeable,mergeStateStatus,reviewDecision,isDraft,baseRefName"], OUTSIDE).then((out) => JSON.parse(out) as { mergeable: string; mergeStateStatus: string; reviewDecision: string; isDraft: boolean; baseRefName?: string }),
		gh(["repo", "view", repo, "--json", "squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,viewerDefaultMergeMethod,viewerPermission,deleteBranchOnMerge"], OUTSIDE).then((out) => JSON.parse(out) as { squashMergeAllowed: boolean; mergeCommitAllowed: boolean; rebaseMergeAllowed: boolean; viewerDefaultMergeMethod: string; viewerPermission: string; deleteBranchOnMerge: boolean }),
	]);
	return mergeStateFrom(pull, settings);
}

export function mergeStateFrom(
	pull: { mergeable: string; mergeStateStatus: string; reviewDecision: string; isDraft: boolean; baseRefName?: string },
	settings: { squashMergeAllowed: boolean; mergeCommitAllowed: boolean; rebaseMergeAllowed: boolean; viewerDefaultMergeMethod: string; viewerPermission: string; deleteBranchOnMerge: boolean },
): MergeState {
	const methods = ([["squash", settings.squashMergeAllowed], ["merge", settings.mergeCommitAllowed], ["rebase", settings.rebaseMergeAllowed]] as const).filter(([, allowed]) => allowed).map(([method]) => method);
	const preferred = METHODS[settings.viewerDefaultMergeMethod];
	const canWrite = ["ADMIN", "MAINTAIN", "WRITE"].includes(settings.viewerPermission);
	// What stops a merge now, in the order someone would deal with it.
	const blocker = !canWrite ? "You can't merge in this repository"
		: pull.isDraft ? "It's a draft: mark it ready first"
		: pull.mergeable === "CONFLICTING" ? "It has conflicts with the base branch"
		: pull.reviewDecision === "CHANGES_REQUESTED" ? "A reviewer asked for changes"
		: pull.reviewDecision === "REVIEW_REQUIRED" ? "It needs an approving review"
		: pull.mergeStateStatus === "BLOCKED" ? "The branch rules block it, for example a required check"
		: pull.mergeStateStatus === "BEHIND" ? "It's behind the base branch, which the rules don't allow"
		: !methods.length ? "The repository allows no merge method"
		: undefined;
	return {
		methods,
		preferred: preferred && methods.includes(preferred) ? preferred : methods[0] ?? "merge",
		blocker,
		checking: pull.mergeable === "UNKNOWN",
		unstable: pull.mergeStateStatus === "UNSTABLE",
		deletesBranch: settings.deleteBranchOnMerge,
		base: pull.baseRefName || "main",
		conflicts: pull.mergeable === "CONFLICTING",
		behind: pull.mergeStateStatus === "BEHIND",
	};
}

/** Comments "Duplicate of #N", which GitHub shows as a duplicate link, then closes the issue as not planned. */
export async function closeAsDuplicate(repo: string, number: number, original: number): Promise<void> {
	await comment(repo, "issue", number, `Duplicate of #${original}\n\n<sub>Closed by Phaseo Factory.</sub>`);
	await gh(["issue", "close", String(number), "--repo", repo, "--reason", "not planned"]);
}

interface CheckEntry {
	name: string;
	bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
	link?: string;
}

/** Sums up a pull request's checks. Pending wins over failed: a check still running may yet pass the rest. */
export function ciFrom(checks: CheckEntry[], at: number): CiStatus {
	const failed = checks.filter((check) => check.bucket === "fail").map((check) => ({ name: check.name, link: check.link || undefined }));
	const state = !checks.length ? "none" : checks.some((check) => check.bucket === "pending") ? "pending" : failed.length ? "failed" : "passed";
	return { state, failed, checkedAt: at };
}

/** A pull request's checks on GitHub. gh exits non-zero while any are pending or failed, so its output is read either way. */
export function pullChecks(repo: string, number: number): Promise<CiStatus> {
	return new Promise((resolve, reject) => {
		execFile("gh", ["pr", "checks", String(number), "--repo", repo, "--json", "name,bucket,link"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
			const at = Date.now();
			if (/no checks reported/i.test(stderr)) return resolve(ciFrom([], at));
			try {
				resolve(ciFrom(JSON.parse(stdout) as CheckEntry[], at));
			} catch {
				reject(new Error(stderr.trim() || error?.message || "gh pr checks gave nothing back"));
			}
		});
	});
}

/** The log of a failed GitHub Actions job, from its check link. Checks from other services have no log to read. */
export async function failedLog(repo: string, link: string | undefined): Promise<string | undefined> {
	const match = link?.match(/\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/);
	if (!match) return undefined;
	const args = match[2] ? ["run", "view", "--repo", repo, "--job", match[2], "--log-failed"] : ["run", "view", match[1]!, "--repo", repo, "--log-failed"];
	const log = await gh(args, OUTSIDE).catch(() => "");
	// Each line starts with the job and step names, then a timestamp; only the message matters.
	return log.split("\n").map((line) => line.replace(/^[^\t]*\t[^\t]*\t(?:\S+Z )?/, "")).join("\n").trim() || undefined;
}

/** The GitHub repository a local clone's origin points at, as owner/name. */
export function checkoutRepo(dir: string): Promise<string | null> {
	return new Promise((resolve) => {
		execFile("git", ["-C", dir, "remote", "get-url", "origin"], { windowsHide: true }, (error, stdout) => {
			resolve(error ? null : githubRepoOf(stdout));
		});
	});
}
