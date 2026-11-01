import { codeHostRequestUrl, type CodeHostRemote } from "../../shared/codeHosts";
import type { PullRequest } from "../../shared/pullRequests";
import type { PullRequestCheck, PullRequestCheckStatus, PullRequestMergeMethod, PullRequestReviewState } from "../../shared/pullRequestView";
import { actor, chooseMethod, comment, commit, count, date, draftTitle, enc, invalid, item, list, mergeNotReady, reviewDecision, rollup, sha, text, unsupported, view, type CodeHostProvider, type Item } from "./common";
import type { HostRequest } from "./transport";

const name = "Forgejo", noun = "pull request";
const statuses: Record<string, PullRequestCheckStatus> = { success: "success", failure: "failure", error: "failure", warning: "neutral", pending: "pending" };
const reviewStates: Record<string, PullRequestReviewState> = { APPROVED: "APPROVED", REQUEST_CHANGES: "CHANGES_REQUESTED", COMMENT: "COMMENTED" };
const state = (entry: Record<string, unknown>) => entry.merged === true ? "MERGED" : entry.state === "open" ? "OPEN" : entry.state === "closed" ? "CLOSED" : undefined;
const isDraft = (entry: Record<string, unknown>) => entry.draft === true || draftTitle.test(String(entry.title ?? ""));

export function forgejoRequest(remote: CodeHostRemote, value: unknown, checks: PullRequest["checks"] = "unknown"): PullRequest {
	const entry = item(value), number = entry.number, user = item(entry.user);
	const title = text(entry.title), head = text(item(entry.head).ref, 1000), base = text(item(entry.base).ref, 1000), updatedAt = date(entry.updated_at);
	if (!Number.isSafeInteger(number) || Number(number) < 1 || title === undefined || head === undefined || base === undefined || !updatedAt) throw invalid(name, "a pull request");
	const who = actor(user.login, user.avatar_url);
	return { number: Number(number), title, url: codeHostRequestUrl(remote, Number(number)), author: who?.login ?? "Unknown author", draft: isDraft(entry), head, base, updatedAt, review: "none", checks, ...(who?.avatarUrl ? { authorAvatarUrl: who.avatarUrl } : {}), ...(sha(item(entry.head).sha) ? { headOid: sha(item(entry.head).sha) } : {}), ...(date(entry.created_at) ? { createdAt: date(entry.created_at) } : {}) };
}

export function forgejoProvider(remote: CodeHostRemote, request: HostRequest): CodeHostProvider {
	const repo = `repos/${remote.repository.split("/").map(enc).join("/")}`;
	let viewer: Promise<string | undefined> | undefined;
	const me = () => viewer ??= request("GET", "user").then(value => text(item(value).login, 256), () => { viewer = undefined; return undefined; });
	return {
		remote,
		actions: ["merge", "enable-auto-merge", "disable-auto-merge", "close", "reopen", "ready", "draft", "title", "body", "comment", "review"],
		async list(cursor) {
			const page = cursor === undefined ? 1 : Number(cursor);
			if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("Invalid pull request page cursor.");
			const values = list(await request("GET", `${repo}/pulls?state=open&sort=recentupdate&limit=50&page=${page}`));
			const more = values.length >= 50;
			return { repository: remote.repository, requests: values.slice(0, 50).map(value => forgejoRequest(remote, value)), fetchedAt: new Date().toISOString(), limitReached: more, ...(more ? { nextCursor: String(page + 1) } : {}) };
		},
		async view(number) {
			const entry = item(await request("GET", `${repo}/pulls/${number}`)), head = sha(item(entry.head).sha), baseOid = sha(item(entry.base).sha) ?? sha(entry.merge_base);
			const [status, reviewList, comments, commits, repository, viewerName] = await Promise.all([
				head ? request("GET", `${repo}/commits/${head}/status`).then(item, () => ({})) : Promise.resolve({}),
				request("GET", `${repo}/pulls/${number}/reviews?limit=50`).then(list, () => []),
				request("GET", `${repo}/issues/${number}/comments?limit=100`).then(list),
				request("GET", `${repo}/pulls/${number}/commits?limit=50&stat=false&verification=false&files=false`).then(list, () => []),
				request("GET", repo).then(item, (): Item => ({})),
				me(),
			]);
			const checkRuns: PullRequestCheck[] = list(item(status).statuses).flatMap(value => { const entry = item(value), check = text(entry.context, 500), url = text(entry.target_url), description = text(entry.description, 1000); return check ? [{ name: check, status: statuses[String(entry.status)] ?? "pending", ...(url?.startsWith("https://") ? { url } : {}), ...(description ? { description } : {}) }] : []; });
			const latest = new Map<string, { actor: ReturnType<typeof actor>; state: PullRequestReviewState; submittedAt: string }>();
			for (const value of reviewList) {
				const review = item(value), who = actor(item(review.user).login, item(review.user).avatar_url), mapped = reviewStates[String(review.state)], at = date(review.submitted_at);
				if (who && mapped && at && review.dismissed !== true && (mapped !== "COMMENTED" || !latest.has(who.login))) latest.set(who.login, { actor: who, state: mapped, submittedAt: at });
			}
			const reviews = [...latest.values()];
			const summary = forgejoRequest(remote, entry, rollup(checkRuns)), current = state(entry), createdAt = date(entry.created_at);
			if (summary.number !== number || !current || !head || !baseOid || !createdAt) throw invalid(name, "pull request details");
			const permissions = item(repository.permissions), canMerge = permissions.push === true || permissions.admin === true;
			const mergeMethods: PullRequestMergeMethod[] = [...(repository.allow_merge_commits !== false ? ["merge" as const] : []), ...(repository.allow_squash_merge !== false ? ["squash" as const] : []), ...(repository.allow_rebase !== false ? ["rebase" as const] : [])];
			const authorName = item(entry.user).login;
			return view({
				...summary, review: reviewDecision(reviews), id: String(entry.id ?? number), repository: remote.repository, body: text(entry.body, 200000) ?? "", state: current, createdAt,
				...(date(entry.merged_at) ? { mergedAt: date(entry.merged_at) } : {}), ...(date(entry.closed_at) ? { closedAt: date(entry.closed_at) } : {}),
				additions: count(entry.additions), deletions: count(entry.deletions), changedFiles: count(entry.changed_files), ...(typeof entry.additions === "number" ? {} : { statsUnknown: true }),
				headOid: head, baseOid, mergeable: current !== "OPEN" ? "UNKNOWN" : entry.mergeable === true ? "MERGEABLE" : entry.mergeable === false ? "CONFLICTING" : "UNKNOWN", mergeState: entry.mergeable === false ? "DIRTY" : "UNKNOWN",
				authorActor: actor(authorName, item(entry.user).avatar_url),
				labels: list(entry.labels).flatMap(value => { const label = item(value), labelName = text(label.name, 200), color = text(label.color, 7)?.replace(/^#/, ""); return labelName ? [{ name: labelName, ...(color && /^[0-9a-f]{6}$/i.test(color) ? { color } : {}) }] : []; }),
				reviewers: list(entry.requested_reviewers).map(value => actor(item(value).login, item(value).avatar_url)).filter(Boolean) as NonNullable<ReturnType<typeof actor>>[],
				reviews, checkRuns,
				comments: comments.map(item).flatMap(value => { const body = text(value.body, 200000), at = date(value.created_at), url = text(value.html_url); return body !== undefined && at && value.id !== undefined ? [comment({ id: String(value.id), kind: "comment", author: actor(item(value.user).login, item(value.user).avatar_url), body, createdAt: at, ...(date(value.updated_at) && value.updated_at !== value.created_at ? { editedAt: date(value.updated_at) } : {}), ...(url?.startsWith("https://") ? { url } : {}), canEdit: false })] : []; }),
				commentsTruncated: comments.length >= 100,
				commits: commits.flatMap(value => { const entry = item(value), detail = item(entry.commit), made = commit(entry.sha, detail.message, item(detail.author).date, actor(item(entry.author).login ?? item(detail.author).name, item(entry.author).avatar_url)); return made ? [made] : []; }),
				mergeMethods, viewer: { ...(viewerName ? { login: viewerName } : {}), canUpdate: canMerge || viewerName === authorName, canMerge, canDeleteBranch: false, canEnableAutoMerge: canMerge, canDisableAutoMerge: canMerge },
				autoMergeAllowed: canMerge, headRepository: text(item(item(entry.head).repo).full_name, 300) ?? remote.repository, headRefExists: current === "OPEN", behind: false,
			});
		},
		async act(current, action) {
			const pull = `${repo}/pulls/${current.number}`;
			switch (action.type) {
				case "merge": case "enable-auto-merge": {
					if (current.state !== "OPEN" || current.draft) throw mergeNotReady(noun);
					const method = chooseMethod(current.mergeMethods, action.method, name);
					// head_commit_id makes the host refuse if someone pushed since the person looked.
					await request("POST", `${pull}/merge`, { Do: method, head_commit_id: current.headOid, ...(action.type === "enable-auto-merge" ? { merge_when_checks_succeed: true } : {}) }); return;
				}
				case "disable-auto-merge": await request("DELETE", `${pull}/merge`); return;
				case "close": case "reopen": await request("PATCH", pull, { state: action.type === "close" ? "closed" : "open" }); return;
				case "title": await request("PATCH", pull, { title: current.draft ? `WIP: ${action.title.replace(draftTitle, "")}` : action.title }); return;
				case "body": await request("PATCH", pull, { body: action.body }); return;
				case "ready": await request("PATCH", pull, { title: current.title.replace(draftTitle, "") }); return;
				case "draft": await request("PATCH", pull, { title: `WIP: ${current.title.replace(draftTitle, "")}` }); return;
				case "comment":
					await request("POST", `${repo}/issues/${current.number}/comments`, { body: action.body });
					if (action.then) await request("PATCH", pull, { state: action.then === "close" ? "closed" : "open" });
					return;
				case "review":
					if (action.comments?.length) throw unsupported(name, noun);
					await request("POST", `${pull}/reviews`, { event: action.event === "approve" ? "APPROVED" : action.event === "request-changes" ? "REQUEST_CHANGES" : "COMMENT", body: action.body, commit_id: current.headOid }); return;
				default: throw unsupported(name, noun);
			}
		},
		async forBranch(branch) {
			const values = list(await request("GET", `${repo}/pulls?state=all&sort=recentupdate&limit=50`)).map(item);
			const entry = values.find(value => item(value.head).ref === branch && item(item(value.head).repo).full_name === item(item(value.base).repo).full_name);
			if (!entry) return null;
			const summary = forgejoRequest(remote, entry), current = state(entry);
			return current ? { repository: remote.repository, number: summary.number, url: summary.url, title: summary.title.slice(0, 500), state: current, draft: summary.draft } : null;
		},
		async create(input) {
			const created = item(await request("POST", `${repo}/pulls`, { head: input.head, base: input.base, title: input.title, body: input.body }));
			if (!Number.isSafeInteger(created.number)) throw invalid(name, "the new pull request");
			return { number: Number(created.number), url: codeHostRequestUrl(remote, Number(created.number)) };
		},
	};
}
