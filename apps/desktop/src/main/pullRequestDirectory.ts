import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { ghFailure, parseActor, runGh } from "./projectPullRequestView";
import { pullRequestSearchQuery, validatePullRequestDirectoryQuery, type PullRequestDirectoryEntry, type PullRequestDirectoryQuery, type PullRequestDirectoryResult } from "../shared/pullRequestDirectory";
import { validRepository } from "../shared/pullRequestView";
import type { PullRequest } from "../shared/pullRequests";

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

/**
 * Every project's pull requests, newest activity first. A repository two projects share is read once and
 * filed under the first of them; a project that cannot be read is named in `errors` and the rest still load.
 */
export async function listPullRequestDirectory(projects: readonly DirectoryProject[], value: unknown, read = runGh): Promise<PullRequestDirectoryResult> {
	const query: PullRequestDirectoryQuery = validatePullRequestDirectoryQuery(value);
	const candidates = projects.filter(project => !project.worktree && (query.projectId === undefined || project.id === query.projectId));
	const errors: PullRequestDirectoryResult["errors"] = [];
	const owners = new Map<string, { projectId: string; directory: string; repository: string }>();
	await Promise.all(candidates.map(async project => {
		try { const repository = githubRepository(await git(project.directory, ["remote", "get-url", "origin"])); if (!owners.has(repository.toLowerCase())) owners.set(repository.toLowerCase(), { projectId: project.id, directory: project.directory, repository }); }
		catch (reason) { errors.push({ projectId: project.id, message: reason instanceof Error && reason.message.startsWith("Choose") ? "This project has no github.com origin remote." : "This project's origin remote could not be read." }); }
	}));
	// Keep the order projects were added in, so the same repository is always filed under the same project.
	const order = new Map(candidates.map((project, index) => [project.id, index]));
	const repositories = [...owners.values()].sort((left, right) => (order.get(left.projectId) ?? 0) - (order.get(right.projectId) ?? 0));
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
				const first = Math.min(100, query.limit - loaded);
				const output = await read(chunk[0].directory, ["api", "graphql", "--hostname", "github.com", "-f", `query=${searchQuery}`, "-f", `q=${search}`, "-F", `first=${first}`, ...(after ? ["-f", `after=${after}`] : [])]);
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
	const seen = new Set<string>();
	const unique = entries.filter(entry => { const key = `${entry.repository.toLowerCase()}#${entry.number}`; if (seen.has(key)) return false; seen.add(key); return true; });
	return { ...(viewer ? { viewer } : {}), entries: unique.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), errors, truncated, fetchedAt: new Date().toISOString() };
}
