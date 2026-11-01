import { codeHostRequestUrl, type CodeHostRemote } from "../../shared/codeHosts";
import type { PullRequest } from "../../shared/pullRequests";
import type { PullRequestCheck, PullRequestCheckStatus, PullRequestMergeMethod, PullRequestReviewState } from "../../shared/pullRequestView";
import { actor, chooseMethod, comment, commit, date, enc, invalid, item, list, mergeNotReady, reviewDecision, rollup, sha, text, unsupported, view, type CodeHostProvider, type Item } from "./common";
import type { HostRequest } from "./transport";

const name = "Azure DevOps", noun = "pull request";
const statuses: Record<string, PullRequestCheckStatus> = { succeeded: "success", failed: "failure", error: "failure", pending: "pending", notApplicable: "skipped", notSet: "pending" };
const state = (value: unknown) => value === "active" ? "OPEN" : value === "completed" ? "MERGED" : value === "abandoned" ? "CLOSED" : undefined;
const branch = (ref: unknown) => typeof ref === "string" && ref.length <= 1000 ? ref.replace(/^refs\/heads\//, "") : undefined;
const person = (value: unknown) => { const user = item(value); return actor(user.uniqueName ?? user.displayName, user.imageUrl, user.isContainer === true); };
/** Votes: 10 approved, 5 approved with suggestions, 0 none, -5 waiting for the author, -10 rejected. */
const vote = (value: unknown): PullRequestReviewState | undefined => Number(value) >= 5 ? "APPROVED" : Number(value) <= -5 ? "CHANGES_REQUESTED" : undefined;
const strategies: Record<PullRequestMergeMethod, string> = { merge: "noFastForward", squash: "squash", rebase: "rebase" };

export function azureRequest(remote: CodeHostRemote, value: unknown, checks: PullRequest["checks"] = "unknown"): PullRequest {
	const entry = item(value), number = entry.pullRequestId;
	const title = text(entry.title), head = branch(entry.sourceRefName), base = branch(entry.targetRefName);
	// Azure DevOps keeps no last-updated time on a pull request; closing is the latest it reports.
	const updatedAt = date(entry.closedDate) ?? date(entry.creationDate);
	if (!Number.isSafeInteger(number) || Number(number) < 1 || title === undefined || head === undefined || base === undefined || !updatedAt) throw invalid(name, "a pull request");
	const who = person(entry.createdBy), reviewers = list(entry.reviewers).map(item);
	const reviews = reviewers.flatMap(reviewer => { const verdict = vote(reviewer.vote); return verdict ? [{ state: verdict }] : []; });
	const required = reviewers.some(reviewer => reviewer.isRequired === true && !vote(reviewer.vote));
	return { number: Number(number), title, url: codeHostRequestUrl(remote, Number(number)), author: who?.login ?? "Unknown author", draft: entry.isDraft === true, head, base, updatedAt, review: reviewDecision(reviews, required), checks, ...(who?.avatarUrl ? { authorAvatarUrl: who.avatarUrl } : {}), ...(sha(item(entry.lastMergeSourceCommit).commitId) ? { headOid: sha(item(entry.lastMergeSourceCommit).commitId) } : {}), ...(date(entry.creationDate) ? { createdAt: date(entry.creationDate) } : {}) };
}

export function azureProvider(remote: CodeHostRemote, request: HostRequest): CodeHostProvider {
	const [, project, repository] = remote.repository.split("/");
	const api = (path: string, query = "") => `${enc(project)}/_apis/git/repositories/${enc(repository)}/${path}?${query}${query ? "&" : ""}api-version=7.1`;
	let viewer: Promise<{ id?: string; login?: string }> | undefined;
	const me = () => viewer ??= request("GET", "_apis/connectionData?api-version=7.1-preview").then(value => { const user = item(item(value).authenticatedUser); return { id: text(user.id, 100), login: text(item(item(user.properties).Account).$value, 256) ?? text(user.providerDisplayName, 256) }; }, (): { id?: string; login?: string } => { viewer = undefined; return {}; });
	const viewerId = async () => { const id = (await me()).id; if (!id) throw new Error("Azure DevOps did not say who is signed in."); return id; };
	return {
		remote,
		actions: ["merge", "enable-auto-merge", "disable-auto-merge", "close", "reopen", "ready", "draft", "title", "body", "comment", "review"],
		async list(cursor) {
			const skip = cursor === undefined ? 0 : Number(cursor);
			if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100_000) throw new Error("Invalid pull request page cursor.");
			const values = list(item(await request("GET", api("pullrequests", `searchCriteria.status=active&$top=50&$skip=${skip}`))).value), more = values.length >= 50;
			return { repository: remote.repository, requests: values.slice(0, 50).map(value => azureRequest(remote, value)), fetchedAt: new Date().toISOString(), limitReached: more, ...(more ? { nextCursor: String(skip + 50) } : {}) };
		},
		async view(number) {
			const [entry, statusList, threads, commits, viewerInfo] = await Promise.all([
				request("GET", api(`pullrequests/${number}`)).then(item),
				request("GET", api(`pullrequests/${number}/statuses`)).then(value => list(item(value).value), () => []),
				request("GET", api(`pullrequests/${number}/threads`)).then(value => list(item(value).value)),
				request("GET", api(`pullrequests/${number}/commits`, "$top=100")).then(value => list(item(value).value), () => []),
				me(),
			]);
			// Several statuses can share a name as a pipeline runs; the latest (first returned is oldest) wins.
			const byName = new Map<string, PullRequestCheck>();
			for (const value of statusList.map(item)) {
				const context = item(value.context), check = [text(context.genre, 200), text(context.name, 300)].filter(Boolean).join("/"), url = text(value.targetUrl), description = text(value.description, 1000);
				if (check) byName.set(check, { name: check, status: statuses[String(value.state)] ?? "pending", ...(url?.startsWith("https://") ? { url } : {}), ...(description ? { description } : {}) });
			}
			const checkRuns = [...byName.values()], summary = azureRequest(remote, entry, rollup(checkRuns)), current = state(entry.status), createdAt = date(entry.creationDate);
			const headOid = sha(item(entry.lastMergeSourceCommit).commitId), baseOid = sha(item(entry.lastMergeTargetCommit).commitId);
			if (summary.number !== number || !current || !headOid || !baseOid || !createdAt) throw invalid(name, "pull request details");
			const reviewers = list(entry.reviewers).map(item);
			// Votes carry no time, so none is claimed.
			const reviews = reviewers.flatMap(reviewer => { const verdict = vote(reviewer.vote), who = person(reviewer); return verdict && who ? [{ actor: who, state: verdict, submittedAt: "" }] : []; });
			const comments = threads.map(item).filter(thread => thread.isDeleted !== true).flatMap(thread => {
				const path = text(item(thread.threadContext).filePath, 4096)?.replace(/^\//, "");
				return list(thread.comments).map(item).filter(value => value.commentType === "text" || value.commentType === 1).flatMap(value => {
					const body = text(value.content, 200000), at = date(value.publishedDate);
					return body !== undefined && at && value.id !== undefined ? [comment({ id: `${thread.id}-${value.id}`, kind: path ? "review-comment" : "comment", author: person(value.author), body, createdAt: at, ...(date(value.lastContentUpdatedDate) && value.lastContentUpdatedDate !== value.publishedDate ? { editedAt: date(value.lastContentUpdatedDate) } : {}), ...(path ? { path } : {}), canEdit: false })] : [];
				});
			}).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
			const merge = String(entry.mergeStatus ?? ""), autoComplete = text(item(entry.autoCompleteSetBy).displayName, 256);
			const strategy = String(item(entry.completionOptions).mergeStrategy ?? "");
			return view({
				...summary, id: String(number), repository: remote.repository, body: text(entry.description, 200000) ?? "", state: current, createdAt,
				...(current === "MERGED" && date(entry.closedDate) ? { mergedAt: date(entry.closedDate) } : current === "CLOSED" && date(entry.closedDate) ? { closedAt: date(entry.closedDate) } : {}),
				// Azure DevOps reports no line or file totals for a pull request.
				additions: 0, deletions: 0, changedFiles: 0, statsUnknown: true,
				headOid, baseOid, mergeable: merge === "succeeded" ? "MERGEABLE" : merge === "conflicts" ? "CONFLICTING" : "UNKNOWN", mergeState: merge.toUpperCase().slice(0, 100),
				authorActor: person(entry.createdBy), labels: list(entry.labels).flatMap(value => { const label = text(item(value).name, 200); return label && item(value).active !== false ? [{ name: label }] : []; }),
				reviewers: reviewers.filter(reviewer => !vote(reviewer.vote)).map(person).filter(Boolean) as NonNullable<ReturnType<typeof person>>[],
				reviews, checkRuns, comments,
				commits: commits.flatMap(value => { const entry = item(value), author = item(entry.author), made = commit(entry.commitId, entry.comment, author.date, actor(author.name)); return made ? [made] : []; }),
				mergeMethods: ["merge", "squash", "rebase"],
				// Branch policies decide who may complete; Azure DevOps answers for itself when someone may not.
				viewer: { ...(viewerInfo.login ? { login: viewerInfo.login } : {}), canUpdate: true, canMerge: true, canDeleteBranch: false, canEnableAutoMerge: Boolean(viewerInfo.id), canDisableAutoMerge: true },
				autoMergeAllowed: true, ...(autoComplete ? { autoMerge: { method: strategy === "squash" ? "squash" as const : strategy.startsWith("rebase") ? "rebase" as const : "merge" as const, enabledBy: autoComplete } } : {}),
				headRepository: remote.repository, headRefExists: current === "OPEN", behind: false,
			});
		},
		async act(current, action) {
			const path = api(`pullrequests/${current.number}`), patch = (body: unknown) => request("PATCH", path, body);
			switch (action.type) {
				case "merge": case "enable-auto-merge": {
					if (current.state !== "OPEN" || current.draft) throw mergeNotReady(noun);
					const method = chooseMethod(current.mergeMethods, action.method, name), completionOptions = { mergeStrategy: strategies[method] };
					// lastMergeSourceCommit makes Azure DevOps refuse if someone pushed since the person looked.
					if (action.type === "merge") await patch({ status: "completed", lastMergeSourceCommit: { commitId: current.headOid }, completionOptions });
					else await patch({ autoCompleteSetBy: { id: await viewerId() }, completionOptions });
					return;
				}
				case "disable-auto-merge": await patch({ autoCompleteSetBy: { id: "00000000-0000-0000-0000-000000000000" } }); return;
				case "close": case "reopen": await patch({ status: action.type === "close" ? "abandoned" : "active" }); return;
				case "title": await patch({ title: action.title }); return;
				case "body": await patch({ description: action.body }); return;
				case "ready": case "draft": await patch({ isDraft: action.type === "draft" }); return;
				case "comment":
					await request("POST", api(`pullrequests/${current.number}/threads`), { comments: [{ parentCommentId: 0, content: action.body, commentType: 1 }], status: 1 });
					if (action.then) await patch({ status: action.then === "close" ? "abandoned" : "active" });
					return;
				case "review": {
					if (action.comments?.length) throw unsupported(name, noun);
					if (action.event !== "comment") await request("PUT", api(`pullrequests/${current.number}/reviewers/${enc(await viewerId())}`), { vote: action.event === "approve" ? 10 : -5 });
					if (action.body.trim()) await request("POST", api(`pullrequests/${current.number}/threads`), { comments: [{ parentCommentId: 0, content: action.body, commentType: 1 }], status: 1 });
					return;
				}
				default: throw unsupported(name, noun);
			}
		},
		async forBranch(name) {
			const values = list(item(await request("GET", api("pullrequests", `searchCriteria.sourceRefName=${enc(`refs/heads/${name}`)}&searchCriteria.status=all&$top=5`))).value);
			const entry = values.map(item).find((value: Item) => branch(value.sourceRefName) === name);
			if (!entry) return null;
			const summary = azureRequest(remote, entry), current = state(entry.status);
			return current ? { repository: remote.repository, number: summary.number, url: summary.url, title: summary.title.slice(0, 500), state: current, draft: summary.draft } : null;
		},
		async create(input) {
			const created = item(await request("POST", api("pullrequests"), { sourceRefName: `refs/heads/${input.head}`, targetRefName: `refs/heads/${input.base}`, title: input.title, description: input.body }));
			if (!Number.isSafeInteger(created.pullRequestId)) throw invalid(name, "the new pull request");
			return { number: Number(created.pullRequestId), url: codeHostRequestUrl(remote, Number(created.pullRequestId)) };
		},
	};
}
