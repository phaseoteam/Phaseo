import { execFile } from "node:child_process";
import { git } from "./gitProcess";
import { span } from "./diagnostics/tracer";
import { resolveNativeCommand } from "./nativeProcess";
import { githubRepository, parsePullRequestDetails } from "./projectPullRequests";
import { reviewCursor, reviewNodeId } from "../shared/pullRequestThreads";
import { validRepository, validatePullRequestActionRequest, validatePullRequestCandidatesQuery, type PullRequestCandidates, type PullRequestActor, type PullRequestCheck, type PullRequestCheckStatus, type PullRequestComment, type PullRequestCommit, type PullRequestMergeMethod, type PullRequestReaction, type PullRequestReviewState, type PullRequestReviewThreadView, type PullRequestView, type PullRequestActionResult } from "../shared/pullRequestView";

const actor = "login avatarUrl __typename";
const reactions = "viewerCanReact reactionGroups{content viewerHasReacted reactors(first:4){totalCount nodes{... on Actor{login}}}}";
const viewQuery = `query PhaseoPullRequestView($owner:String!,$name:String!,$number:Int!){viewer{login}repository(owner:$owner,name:$name){mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed autoMergeAllowed viewerPermission pullRequest(number:$number){id number title body state createdAt updatedAt mergedAt closedAt isDraft author{${actor}} headRefName baseRefName headRefOid baseRefOid headRef{id} headRepository{nameWithOwner} reviewDecision additions deletions changedFiles mergeable mergeStateStatus viewerCanUpdate viewerCanDeleteHeadRef viewerCanEnableAutoMerge viewerCanDisableAutoMerge autoMergeRequest{mergeMethod enabledBy{login}}
labels(first:20){nodes{name color}}
reviewRequests(first:20){nodes{requestedReviewer{__typename ... on User{login avatarUrl} ... on Bot{login avatarUrl} ... on Team{slug}}}}
latestOpinionatedReviews(first:20){nodes{author{${actor}} state submittedAt}}
commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{name status conclusion detailsUrl title isRequired(pullRequestNumber:$number)} ... on StatusContext{context state targetUrl description isRequired(pullRequestNumber:$number)}}}}}}}
history:commits(last:100){totalCount nodes{commit{oid messageHeadline committedDate additions deletions authors(first:3){nodes{name user{login avatarUrl}}}}}}
comments(last:50){totalCount nodes{id author{${actor}} body createdAt lastEditedAt url viewerCanUpdate ${reactions}}}
reviews(last:50){totalCount nodes{id author{${actor}} body state submittedAt createdAt lastEditedAt url viewerCanUpdate ${reactions}}}
reviewThreads(first:50){totalCount nodes{id path line originalLine startLine diffSide isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve comments(first:20){totalCount pageInfo{hasNextPage endCursor} nodes{id author{${actor}} body createdAt lastEditedAt url viewerCanUpdate ${reactions}}}}}}}}`;

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
		const actors = nodes(group.reactors).flatMap(value => { const login = text(item(value).login, 256); return login ? [login] : []; }).slice(0, 4);
		return content && /^[A-Z_]+$/.test(content) && count > 0 ? [{ content, count, ...(group.viewerHasReacted === true ? { viewerHasReacted: true } : {}), ...(actors.length ? { actors } : {}) }] : [];
	});
}
function parseComment(value: unknown, kind: PullRequestComment["kind"], extra: Partial<PullRequestComment> = {}): PullRequestComment | undefined {
	const entry = item(value), id = entry.id, body = text(entry.body, 512 * 1024), createdAt = date(entry.submittedAt) ?? date(entry.createdAt);
	if (!reviewNodeId(id) || body === undefined || !createdAt) return;
	const url = link(entry.url), state = text(entry.state, 40), editedAt = date(entry.lastEditedAt);
	return { id, kind, author: parseActor(entry.author), body, createdAt, ...(editedAt && editedAt > createdAt ? { editedAt } : {}), ...(url ? { url } : {}), ...(kind === "review" && state ? { reviewState: state } : {}), reactions: parseReactions(entry.reactionGroups), ...(entry.viewerCanReact === true ? { canReact: true } : {}), ...(entry.viewerCanUpdate === true ? { canEdit: true } : {}), ...extra };
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
		return [{ name, status: checkStatus(check), ...(url ? { url } : {}), ...(description ? { description } : {}), ...(check.isRequired === true ? { required: true } : {}) }];
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
	const line = position(thread.line), originalLine = position(thread.originalLine), startLine = position(thread.startLine);
	const info = item(item(thread.comments).pageInfo), commentsCursor = info.hasNextPage === true && reviewCursor(info.endCursor) ? info.endCursor : undefined;
	return { id: thread.id, path, ...(line ? { line } : {}), ...(originalLine ? { originalLine } : {}), ...(startLine && line && startLine < line ? { startLine } : {}), side: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT", resolved: thread.isResolved, outdated: thread.isOutdated === true, canReply: thread.viewerCanReply === true, canResolve: thread.viewerCanResolve === true, canUnresolve: thread.viewerCanUnresolve === true, comments, totalComments: total(thread.comments, comments.length), ...(commentsCursor ? { commentsCursor } : {}) };
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
	const autoMergeRequest = item(entry.autoMergeRequest), autoMethod = ({ MERGE: "merge", SQUASH: "squash", REBASE: "rebase" } as const)[String(autoMergeRequest.mergeMethod) as "MERGE"], enabledBy = text(item(autoMergeRequest.enabledBy).login, 256);
	return {
		...details, id: entry.id, createdAt, ...(date(entry.mergedAt) ? { mergedAt: entry.mergedAt as string } : {}), ...(date(entry.closedAt) ? { closedAt: entry.closedAt as string } : {}),
		authorActor: parseActor(entry.author), labels, reviewers, reviews,
		checkRuns: parseChecks(item(item(status.commit).statusCheckRollup)),
		comments, commentCount: total(entry.comments, issueComments.length) + reviewComments.length + threads.reduce((sum, thread) => sum + thread.totalComments, 0),
		commentsTruncated: total(entry.comments, 0) > issueComments.length || total(entry.reviews, 0) > nodes(entry.reviews).length || total(entry.reviewThreads, 0) > threads.length,
		commits, commitCount: total(entry.history, commits.length), threads, mergeMethods,
		viewer: { ...(text(item(data.viewer).login, 256) ? { login: item(data.viewer).login as string } : {}), canUpdate: entry.viewerCanUpdate === true, canMerge, canDeleteBranch: entry.viewerCanDeleteHeadRef === true, canEnableAutoMerge: entry.viewerCanEnableAutoMerge === true, canDisableAutoMerge: entry.viewerCanDisableAutoMerge === true },
		autoMergeAllowed: repo.autoMergeAllowed === true, ...(entry.autoMergeRequest && autoMethod ? { autoMerge: { method: autoMethod, ...(enabledBy ? { enabledBy } : {}) } } : {}),
		...(headRepository ? { headRepository } : {}), headRefExists: Boolean(entry.headRef), behind: details.mergeState === "BEHIND", readAt: new Date().toISOString(),
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
export function runGh(root: string, args: string[], input?: string): Promise<string> {
	// The subcommand names the span ("gh pr diff", "gh api graphql"); arguments may carry queries and bodies, so they stay out.
	return span(`gh ${args.slice(0, args[0] === "api" && args[1] === "graphql" ? 2 : args[0] === "api" ? 1 : 2).join(" ")}`, undefined, () => ghProcess(root, args, input));
}
async function ghProcess(root: string, args: string[], input?: string): Promise<string> {
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
	return readPullRequestView(root, await repositoryOf(root), Number(number));
}
/** One pull request by repository, read with gh from any folder (the watcher reads chats without a project this way). */
export async function readPullRequestView(cwd: string, repository: string, number: number): Promise<PullRequestView> {
	if (!validRepository(repository) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new Error("Invalid pull request.");
	const [owner, name] = repository.split("/");
	let output: string;
	try { output = await runGh(cwd, ["api", "graphql", "--hostname", "github.com", "-f", `query=${viewQuery}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`]); }
	catch (reason) {
		if ((reason as NodeJS.ErrnoException).code === "ENOENT" || (reason instanceof Error && reason.message.startsWith("Install"))) throw new Error("Install GitHub CLI and sign in with gh auth login.", { cause: reason });
		throw new Error(ghFailure((reason as { stderr?: string }).stderr, "Could not load this pull request. Check GitHub CLI sign-in and repository access, then retry."), { cause: reason });
	}
	let parsed: unknown;
	try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned unreadable pull request details."); }
	return parsePullRequestView(repository, number, parsed);
}

const failures: Record<string, string> = { merge: "Could not merge.", "enable-auto-merge": "Could not turn on auto-merge. Check that this repository allows auto-merge, that you have write access, and that there is something left for it to wait on.", "disable-auto-merge": "Could not turn off auto-merge.", close: "Could not close the pull request.", reopen: "Could not reopen the pull request.", ready: "Could not mark it ready for review.", draft: "Could not convert it to a draft.", title: "Could not save the title.", comment: "Could not post the comment.", reply: "Could not post the reply.", resolve: "Could not change the thread.", review: "Could not submit the review.", react: "The reaction could not be saved.", label: "Could not change the labels. Changing labels needs triage access on this repository.", reviewer: "Could not change the reviewers. Asking for a review needs write access on this repository.", "update-branch": "Could not update the branch.", "delete-branch": "Could not delete the branch.", body: "Could not save the description.", "update-comment": "Could not save the comment.", revert: "Could not open a revert pull request.", "approve-workflows": "Could not approve the workflows." };
const graphql = (query: string) => ["api", "graphql", "--hostname", "github.com", "-f", `query=${query}`];

/** Every write a pane can make. Each checks it still acts on the head the person saw, then reads the pull request again. */
export async function projectPullRequestAction(root: string, value: unknown): Promise<PullRequestActionResult> {
	const request = validatePullRequestActionRequest(value), { action } = request;
	const view = await projectPullRequestView(root, request.number);
	// Reactions, labels and reviewers do not depend on the code, so a push since the person looked does not stop them.
	if (view.headOid !== request.headOid && !["react", "label", "reviewer", "body", "update-comment", "title"].includes(action.type)) throw new Error("This pull request changed. It has been refreshed; check it and try again.");
	const base = `repos/${view.repository}/pulls/${view.number}`;
	let args: string[], input: string | undefined, after: string[] | undefined, many: string[][] | undefined;
	switch (action.type) {
		case "merge":
			if (view.state !== "OPEN" || view.draft) throw new Error("Only an open pull request that is ready for review can be merged.");
			if (!view.mergeMethods.includes(action.method)) throw new Error("This repository does not allow that merge method.");
			args = ["api", "--hostname", "github.com", "--method", "PUT", `${base}/merge`, "-f", `merge_method=${action.method}`, "-f", `sha=${view.headOid}`]; break;
		case "enable-auto-merge":
			if (view.state !== "OPEN" || view.draft) throw new Error("Only an open pull request that is ready for review can merge itself.");
			if (!view.mergeMethods.includes(action.method)) throw new Error("This repository does not allow that merge method.");
			args = ["pr", "merge", String(view.number), "--repo", view.repository, "--auto", `--${action.method}`, "--match-head-commit", view.headOid]; break;
		case "disable-auto-merge":
			if (!view.autoMerge) throw new Error("Auto-merge is already off.");
			args = ["pr", "merge", String(view.number), "--repo", view.repository, "--disable-auto"]; break;
		case "close": case "reopen":
			args = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-f", `state=${action.type === "close" ? "closed" : "open"}`]; break;
		case "title": args = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-f", `title=${action.title}`]; break;
		case "ready": case "draft":
			args = [...graphql(action.type === "ready" ? "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}" : "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id}}}"), "-f", `id=${view.id}`]; break;
		case "comment":
			if (action.then === "close" && view.state !== "OPEN") throw new Error("This pull request is already closed.");
			if (action.then === "reopen" && view.state !== "CLOSED") throw new Error("Only a closed pull request can be reopened.");
			args = ["api", "--hostname", "github.com", "--method", "POST", `repos/${view.repository}/issues/${view.number}/comments`, "-F", "body=@-"]; input = action.body;
			if (action.then) after = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-f", `state=${action.then === "close" ? "closed" : "open"}`];
			break;
		case "body":
			if (!view.viewer.canUpdate) throw new Error("Editing the description needs write access, or to have opened it.");
			args = ["api", "--hostname", "github.com", "--method", "PATCH", base, "-F", "body=@-"]; input = action.body; break;
		case "update-comment": {
			const comment = view.comments.find(entry => entry.id === action.commentId && entry.kind === action.kind);
			if (!comment) throw new Error("This comment is no longer on the pull request.");
			if (!comment.canEdit) throw new Error("Only its author or a maintainer can edit this comment.");
			const mutation = action.kind === "comment" ? "mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{id}}}" : action.kind === "review" ? "mutation($id:ID!,$body:String!){updatePullRequestReview(input:{pullRequestReviewId:$id,body:$body}){pullRequestReview{id}}}" : "mutation($id:ID!,$body:String!){updatePullRequestReviewComment(input:{pullRequestReviewCommentId:$id,body:$body}){pullRequestReviewComment{id}}}";
			args = [...graphql(mutation), "-f", `id=${comment.id}`, "-F", "body=@-"]; input = action.body; break;
		}
		case "revert":
			if (view.state !== "MERGED") throw new Error("Only a merged pull request can be reverted.");
			args = [...graphql("mutation($id:ID!){revertPullRequest(input:{pullRequestId:$id}){revertPullRequest{url}}}"), "-f", `id=${view.id}`]; break;
		case "approve-workflows": {
			const runs = [...new Set(view.checkRuns.filter(check => check.status === "action-required").flatMap(check => { const run = /\/actions\/runs\/(\d{1,20})(?:\/|$)/.exec(check.url ?? ""); return run ? [run[1]] : []; }))].slice(0, 50);
			if (!runs.length) throw new Error("No workflow runs are waiting for approval.");
			many = runs.map(run => ["api", "--hostname", "github.com", "--method", "POST", `repos/${view.repository}/actions/runs/${run}/approve`]); args = many[0]; break;
		}
		case "reply": case "resolve": {
			const thread = view.threads.find(value => value.id === action.threadId);
			if (!thread) throw new Error("This review thread is no longer on the pull request.");
			if (action.type === "reply") { args = [...graphql("mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}"), "-f", `id=${thread.id}`, "-F", "body=@-"]; input = action.body; }
			else args = [...graphql(action.resolved ? "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}" : "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id}}}"), "-f", `id=${thread.id}`];
			break;
		}
		case "review": {
			const event = action.event === "approve" ? "APPROVE" : action.event === "request-changes" ? "REQUEST_CHANGES" : "COMMENT";
			// One request carries the verdict and every line comment, so GitHub posts them together or not at all.
			if (action.comments?.length) { args = ["api", "--hostname", "github.com", "--method", "POST", `${base}/reviews`, "--input", "-"]; input = JSON.stringify({ event, commit_id: view.headOid, ...(action.body.trim() ? { body: action.body } : {}), comments: action.comments.map(comment => ({ path: comment.path, line: comment.line, side: comment.side, ...(comment.startLine ? { start_line: comment.startLine, start_side: comment.startSide } : {}), body: comment.body })) }); }
			else { args = ["api", "--hostname", "github.com", "--method", "POST", `${base}/reviews`, "-f", `event=${event}`, "-f", `commit_id=${view.headOid}`, ...(action.body.trim() ? ["-F", "body=@-"] : [])]; input = action.body.trim() ? action.body : undefined; }
			break;
		}
		case "react":
			if (!view.comments.some(comment => comment.id === action.subjectId)) throw new Error("This comment is no longer on the pull request.");
			args = [...graphql(action.reacted ? "mutation($id:ID!,$content:ReactionContent!){addReaction(input:{subjectId:$id,content:$content}){reaction{content}}}" : "mutation($id:ID!,$content:ReactionContent!){removeReaction(input:{subjectId:$id,content:$content}){reaction{content}}}"), "-f", `id=${action.subjectId}`, "-f", `content=${action.content}`]; break;
		case "label":
			if (action.applied) { args = ["api", "--hostname", "github.com", "--method", "POST", `repos/${view.repository}/issues/${view.number}/labels`, "-f", `labels[]=${action.name}`]; break; }
			if (!view.labels.some(label => label.name === action.name)) throw new Error(`${action.name} is no longer on this pull request.`);
			args = ["api", "--hostname", "github.com", "--method", "DELETE", `repos/${view.repository}/issues/${view.number}/labels/${encodeURIComponent(action.name)}`]; break;
		case "reviewer":
			if (action.requested && view.authorActor?.login.toLowerCase() === action.login.toLowerCase()) throw new Error("The author cannot review their own pull request.");
			args = ["api", "--hostname", "github.com", "--method", action.requested ? "POST" : "DELETE", `repos/${view.repository}/pulls/${view.number}/requested_reviewers`, "-f", `reviewers[]=${action.login}`]; break;
		case "update-branch":
			if (view.state !== "OPEN") throw new Error("Only an open pull request's branch can be updated.");
			args = action.method === "rebase" ? [...graphql("mutation($id:ID!,$head:GitObjectID!){updatePullRequestBranch(input:{pullRequestId:$id,expectedHeadOid:$head,updateMethod:REBASE}){pullRequest{id}}}"), "-f", `id=${view.id}`, "-f", `head=${view.headOid}`] : ["api", "--hostname", "github.com", "--method", "PUT", `${base}/update-branch`, "-f", `expected_head_sha=${view.headOid}`]; break;
		case "delete-branch":
			if (view.state === "OPEN") throw new Error("Close or merge the pull request before deleting its branch.");
			if (!view.headRefExists || view.headRepository?.toLowerCase() !== view.repository.toLowerCase()) throw new Error("This branch is already gone or lives in a fork.");
			if (!/^[A-Za-z0-9._/-]{1,255}$/.test(view.head) || view.head.split("/").some(part => !part || part === "." || part === "..")) throw new Error("This branch name cannot be deleted from here.");
			args = ["api", "--hostname", "github.com", "--method", "DELETE", `repos/${view.repository}/git/refs/heads/${view.head.split("/").map(encodeURIComponent).join("/")}`]; break;
	}
	let output = "";
	try {
		if (many) for (const command of many) await runGh(root, command);
		else output = await runGh(root, args, input);
	}
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: string }).stderr, failures[action.type]), { cause: reason }); }
	// The comment is up even if the close or reopen after it is refused, so that failure says so.
	if (after) try { await runGh(root, after); } catch (reason) { throw new Error(ghFailure((reason as { stderr?: string }).stderr, `The comment was posted, but ${action.type === "comment" && action.then === "reopen" ? "the pull request could not be reopened" : "the pull request could not be closed"}.`), { cause: reason }); }
	const fresh = await projectPullRequestView(root, request.number);
	if (action.type !== "revert") return fresh;
	let revertUrl: string | undefined;
	try { revertUrl = link(item(item(item(item(JSON.parse(output)).data).revertPullRequest).revertPullRequest).url); } catch { /* The revert exists either way; only its link is missing. */ }
	return { ...fresh, ...(revertUrl ? { revertUrl } : {}) };
}

const candidateQuery = `query PhaseoPullRequestCandidates($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){labels(first:100,orderBy:{field:NAME,direction:ASC}){totalCount nodes{name color description}} assignableUsers(first:100){totalCount nodes{login name avatarUrl}} pullRequest(number:$number){author{login} labels(first:100){nodes{name}} reviewRequests(first:100){nodes{requestedReviewer{... on User{login}}}}}}}`;
/** The labels a repository offers or the people who may be asked to review, marked where the pull request already has them. */
export function parsePullRequestCandidates(kind: "labels" | "reviewers", value: unknown): PullRequestCandidates {
	const response = item(value), repo = item(item(response.data).repository), pull = item(repo.pullRequest);
	if ((Array.isArray(response.errors) && response.errors.length) || !repo.pullRequest) throw new Error("GitHub returned an incomplete list.");
	if (kind === "labels") {
		const applied = new Set(nodes(pull.labels).map(value => text(item(value).name, 200)));
		const candidates = nodes(repo.labels).flatMap(value => { const label = item(value), name = text(label.name, 200), color = text(label.color, 6), detail = text(label.description, 400); return name ? [{ key: name, label: name, ...(detail ? { detail } : {}), ...(color && /^[0-9a-f]{6}$/i.test(color) ? { color } : {}), applied: applied.has(name) }] : []; });
		return { kind, candidates, truncated: total(repo.labels, candidates.length) > candidates.length };
	}
	const author = text(item(pull.author).login, 256)?.toLowerCase(), requested = new Set(nodes(pull.reviewRequests).map(value => text(item(item(value).requestedReviewer).login, 256)?.toLowerCase()));
	// GitHub refuses a review request to the author, so they are not offered.
	const candidates = nodes(repo.assignableUsers).flatMap(value => { const user = item(value), login = text(user.login, 256), name = text(user.name, 256), avatarUrl = link(user.avatarUrl); return login && login.toLowerCase() !== author ? [{ key: login, label: login, ...(name ? { detail: name } : {}), ...(avatarUrl ? { avatarUrl } : {}), applied: requested.has(login.toLowerCase()) }] : []; });
	return { kind, candidates, truncated: total(repo.assignableUsers, candidates.length) > nodes(repo.assignableUsers).length };
}
export async function projectPullRequestCandidates(root: string, value: unknown): Promise<PullRequestCandidates> {
	const query = validatePullRequestCandidatesQuery(value), repository = await repositoryOf(root), [owner, name] = repository.split("/");
	let output: string;
	try { output = await runGh(root, ["api", "graphql", "--hostname", "github.com", "-f", `query=${candidateQuery}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${query.number}`]); }
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: string }).stderr, query.kind === "labels" ? "The labels could not be read." : "The people who can review could not be read."), { cause: reason }); }
	let parsed: unknown;
	try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned an unreadable list."); }
	return parsePullRequestCandidates(query.kind, parsed);
}

/** How far behind its base a branch is, read when the out-of-date warning opens rather than on every refresh. */
export async function projectPullRequestBehind(root: string, value: unknown): Promise<{ behindBy: number }> {
	const query = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const base = query.base, headOid = query.headOid;
	if (typeof base !== "string" || !/^[A-Za-z0-9._/-]{1,255}$/.test(base) || base.split("/").some(part => !part || part === "." || part === "..") || typeof headOid !== "string" || !/^[a-f0-9]{40}$/i.test(headOid)) throw new Error("Invalid branch comparison.");
	const repository = await repositoryOf(root);
	let output: string;
	try { output = await runGh(root, ["api", "--hostname", "github.com", "--method", "GET", `repos/${repository}/compare/${base.split("/").map(encodeURIComponent).join("/")}...${headOid}`, "--jq", ".behind_by"]); }
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: string }).stderr, "Could not compare the branch with its base."), { cause: reason }); }
	const behindBy = Number(output.trim());
	if (!Number.isSafeInteger(behindBy) || behindBy < 0) throw new Error("GitHub returned an unreadable comparison.");
	return { behindBy };
}
