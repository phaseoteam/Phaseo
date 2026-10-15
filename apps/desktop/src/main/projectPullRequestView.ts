import { execFile } from "node:child_process";
import { git } from "./gitProcess";
import { resolveNativeCommand } from "./nativeProcess";
import { githubRepository, parsePullRequestDetails } from "./projectPullRequests";
import { reviewNodeId } from "../shared/pullRequestThreads";
import { validatePullRequestActionRequest, type PullRequestActor, type PullRequestCheck, type PullRequestCheckStatus, type PullRequestComment, type PullRequestCommit, type PullRequestMergeMethod, type PullRequestReaction, type PullRequestReviewState, type PullRequestReviewThreadView, type PullRequestView } from "../shared/pullRequestView";

const actor = "login avatarUrl __typename";
const reactions = "reactionGroups{content reactors{totalCount}}";
const viewQuery = `query PhaseoPullRequestView($owner:String!,$name:String!,$number:Int!){viewer{login}repository(owner:$owner,name:$name){mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerPermission pullRequest(number:$number){id number title body state createdAt updatedAt mergedAt closedAt isDraft author{${actor}} headRefName baseRefName headRefOid baseRefOid headRef{id} headRepository{nameWithOwner} reviewDecision additions deletions changedFiles mergeable mergeStateStatus viewerCanUpdate viewerCanDeleteHeadRef
labels(first:20){nodes{name color}}
reviewRequests(first:20){nodes{requestedReviewer{__typename ... on User{login avatarUrl} ... on Bot{login avatarUrl} ... on Team{slug}}}}
latestOpinionatedReviews(first:20){nodes{author{${actor}} state submittedAt}}
commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{name status conclusion detailsUrl title} ... on StatusContext{context state targetUrl description}}}}}}}
history:commits(last:100){totalCount nodes{commit{oid messageHeadline committedDate additions deletions authors(first:3){nodes{name user{login avatarUrl}}}}}}
comments(last:50){totalCount nodes{id author{${actor}} body createdAt url ${reactions}}}
reviews(last:50){totalCount nodes{id author{${actor}} body state submittedAt createdAt url ${reactions}}}
reviewThreads(first:50){totalCount nodes{id path line originalLine diffSide isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve comments(first:20){totalCount nodes{id author{${actor}} body createdAt url ${reactions}}}}}}}}`;

type Item = Record<string, unknown>;
const item = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const nodes = (value: unknown): unknown[] => { const list = item(value).nodes; return Array.isArray(list) ? list.slice(0, 200) : []; };
const total = (value: unknown, fallback: number) => { const count = item(value).totalCount; return Number.isSafeInteger(count) && Number(count) >= 0 ? Number(count) : fallback; };
const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit ? value : undefined;
const date = (value: unknown) => typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value)) ? value : undefined;
/** Only web links leave the app: anything else from GitHub is dropped. */
const link = (value: unknown) => typeof value === "string" && value.length <= 2048 && /^https:\/\//i.test(value) ? value : undefined;
const position = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 10_000_000 ? Number(value) : undefined;

export function parseActor(value: unknown): PullRequestActor | null {
	const entry = item(value), login = text(entry.login, 256);
	if (!login) return null;
	const avatarUrl = link(entry.avatarUrl);
	return { login, ...(avatarUrl ? { avatarUrl } : {}), ...(entry.__typename === "Bot" || login.endsWith("[bot]") ? { bot: true } : {}) };
}
function parseReactions(value: unknown): PullRequestReaction[] {
	return (Array.isArray(value) ? value : []).slice(0, 20).flatMap(entry => {
		const group = item(entry), content = text(group.content, 40), count = total(group.reactors, 0);
		return content && /^[A-Z_]+$/.test(content) && count > 0 ? [{ content, count }] : [];
	});
}
function parseComment(value: unknown, kind: PullRequestComment["kind"], extra: Partial<PullRequestComment> = {}): PullRequestComment | undefined {
	const entry = item(value), id = entry.id, body = text(entry.body, 512 * 1024), createdAt = date(entry.submittedAt) ?? date(entry.createdAt);
	if (!reviewNodeId(id) || body === undefined || !createdAt) return;
	const url = link(entry.url), state = text(entry.state, 40);
	return { id, kind, author: parseActor(entry.author), body, createdAt, ...(url ? { url } : {}), ...(kind === "review" && state ? { reviewState: state } : {}), reactions: parseReactions(entry.reactionGroups), ...extra };
}
export function checkStatus(entry: Item): PullRequestCheckStatus {
	if (entry.__typename === "StatusContext") {
		const state = String(entry.state);
		return state === "SUCCESS" ? "success" : state === "FAILURE" || state === "ERROR" ? "failure" : "pending";
	}
	if (entry.status !== "COMPLETED") return "pending";
	switch (entry.conclusion) {
		case "SUCCESS": return "success";
		case "CANCELLED": return "cancelled";
		case "SKIPPED": return "skipped";
		case "NEUTRAL": return "neutral";
		case "ACTION_REQUIRED": return "action-required";
		default: return "failure";
	}
}
function parseChecks(value: unknown): PullRequestCheck[] {
	return nodes(item(value).contexts).flatMap(entry => {
		const check = item(entry), name = text(check.__typename === "StatusContext" ? check.context : check.name, 500);
		if (!name) return [];
		const url = link(check.__typename === "StatusContext" ? check.targetUrl : check.detailsUrl), description = text(check.__typename === "StatusContext" ? check.description : check.title, 1000);
		return [{ name, status: checkStatus(check), ...(url ? { url } : {}), ...(description ? { description } : {}) }];
	});
}
function parseCommit(value: unknown): PullRequestCommit | undefined {
	const commit = item(item(value).commit), oid = commit.oid, committedAt = date(commit.committedDate);
	if (typeof oid !== "string" || !/^[a-f0-9]{40}$/i.test(oid) || !committedAt) return;
	const authors = nodes(commit.authors).flatMap(entry => { const author = item(entry), parsed = parseActor(author.user) ?? (text(author.name, 256) ? { login: author.name as string } : null); return parsed ? [parsed] : []; });
	return { oid, headline: text(commit.messageHeadline, 1000) ?? "", committedAt, ...(Number.isSafeInteger(commit.additions) ? { additions: Number(commit.additions) } : {}), ...(Number.isSafeInteger(commit.deletions) ? { deletions: Number(commit.deletions) } : {}), authors };
}
function parseThread(value: unknown): PullRequestReviewThreadView | undefined {
	const thread = item(value), path = text(thread.path, 4096);
	if (!reviewNodeId(thread.id) || !path || path.includes("\0") || typeof thread.isResolved !== "boolean") return;
	const comments = nodes(thread.comments).flatMap(entry => { const comment = parseComment(entry, "review-comment", { path, threadId: thread.id as string }); return comment ? [comment] : []; });
	const line = position(thread.line), originalLine = position(thread.originalLine);
	return { id: thread.id, path, ...(line ? { line } : {}), ...(originalLine ? { originalLine } : {}), side: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT", resolved: thread.isResolved, outdated: thread.isOutdated === true, canReply: thread.viewerCanReply === true, canResolve: thread.viewerCanResolve === true, canUnresolve: thread.viewerCanUnresolve === true, comments, totalComments: total(thread.comments, comments.length) };
}

export function parsePullRequestView(repository: string, number: number, value: unknown): PullRequestView {
	const response = item(value);
	if (Array.isArray(response.errors) && response.errors.length) throw new Error("GitHub returned incomplete pull request details.");
	const data = item(response.data), repo = item(data.repository), pull = repo.pullRequest;
	if (!pull || typeof pull !== "object") throw new Error("GitHub returned incomplete pull request details.");
	const entry = pull as Item;
	const details = parsePullRequestDetails(repository, number, entry);
	const createdAt = date(entry.createdAt);
	if (!reviewNodeId(entry.id) || !createdAt) throw new Error("GitHub returned invalid pull request details.");
	const threads = nodes(entry.reviewThreads).flatMap(value => { const thread = parseThread(value); return thread ? [thread] : []; });
	const issueComments = nodes(entry.comments).flatMap(value => { const comment = parseComment(value, "comment"); return comment ? [comment] : []; });
	// A review with no words and no verdict is the wrapper GitHub makes around inline remarks; the remarks carry it.
	const reviewComments = nodes(entry.reviews).flatMap(value => { const comment = parseComment(value, "review"); return comment && (comment.body.trim() || (comment.reviewState && comment.reviewState !== "COMMENTED")) ? [comment] : []; });
	const comments = [...issueComments, ...reviewComments, ...threads.flatMap(thread => thread.comments)].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	const commits = nodes(entry.history).flatMap(value => { const commit = parseCommit(value); return commit ? [commit] : []; });
	const status = item(nodes(entry.commits)[0]);
	const permission = String(repo.viewerPermission);
	const canMerge = ["ADMIN", "MAINTAIN", "WRITE"].includes(permission);
	const mergeMethods = ([["merge", repo.mergeCommitAllowed], ["squash", repo.squashMergeAllowed], ["rebase", repo.rebaseMergeAllowed]] as const).filter(([, allowed]) => allowed === true).map(([method]) => method as PullRequestMergeMethod);
	const labels = nodes(entry.labels).flatMap(value => { const label = item(value), name = text(label.name, 200), color = text(label.color, 6); return name ? [{ name, ...(color && /^[0-9a-f]{6}$/i.test(color) ? { color } : {}) }] : []; });
	const reviewers = nodes(entry.reviewRequests).flatMap(value => { const reviewer = item(item(value).requestedReviewer); const parsed = reviewer.__typename === "Team" ? (text(reviewer.slug, 200) ? { login: reviewer.slug as string } : null) : parseActor(reviewer); return parsed ? [parsed] : []; });
	const reviews = nodes(entry.latestOpinionatedReviews).flatMap(value => { const review = item(value), state = review.state as PullRequestReviewState, submittedAt = date(review.submittedAt); return ["APPROVED", "CHANGES_REQUESTED", "DISMISSED", "COMMENTED"].includes(state) && submittedAt ? [{ actor: parseActor(review.author), state, submittedAt }] : []; });
	const headRepository = text(item(entry.headRepository).nameWithOwner, 201);
	return {
		...details, id: entry.id, createdAt, ...(date(entry.mergedAt) ? { mergedAt: entry.mergedAt as string } : {}), ...(date(entry.closedAt) ? { closedAt: entry.closedAt as string } : {}),
		authorActor: parseActor(entry.author), labels, reviewers, reviews,
		checkRuns: parseChecks(item(item(status.commit).statusCheckRollup)),
		comments, commentCount: total(entry.comments, issueComments.length) + reviewComments.length + threads.reduce((sum, thread) => sum + thread.totalComments, 0),
		commentsTruncated: total(entry.comments, 0) > issueComments.length || total(entry.reviews, 0) > nodes(entry.reviews).length || total(entry.reviewThreads, 0) > threads.length,
		commits, commitCount: total(entry.history, commits.length), threads, mergeMethods,
		viewer: { ...(text(item(data.viewer).login, 256) ? { login: item(data.viewer).login as string } : {}), canUpdate: entry.viewerCanUpdate === true, canMerge, canDeleteBranch: entry.viewerCanDeleteHeadRef === true },
		...(headRepository ? { headRepository } : {}), headRefExists: Boolean(entry.headRef), behind: details.mergeState === "BEHIND",
	};
}

/** gh's own message, without anything that looks like a credential, for showing beside the control that failed. */
export function ghFailure(stderr: unknown, fallback: string) {
	const line = String(stderr ?? "").split(/\r?\n/).map(value => value.trim()).find(value => /^gh: /.test(value) || /\(HTTP \d{3}\)/.test(value));
	if (!line) return fallback;
	const message = line.replace(/^gh: /, "").replace(/\b(?:gh[opsur]_|github_pat_)[A-Za-z0-9_]+/g, "[hidden]").replace(/\b[A-Za-z0-9]{40,}\b/g, "[hidden]").slice(0, 240);
	return `${fallback} GitHub said: ${message}`;
}

/** Runs gh without a shell. Bodies travel on stdin so long comments never meet the command-line limit. */
export async function runGh(root: string, args: string[], input?: string): Promise<string> {
	let command: Awaited<ReturnType<typeof resolveNativeCommand>>;
	try { command = await resolveNativeCommand("gh"); } catch { throw new Error("Install GitHub CLI and sign in with gh auth login."); }
	return await new Promise<string>((resolve, reject) => {
		const child = execFile(command.executable, [...command.prefix, ...args], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_DEBUG: "" } }, (error, stdout, stderr) => {
			if (error) reject(Object.assign(new Error("gh failed"), { code: (error as NodeJS.ErrnoException).code, stderr: String(stderr ?? "") }));
			else resolve(String(stdout));
		});
		child.stdin?.on("error", () => {});
		child.stdin?.end(input ?? "");
	});
}

async function repositoryOf(root: string) {
	let remote: string;
	try { remote = await git(root, ["remote", "get-url", "origin"]); } catch { throw new Error("Choose a Git repository with an origin remote."); }
	return githubRepository(remote);
}

export async function projectPullRequestView(root: string, number: unknown): Promise<PullRequestView> {
	if (!Number.isSafeInteger(number) || Number(number) < 1 || Number(number) > 2147483647) throw new Error("Invalid pull-request number.");
	const repository = await repositoryOf(root), [owner, name] = repository.split("/");
	let output: string;
	try { output = await runGh(root, ["api", "graphql", "--hostname", "github.com", "-f", `query=${viewQuery}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`]); }
	catch (reason) {
		if ((reason as NodeJS.ErrnoException).code === "ENOENT" || (reason instanceof Error && reason.message.startsWith("Install"))) throw new Error("Install GitHub CLI and sign in with gh auth login.");
		throw new Error(ghFailure((reason as { stderr?: string }).stderr, "Could not load this pull request. Check GitHub CLI sign-in and repository access, then retry."));
	}
	let parsed: unknown;
	try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned unreadable pull request details."); }
	return parsePullRequestView(repository, Number(number), parsed);
}

const failures: Record<string, string> = { merge: "Could not merge.", close: "Could not close the pull request.", reopen: "Could not reopen the pull request.", ready: "Could not mark it ready for review.", draft: "Could not convert it to a draft.", title: "Could not save the title.", comment: "Could not post the comment.", reply: "Could not post the reply.", resolve: "Could not change the thread.", review: "Could not submit the review.", "update-branch": "Could not update the branch.", "delete-branch": "Could not delete the branch." };
const graphql = (query: string) => ["api", "graphql", "--hostname", "github.com", "-f", `query=${query}`];

/** Every write a pane can make. Each checks it still acts on the head the person saw, then reads the pull request again. */
export async function projectPullRequestAction(root: string, value: unknown): Promise<PullRequestView> {
	const request = validatePullRequestActionRequest(value), { action } = request;
	const view = await projectPullRequestView(root, request.number);
	if (view.headOid !== request.headOid) throw new Error("This pull request changed. It has been refreshed; check it and try again.");
	const base = `repos/${view.repository}/pulls/${view.number}`;
	let args: string[], input: string | undefined;
	switch (action.type) {
		case "merge":
			if (view.state !== "OPEN" || view.draft) throw new Error("Only an open pull request that is ready for review can be merged.");
			if (!view.mergeMethods.includes(action.method)) throw new Error("This repository does not allow that merge method.");
			args = ["api", "--hostname", "github.com", "--method", "PUT", `${base}/merge`, "-f", `merge_method=${action.method}`, "-f", `sha=${view.headOid}`]; break;
		case "close": case "reopen":
			args = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-f", `state=${action.type === "close" ? "closed" : "open"}`]; break;
		case "title": args = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-f", `title=${action.title}`]; break;
		case "ready": case "draft":
			args = [...graphql(action.type === "ready" ? "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}" : "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id}}}"), "-f", `id=${view.id}`]; break;
		case "comment": args = ["api", "--hostname", "github.com", "--method", "POST", `repos/${view.repository}/issues/${view.number}/comments`, "-F", "body=@-"]; input = action.body; break;
		case "reply": case "resolve": {
			const thread = view.threads.find(value => value.id === action.threadId);
			if (!thread) throw new Error("This review thread is no longer on the pull request.");
			if (action.type === "reply") { args = [...graphql("mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}"), "-f", `id=${thread.id}`, "-F", "body=@-"]; input = action.body; }
			else args = [...graphql(action.resolved ? "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}" : "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id}}}"), "-f", `id=${thread.id}`];
			break;
		}
		case "review":
			args = ["api", "--hostname", "github.com", "--method", "POST", `${base}/reviews`, "-f", `event=${action.event === "approve" ? "APPROVE" : action.event === "request-changes" ? "REQUEST_CHANGES" : "COMMENT"}`, "-f", `commit_id=${view.headOid}`, ...(action.body.trim() ? ["-F", "body=@-"] : [])]; input = action.body.trim() ? action.body : undefined; break;
		case "update-branch":
			if (view.state !== "OPEN") throw new Error("Only an open pull request's branch can be updated.");
			args = ["api", "--hostname", "github.com", "--method", "PUT", `${base}/update-branch`, "-f", `expected_head_sha=${view.headOid}`]; break;
		case "delete-branch":
			if (view.state === "OPEN") throw new Error("Close or merge the pull request before deleting its branch.");
			if (!view.headRefExists || view.headRepository?.toLowerCase() !== view.repository.toLowerCase()) throw new Error("This branch is already gone or lives in a fork.");
			if (!/^[A-Za-z0-9._/-]{1,255}$/.test(view.head) || view.head.split("/").some(part => !part || part === "." || part === "..")) throw new Error("This branch name cannot be deleted from here.");
			args = ["api", "--hostname", "github.com", "--method", "DELETE", `repos/${view.repository}/git/refs/heads/${view.head.split("/").map(encodeURIComponent).join("/")}`]; break;
	}
	try { await runGh(root, args, input); }
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: string }).stderr, failures[action.type])); }
	return await projectPullRequestView(root, request.number);
}
