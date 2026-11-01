import { codeHostRequestUrl, type CodeHostRemote } from "../../shared/codeHosts";
import type { PullRequest } from "../../shared/pullRequests";
import type { PullRequestCheck, PullRequestCheckStatus, PullRequestMergeMethod, PullRequestReviewState } from "../../shared/pullRequestView";
import { actor, chooseMethod, comment, commit, count, date, enc, invalid, item, list, mergeNotReady, reviewDecision, rollup, sha, text, unsupported, view, type CodeHostProvider, type Item } from "./common";
import type { HostRequest } from "./transport";

const name = "Bitbucket", noun = "pull request";
const statuses: Record<string, PullRequestCheckStatus> = { SUCCESSFUL: "success", FAILED: "failure", STOPPED: "cancelled", INPROGRESS: "pending" };
const state = (value: unknown) => value === "OPEN" ? "OPEN" : value === "MERGED" ? "MERGED" : value === "DECLINED" || value === "SUPERSEDED" ? "CLOSED" : undefined;
const person = (value: unknown) => { const user = item(value); return actor(user.nickname ?? user.display_name, item(item(user.links).avatar).href, user.type === "app_user"); };

export function bitbucketRequest(remote: CodeHostRemote, value: unknown, checks: PullRequest["checks"] = "unknown", review: PullRequest["review"] = "none"): PullRequest {
	const entry = item(value), number = entry.id;
	const title = text(entry.title), head = text(item(item(entry.source).branch).name, 1000), base = text(item(item(entry.destination).branch).name, 1000), updatedAt = date(entry.updated_on);
	if (!Number.isSafeInteger(number) || Number(number) < 1 || title === undefined || head === undefined || base === undefined || !updatedAt) throw invalid(name, "a pull request");
	const who = person(entry.author);
	return { number: Number(number), title, url: codeHostRequestUrl(remote, Number(number)), author: who?.login ?? "Unknown author", draft: entry.draft === true, head, base, updatedAt, review, checks, ...(who?.avatarUrl ? { authorAvatarUrl: who.avatarUrl } : {}), ...(date(entry.created_on) ? { createdAt: date(entry.created_on) } : {}) };
}

/** A participant's verdict on the pull request, the way GitHub's reviews read. */
const verdict = (participant: Item): PullRequestReviewState | undefined => participant.state === "changes_requested" ? "CHANGES_REQUESTED" : participant.approved === true || participant.state === "approved" ? "APPROVED" : undefined;

export function bitbucketProvider(remote: CodeHostRemote, request: HostRequest): CodeHostProvider {
	const repo = `repositories/${remote.repository.split("/").map(enc).join("/")}`, pull = (number: number) => `${repo}/pullrequests/${number}`;
	let viewer: Promise<string | undefined> | undefined;
	const me = () => viewer ??= request("GET", "user").then(value => text(item(value).nickname, 256) ?? text(item(value).display_name, 256), () => { viewer = undefined; return undefined; });
	// Bitbucket's pull requests name commits by a 12-character prefix; the full id comes from the commit itself.
	const fullSha = async (value: unknown) => sha(value) ?? (typeof value === "string" && /^[a-f0-9]{7,40}$/i.test(value) ? sha(item(await request("GET", `${repo}/commit/${value}`)).hash) : undefined);
	/** Every page of a paged list, up to `pages`. Bitbucket's `next` links are absolute, so only their page number is followed. */
	const pages = async (path: string, limit: number) => {
		const values: unknown[] = [];
		let more = false;
		for (let page = 1; page <= limit; page++) {
			const body = item(await request("GET", `${path}${path.includes("?") ? "&" : "?"}page=${page}`));
			values.push(...list(body.values));
			more = typeof body.next === "string";
			if (!more) break;
		}
		return { values, more };
	};
	return {
		remote,
		actions: ["merge", "close", "ready", "draft", "title", "body", "comment", "review"],
		async list(cursor) {
			const page = cursor === undefined ? 1 : Number(cursor);
			if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("Invalid pull request page cursor.");
			const body = item(await request("GET", `${repo}/pullrequests?state=OPEN&sort=-updated_on&pagelen=50&page=${page}`)), more = typeof body.next === "string";
			return { repository: remote.repository, requests: list(body.values).slice(0, 50).map(value => bitbucketRequest(remote, value)), fetchedAt: new Date().toISOString(), limitReached: more, ...(more ? { nextCursor: String(page + 1) } : {}) };
		},
		async view(number) {
			const entry = item(await request("GET", pull(number)));
			const [headOid, baseOid, checks, comments, commits, diffstat, permission, viewerName] = await Promise.all([
				fullSha(item(item(entry.source).commit).hash), fullSha(item(item(entry.destination).commit).hash),
				pages(`${pull(number)}/statuses?pagelen=100`, 1).catch(() => ({ values: [], more: false })),
				pages(`${pull(number)}/comments?pagelen=100`, 3),
				pages(`${pull(number)}/commits?pagelen=50`, 1).catch(() => ({ values: [], more: false })),
				pages(`${pull(number)}/diffstat?pagelen=500`, 5).catch(() => undefined),
				request("GET", `user/permissions/repositories?q=${enc(`repository.full_name="${remote.repository}"`)}`).then(value => String(item(list(item(value).values)[0]).permission ?? ""), () => ""),
				me(),
			]);
			const checkRuns: PullRequestCheck[] = checks.values.flatMap(value => { const entry = item(value), check = text(entry.name, 500) ?? text(entry.key, 500), url = text(entry.url), description = text(entry.description, 1000); return check ? [{ name: check, status: statuses[String(entry.state)] ?? "pending", ...(url?.startsWith("https://") ? { url } : {}), ...(description ? { description } : {}) }] : []; });
			const participants = list(entry.participants).map(item);
			const reviews = participants.flatMap(participant => { const verdictState = verdict(participant), who = person(participant.user), at = date(participant.participated_on); return verdictState && who && at ? [{ actor: who, state: verdictState, submittedAt: at }] : []; });
			const reviewers = list(entry.reviewers).map(person).filter(who => who && !reviews.some(review => review.actor?.login === who.login)) as NonNullable<ReturnType<typeof person>>[];
			const summary = bitbucketRequest(remote, entry, rollup(checkRuns), reviewDecision(reviews)), current = state(entry.state), createdAt = date(entry.created_on);
			if (summary.number !== number || !current || !headOid || !baseOid || !createdAt) throw invalid(name, "pull request details");
			const files = diffstat?.values.map(item) ?? [], conflicting = files.some(file => String(file.status ?? "").includes("conflict"));
			const canMerge = permission === "write" || permission === "admin";
			const mergeMethods: PullRequestMergeMethod[] = ["merge", "squash"];
			return view({
				...summary, id: String(number), repository: remote.repository, body: text(item(entry.summary).raw, 200000) ?? text(entry.description, 200000) ?? "", state: current, createdAt,
				...(current !== "OPEN" && date(entry.updated_on) ? current === "MERGED" ? { mergedAt: date(entry.updated_on) } : { closedAt: date(entry.updated_on) } : {}),
				additions: files.reduce((sum, file) => sum + count(file.lines_added), 0), deletions: files.reduce((sum, file) => sum + count(file.lines_removed), 0), changedFiles: files.length,
				...(!diffstat || diffstat.more ? { statsUnknown: true } : {}),
				headOid, baseOid, mergeable: current !== "OPEN" || !diffstat ? "UNKNOWN" : conflicting ? "CONFLICTING" : "MERGEABLE", mergeState: conflicting ? "DIRTY" : "UNKNOWN",
				authorActor: person(entry.author), labels: [], reviewers, reviews, checkRuns,
				comments: comments.values.map(item).filter(value => value.deleted !== true).flatMap(value => {
					const body = text(item(value.content).raw, 200000), at = date(value.created_on), inline = item(value.inline), url = text(item(item(value.links).html).href), path = text(inline.path, 4096);
					return body !== undefined && at && value.id !== undefined ? [comment({ id: String(value.id), kind: path ? "review-comment" : "comment", author: person(value.user), body, createdAt: at, ...(date(value.updated_on) && value.updated_on !== value.created_on ? { editedAt: date(value.updated_on) } : {}), ...(url?.startsWith("https://") ? { url } : {}), ...(path ? { path } : {}), canEdit: false })] : [];
				}),
				commentsTruncated: comments.more,
				commits: commits.values.flatMap(value => { const entry = item(value), made = commit(entry.hash, entry.message, entry.date, person(item(entry.author).user) ?? actor(text(item(entry.author).raw)?.replace(/\s*<[^>]*>$/, ""))); return made ? [made] : []; }).reverse(),
				mergeMethods, viewer: { ...(viewerName ? { login: viewerName } : {}), canUpdate: canMerge || viewerName === summary.author, canMerge, canDeleteBranch: false, canEnableAutoMerge: false, canDisableAutoMerge: false },
				autoMergeAllowed: false, headRepository: text(item(item(entry.source).repository).full_name, 300) ?? remote.repository, headRefExists: current === "OPEN", behind: false,
			});
		},
		async act(current, action) {
			const path = pull(current.number);
			switch (action.type) {
				case "merge": {
					if (current.state !== "OPEN" || current.draft) throw mergeNotReady(noun);
					const method = chooseMethod(current.mergeMethods, action.method, name);
					// Bitbucket's merge has no head guard, so the head is read again right before merging.
					const fresh = await fullSha(item(item(item(await request("GET", path)).source).commit).hash);
					if (fresh !== current.headOid) throw new Error("This pull request changed. It has been refreshed; check it and try again.");
					await request("POST", `${path}/merge`, { merge_strategy: method === "squash" ? "squash" : "merge_commit" }); return;
				}
				case "close": await request("POST", `${path}/decline`); return;
				case "title": await request("PUT", path, { title: action.title }); return;
				case "body": await request("PUT", path, { description: action.body }); return;
				case "ready": case "draft": await request("PUT", path, { draft: action.type === "draft" }); return;
				case "comment":
					if (action.then === "reopen") throw new Error("Bitbucket can't reopen a declined pull request.");
					await request("POST", `${path}/comments`, { content: { raw: action.body } });
					if (action.then === "close") await request("POST", `${path}/decline`);
					return;
				case "review":
					if (action.comments?.length) throw unsupported(name, noun);
					if (action.event === "approve") await request("POST", `${path}/approve`);
					if (action.event === "request-changes") await request("POST", `${path}/request-changes`);
					if (action.body.trim()) await request("POST", `${path}/comments`, { content: { raw: action.body } });
					return;
				default: throw unsupported(name, noun);
			}
		},
		async forBranch(branch) {
			const body = item(await request("GET", `${repo}/pullrequests?state=OPEN&state=MERGED&state=DECLINED&sort=-updated_on&pagelen=5&q=${enc(`source.branch.name="${branch.replaceAll("\"", "")}"`)}`));
			const entry = list(body.values).map(item).find(value => item(item(value.source).branch).name === branch);
			if (!entry) return null;
			const summary = bitbucketRequest(remote, entry), current = state(entry.state);
			return current ? { repository: remote.repository, number: summary.number, url: summary.url, title: summary.title.slice(0, 500), state: current, draft: summary.draft } : null;
		},
		async create(input) {
			const created = item(await request("POST", `${repo}/pullrequests`, { title: input.title, description: input.body, source: { branch: { name: input.head } }, destination: { branch: { name: input.base } } }));
			if (!Number.isSafeInteger(created.id)) throw invalid(name, "the new pull request");
			return { number: Number(created.id), url: codeHostRequestUrl(remote, Number(created.id)) };
		},
	};
}
