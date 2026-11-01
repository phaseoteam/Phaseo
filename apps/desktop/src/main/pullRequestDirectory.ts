import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { ghFailure, parseActor, runGh } from "./projectPullRequestView";
import { pullRequestSearchQuery, validatePullRequestDirectoryQuery, type PullRequestDirectoryEntry, type PullRequestDirectoryQuery, type PullRequestDirectoryResult } from "../shared/pullRequestDirectory";
import { validRepository } from "../shared/pullRequestView";
import type { PullRequest } from "../shared/pullRequests";
import { codeHostProvider, otherCodeHost } from "./codeHosts";

const searchQuery = `query PhaseoPullRequestDirectory($q:String!,$first:Int!,$after:String){viewer{login}search(query:$q,type:ISSUE,first:$first,after:$after){issueCount pageInfo{hasNextPage endCursor}nodes{... on PullRequest{number title url state isDraft createdAt updatedAt author{login avatarUrl __typename} headRefName baseRefName headRefOid additions deletions reviewDecision mergeable repository{nameWithOwner} labels(first:10){nodes{name color}} reviewRequests(first:10){nodes{requestedReviewer{__typename ... on User{login}}}} commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}`;
/** Repositories per search: GitHub caps what one query may carry, and a smaller one fails alone. */
const repositoriesPerSearch = 10;

type Item = Record<string, unknown>;
const item = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const nodes = (value: unknown): unknown[] => { const list = item(value).nodes; return Array.isArray(list) ? list.slice(0, 100) : []; };
const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit ? value : undefined;
const date = (value: unknown) => typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value)) ? value : undefined;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const checks = (state: unknown, present: boolean): PullRequest["checks"] => !present ? "unknown" : state === undefined || state === null ? "none" : state === "SUCCESS" ? "passing" : state === "FAILURE" || state === "ERROR" ? "failed" : state === "PENDING" || state === "EXPECTED" ? "pending" : "unknown";

/** One search result as a row, or nothing when GitHub sent something malformed or outside these repositories. */
export function parseDirectoryEntry(value: unknown, projectFor: (repository: string) => string | undefined, viewer?: string): PullRequestDirectoryEntry | undefined {
	const entry = item(value), repository = text(item(entry.repository).nameWithOwner, 201), number = entry.number;
	if (!repository || !validRepository(repository) || !Number.isSafeInteger(number) || Number(number) < 1) return;
	const projectId = projectFor(repository), title = text(entry.title, 1000), head = text(entry.headRefName, 1000), base = text(entry.baseRefName, 1000), createdAt = date(entry.createdAt), updatedAt = date(entry.updatedAt), headOid = entry.headRefOid;
	if (!projectId || title === undefined || head === undefined || base === undefined || !createdAt || !updatedAt || typeof headOid !== "string" || !/^[a-f0-9]{40}$/i.test(headOid) || !["OPEN", "CLOSED", "MERGED"].includes(String(entry.state))) return;
	const commit = item(item(nodes(entry.commits)[0]).commit);
	const labels = nodes(entry.labels).flatMap(label => { const name = text(item(label).name, 200), color = text(item(label).color, 6); return name ? [{ name, ...(color && /^[0-9a-f]{6}$/i.test(color) ? { color } : {}) }] : []; });
	const requested = nodes(entry.reviewRequests).map(request => text(item(item(request).requestedReviewer).login, 256)?.toLowerCase());
	return {
		projectId, repository, number: Number(number), title, url: `https://github.com/${repository}/pull/${number}`,
		state: String(entry.state).toLowerCase() as PullRequestDirectoryEntry["state"], draft: entry.isDraft === true, author: parseActor(entry.author),
		head, base, headOid: headOid.toLowerCase(), createdAt, updatedAt, additions: count(entry.additions), deletions: count(entry.deletions), labels,
		review: entry.reviewDecision === "APPROVED" ? "approved" : entry.reviewDecision === "CHANGES_REQUESTED" ? "changes-requested" : entry.reviewDecision === "REVIEW_REQUIRED" ? "required" : "none",
		checks: checks(item(commit.statusCheckRollup).state, Object.keys(commit).length > 0), mergeable: entry.mergeable === "MERGEABLE" || entry.mergeable === "CONFLICTING" ? entry.mergeable : "UNKNOWN",
		viewerReviewRequested: Boolean(viewer) && requested.includes(viewer!.toLowerCase()),
	};
}

/** One page of a search: its rows, whether more wait, and where to continue. */
export function parseDirectoryPage(value: unknown, projectFor: (repository: string) => string | undefined) {
	const response = item(value);
	if (Array.isArray(response.errors) && response.errors.length) throw new Error("GitHub could not run this search.");
	const data = item(response.data), search = item(data.search), info = item(search.pageInfo);
	if (!Array.isArray(search.nodes) || typeof info.hasNextPage !== "boolean") throw new Error("GitHub returned an incomplete pull request list.");
	const viewer = text(item(data.viewer).login, 256);
	const cursor = info.hasNextPage ? text(info.endCursor, 2048) : undefined;
	return { viewer, entries: nodes(search).flatMap(node => { const entry = parseDirectoryEntry(node, projectFor, viewer); return entry ? [entry] : []; }), next: cursor && !/[^\x20-\x7e]/.test(cursor) ? cursor : undefined };
}

type DirectoryProject = { id: string; directory: string; worktree?: { removedAt?: string } };

/** Each project's GitHub repository, read once per repository and in the order projects were added; projects without one are in `errors`. */
async function projectRepositories(candidates: readonly DirectoryProject[]) {
	const errors: PullRequestDirectoryResult["errors"] = [];
	const owners = new Map<string, { projectId: string; directory: string; repository: string }>();
	const others: { projectId: string; directory: string; remote: string }[] = [];
	await Promise.all(candidates.map(async project => {
		try {
			const remote = await git(project.directory, ["remote", "get-url", "origin"]);
			if (otherCodeHost(remote)) { others.push({ projectId: project.id, directory: project.directory, remote }); return; }
			const repository = githubRepository(remote); if (!owners.has(repository.toLowerCase())) owners.set(repository.toLowerCase(), { projectId: project.id, directory: project.directory, repository });
		}
		catch (reason) { errors.push({ projectId: project.id, message: reason instanceof Error && reason.message.startsWith("Choose") ? "This project has no github.com origin remote." : "This project's origin remote could not be read." }); }
	}));
	// Keep the order projects were added in, so the same repository is always filed under the same project.
	const order = new Map(candidates.map((project, index) => [project.id, index]));
	const repositories = [...owners.values()].sort((left, right) => (order.get(left.projectId) ?? 0) - (order.get(right.projectId) ?? 0));
	return { owners, repositories, errors, others };
}

const countQuery = `query PhaseoPullRequestCounts($opened:String!,$merged:String!){opened:search(query:$opened,type:ISSUE,first:0){issueCount}merged:search(query:$merged,type:ISSUE,first:0){issueCount}}`;

/**
 * How many pull requests you opened and merged in the projects' repositories since a day (YYYY-MM-DD), for the Usage
 * page. Nothing when no project has a GitHub repository or GitHub can't be asked.
 */
export async function pullRequestCounts(projects: readonly DirectoryProject[], since: string, read = runGh): Promise<{ opened: number; merged: number } | undefined> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return;
	const { repositories } = await projectRepositories(projects.filter(project => !project.worktree));
	if (!repositories.length) return;
	const totals = { opened: 0, merged: 0 };
	for (let index = 0; index < repositories.length; index += repositoriesPerSearch) {
		const chunk = repositories.slice(index, index + repositoriesPerSearch), scope = chunk.map(owner => `repo:${owner.repository}`).join(" ");
		const output = await read(chunk[0].directory, ["api", "graphql", "--hostname", "github.com", "-f", `query=${countQuery}`, "-f", `opened=is:pr author:@me created:>=${since} ${scope}`, "-f", `merged=is:pr is:merged author:@me merged:>=${since} ${scope}`]);
		const data = item(item(JSON.parse(output)).data);
		totals.opened += count(item(data.opened).issueCount); totals.merged += count(item(data.merged).issueCount);
	}
	return totals;
}

/**
 * Every project's pull requests, newest activity first. A repository two projects share is read once and
 * filed under the first of them; a project that cannot be read is named in `errors` and the rest still load.
 */
export async function listPullRequestDirectory(projects: readonly DirectoryProject[], value: unknown, read = runGh): Promise<PullRequestDirectoryResult> {
	const readOnce = (root: string, args: string[]) => read(root, args).catch(reason => { if (/HTTP 50[234]/.test(String((reason as { stderr?: unknown }).stderr ?? ""))) return read(root, args); throw reason; });
	const query: PullRequestDirectoryQuery = validatePullRequestDirectoryQuery(value);
	const candidates = projects.filter(project => !project.worktree && (query.projectId === undefined || project.id === query.projectId));
	const { owners, repositories, errors, others } = await projectRepositories(candidates);
	const projectFor = (repository: string) => owners.get(repository.toLowerCase())?.projectId;
	const chunks: (typeof repositories)[] = [];
	for (let index = 0; index < repositories.length; index += repositoriesPerSearch) chunks.push(repositories.slice(index, index + repositoriesPerSearch));
	let viewer: string | undefined, truncated = false;
	const entries: PullRequestDirectoryEntry[] = [];
	await Promise.all(chunks.map(async chunk => {
		const search = pullRequestSearchQuery(chunk.map(owner => owner.repository), query);
		let after: string | undefined, loaded = 0;
		try {
			do {
				// GitHub search times out (HTTP 502–504) on 100 rich results at a time; 50 a page, with one retry, holds up.
				const first = Math.min(50, query.limit - loaded);
				const output = await readOnce(chunk[0].directory, ["api", "graphql", "--hostname", "github.com", "-f", `query=${searchQuery}`, "-f", `q=${search}`, "-F", `first=${first}`, ...(after ? ["-f", `after=${after}`] : [])]);
				let parsed: unknown;
				try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned an unreadable pull request list."); }
				const page = parseDirectoryPage(parsed, projectFor);
				viewer ??= page.viewer; entries.push(...page.entries); loaded += first; after = page.next;
			} while (after && loaded < query.limit);
			if (after) truncated = true;
		} catch (reason) {
			const message = (reason as NodeJS.ErrnoException).code === "ENOENT" || (reason instanceof Error && reason.message.startsWith("Install")) ? "Install GitHub CLI and sign in with gh auth login." : reason instanceof Error && reason.message !== "gh failed" ? reason.message : ghFailure((reason as { stderr?: string }).stderr, "Could not load pull requests. Check GitHub CLI sign-in and repository access, then retry.");
			for (const owner of chunk) errors.push({ projectId: owner.projectId, message });
		}
	}));
	for (const other of await Promise.all(others.map(project => otherHostEntries(project, query)))) { entries.push(...other.entries); errors.push(...other.errors); truncated ||= other.truncated; }
	const seen = new Set<string>();
	const unique = entries.filter(entry => { const key = `${entry.repository.toLowerCase()}#${entry.number}`; if (seen.has(key)) return false; seen.add(key); return true; });
	return { ...(viewer ? { viewer } : {}), entries: unique.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), errors, truncated, fetchedAt: new Date().toISOString() };
}

/**
 * A project on GitLab, Forgejo, Bitbucket or Azure DevOps: its open requests from the host's own list, narrowed here by
 * the filters a row can answer. Those hosts are only asked for open ones, so other states show none from them; "me" and label
 * filters need what the list does not say, so they show none either.
 */
async function otherHostEntries(project: { projectId: string; directory: string; remote: string }, query: PullRequestDirectoryQuery) {
	const entries: PullRequestDirectoryEntry[] = [], errors: PullRequestDirectoryResult["errors"] = [];
	if (query.state !== "open" && query.state !== "all") return { entries, errors, truncated: false };
	let truncated = false;
	try {
		const host = await codeHostProvider(project.directory, project.remote);
		if (!host) return { entries, errors, truncated };
		const page = await host.list();
		truncated = page.limitReached;
		const words = query.text.toLowerCase().split(/\s+/).filter(Boolean), { filters } = query;
		for (const row of page.requests) {
			if (words.some(word => !`${row.title} #${row.number} ${row.author} ${row.head}`.toLowerCase().includes(word))) continue;
			if ((filters.draft === "only" && !row.draft) || (filters.draft === "hide" && row.draft) || (filters.author && filters.author.toLowerCase() !== row.author.toLowerCase()) || filters.labels?.length) continue;
			entries.push({
				projectId: project.projectId, repository: page.repository, number: row.number, title: row.title, url: row.url, state: "open", draft: row.draft,
				author: { login: row.author, ...(row.authorAvatarUrl ? { avatarUrl: row.authorAvatarUrl } : {}) }, head: row.head, base: row.base,
				// A row without its full head commit still lists; writes that act on the code read the request again first.
				headOid: row.headOid ?? "0".repeat(40), createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt, additions: 0, deletions: 0, labels: [],
				review: row.review, checks: row.checks, mergeable: "UNKNOWN", viewerReviewRequested: false,
			});
		}
	} catch (reason) { errors.push({ projectId: project.projectId, message: reason instanceof Error ? reason.message : "This project's pull requests could not be read." }); }
	return { entries, errors, truncated };
}
