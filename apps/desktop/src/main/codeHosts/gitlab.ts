import { codeHostRequestUrl, type CodeHostRemote } from "../../shared/codeHosts";
import type { PullRequest } from "../../shared/pullRequests";
import type { PullRequestCheck, PullRequestCheckStatus, PullRequestMergeMethod, PullRequestReviewState } from "../../shared/pullRequestView";
import { actor, chooseMethod, comment, commit, count, date, draftTitle, enc, invalid, item, list, mergeNotReady, rollup, sha, text, unsupported, view, type CodeHostProvider, type Item } from "./common";
import type { HostRequest } from "./transport";

const name = "GitLab", noun = "merge request";
const state = (value: unknown) => value === "merged" ? "MERGED" : value === "opened" ? "OPEN" : value === "closed" || value === "locked" ? "CLOSED" : undefined;
const jobStatus: Record<string, PullRequestCheckStatus> = { success: "success", failed: "failure", canceled: "cancelled", canceling: "cancelled", skipped: "skipped", manual: "action-required" };
export const gitlabCheck = (job: Item): PullRequestCheck | undefined => {
	const title = text(job.name, 500), status = String(job.status ?? "");
	if (!title) return;
	const mapped = jobStatus[status] ?? "pending", url = text(job.web_url);
	// A job allowed to fail does not fail the pipeline.
	return { name: [text(job.stage, 200), title].filter(Boolean).join(" / "), status: mapped === "failure" && job.allow_failure === true ? "neutral" : mapped, ...(url?.startsWith("https://") ? { url } : {}) };
};

/** One merge request from GitLab's list or detail as a list row. */
export function gitlabRequest(remote: CodeHostRemote, value: unknown, checks: PullRequest["checks"] = "unknown"): PullRequest {
	const entry = item(value), number = entry.iid, author = item(entry.author);
	const title = text(entry.title), head = text(entry.source_branch, 1000), base = text(entry.target_branch, 1000), updatedAt = date(entry.updated_at);
	if (!Number.isSafeInteger(number) || Number(number) < 1 || title === undefined || head === undefined || base === undefined || !updatedAt) throw invalid(name, "a merge request");
	const who = actor(author.username, author.avatar_url);
	return {
		number: Number(number), title, url: codeHostRequestUrl(remote, Number(number)), author: who?.login ?? "Unknown author", draft: entry.draft === true || entry.work_in_progress === true,
		head, base, updatedAt, review: entry.detailed_merge_status === "not_approved" ? "required" : "none", checks, ...(who?.avatarUrl ? { authorAvatarUrl: who.avatarUrl } : {}),
		...(sha(entry.sha) ? { headOid: sha(entry.sha) } : {}), ...(date(entry.created_at) ? { createdAt: date(entry.created_at) } : {}),
	};
}

export function gitlabProvider(remote: CodeHostRemote, request: HostRequest): CodeHostProvider {
	const project = `projects/${enc(remote.repository)}`, mr = (number: number) => `${project}/merge_requests/${number}`;
	let viewer: Promise<string | undefined> | undefined;
	const me = () => viewer ??= request("GET", "user").then(value => text(item(value).username, 256), () => { viewer = undefined; return undefined; });
	const methods = async (): Promise<PullRequestMergeMethod[]> => {
		const option = item(await request("GET", `${project}?license=false&statistics=false`).catch(() => ({}))).squash_option;
		return option === "always" ? ["squash"] : option === "never" ? ["merge"] : ["merge", "squash"];
	};
	const provider: CodeHostProvider = {
		remote,
		actions: ["merge", "enable-auto-merge", "disable-auto-merge", "close", "reopen", "ready", "draft", "title", "body", "comment", "review", "label"],
		async list(cursor) {
			const page = cursor === undefined ? 1 : Number(cursor);
			if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("Invalid merge request page cursor.");
			const values = list(await request("GET", `${project}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=100&page=${page}`));
			const requests = values.slice(0, 100).map(value => gitlabRequest(remote, value));
			const more = values.length >= 100;
			return { repository: remote.repository, requests, fetchedAt: new Date().toISOString(), limitReached: more, ...(more ? { nextCursor: String(page + 1) } : {}) };
		},
		async view(number) {
			const [entry, approvals, notes, commits, viewerName, mergeMethods] = await Promise.all([
				request("GET", mr(number)).then(item),
				request("GET", `${mr(number)}/approvals`).then(item, () => ({} as Item)),
				request("GET", `${mr(number)}/notes?sort=asc&order_by=created_at&per_page=100`).then(list),
				request("GET", `${mr(number)}/commits?per_page=100`).then(list, () => []),
				me(), methods(),
			]);
			const pipeline = item(entry.head_pipeline), pipelineId = pipeline.id;
			const jobs = Number.isSafeInteger(pipelineId) ? list(await request("GET", `${project}/pipelines/${pipelineId}/jobs?per_page=100`).catch(() => [])) : [];
			const checkRuns = jobs.flatMap(job => { const check = gitlabCheck(item(job)); return check ? [check] : []; });
			if (!checkRuns.length && typeof pipeline.status === "string") checkRuns.push(gitlabCheck({ name: "Pipeline", status: pipeline.status, web_url: pipeline.web_url })!);
			const summary = gitlabRequest(remote, entry, rollup(checkRuns)), refs = item(entry.diff_refs), status = state(entry.state);
			const headOid = sha(refs.head_sha) ?? sha(entry.sha), baseOid = sha(refs.base_sha), createdAt = date(entry.created_at);
			if (summary.number !== number || !status || !headOid || !baseOid || !createdAt) throw invalid(name, "merge request details");
			const approvedBy = list(approvals.approved_by).map(value => actor(item(item(value).user).username, item(item(value).user).avatar_url)).filter(Boolean);
			// Approvals carry no time of their own, so none is claimed.
			const approvedAt = "";
			const reviews = approvedBy.map(who => ({ actor: who, state: "APPROVED" as PullRequestReviewState, submittedAt: approvedAt }));
			const merge = String(entry.detailed_merge_status ?? entry.merge_status ?? "");
			const canMerge = item(entry.user).can_merge === true, authorName = item(entry.author).username;
			const autoMerge = entry.merge_when_pipeline_succeeds === true || entry.auto_merge === true;
			return view({
				...summary, review: approvedBy.length && count(approvals.approvals_left) === 0 ? "approved" : count(approvals.approvals_left) > 0 ? "required" : "none",
				id: String(entry.id ?? number), repository: remote.repository, body: text(entry.description, 200000) ?? "", state: status, createdAt,
				...(date(entry.merged_at) ? { mergedAt: date(entry.merged_at) } : {}), ...(date(entry.closed_at) ? { closedAt: date(entry.closed_at) } : {}),
				// GitLab's detail has no line totals, and counting them would mean reading the whole diff.
				additions: 0, deletions: 0, statsUnknown: true, changedFiles: count(entry.changes_count),
				headOid, baseOid, mergeable: entry.has_conflicts === true ? "CONFLICTING" : merge === "mergeable" ? "MERGEABLE" : "UNKNOWN", mergeState: merge.toUpperCase().slice(0, 100),
				authorActor: actor(authorName, item(entry.author).avatar_url), labels: list(entry.labels).flatMap(label => typeof label === "string" && label.length <= 200 ? [{ name: label }] : []),
				reviewers: list(entry.reviewers).map(value => actor(item(value).username, item(value).avatar_url)).filter(who => who && !approvedBy.some(approved => approved?.login === who.login)) as NonNullable<ReturnType<typeof actor>>[],
				reviews, checkRuns,
				comments: notes.map(item).filter(note => note.system !== true).flatMap(note => {
					const body = text(note.body, 200000), createdAt = date(note.created_at), position = item(note.position);
					if (body === undefined || !createdAt || note.id === undefined) return [];
					const path = text(position.new_path, 4096) ?? text(position.old_path, 4096);
					return [comment({ id: String(note.id), kind: note.type === "DiffNote" ? "review-comment" : "comment", author: actor(item(note.author).username, item(note.author).avatar_url), body, createdAt, ...(date(note.updated_at) && note.updated_at !== note.created_at ? { editedAt: date(note.updated_at) } : {}), url: `${summary.url}#note_${note.id}`, ...(path ? { path } : {}), canEdit: false })];
				}),
				commentsTruncated: notes.length >= 100,
				commits: commits.flatMap(value => { const entry = item(value), made = commit(entry.id, entry.title, entry.committed_date ?? entry.created_at, actor(entry.author_name)); return made ? [made] : []; }).reverse(),
				mergeMethods, viewer: { ...(viewerName ? { login: viewerName } : {}), canUpdate: canMerge || (viewerName !== undefined && viewerName === authorName), canMerge, canDeleteBranch: false, canEnableAutoMerge: canMerge && Number.isSafeInteger(pipelineId), canDisableAutoMerge: canMerge },
				autoMergeAllowed: Number.isSafeInteger(pipelineId), ...(autoMerge ? { autoMerge: { method: entry.squash === true ? "squash" as const : "merge" as const, ...(text(item(entry.merge_user).username) ? { enabledBy: text(item(entry.merge_user).username) } : {}) } } : {}),
				...(entry.source_project_id === entry.target_project_id ? { headRepository: remote.repository } : {}), headRefExists: status === "OPEN", behind: merge === "need_rebase",
			});
		},
		async act(current, action) {
			const path = mr(current.number), put = (body: unknown) => request("PUT", path, body);
			switch (action.type) {
				case "merge": case "enable-auto-merge": {
					if (current.state !== "OPEN" || current.draft) throw mergeNotReady(noun);
					const method = chooseMethod(current.mergeMethods, action.method, name);
					// The sha guard makes GitLab refuse if someone pushed since the person looked.
					await request("PUT", `${path}/merge`, { sha: current.headOid, squash: method === "squash", ...(action.type === "enable-auto-merge" ? { merge_when_pipeline_succeeds: true, auto_merge: true } : {}) }); return;
				}
				case "disable-auto-merge": await request("POST", `${path}/cancel_merge_when_pipeline_succeeds`); return;
				case "close": case "reopen": await put({ state_event: action.type }); return;
				case "title": await put({ title: current.draft ? `Draft: ${action.title.replace(draftTitle, "")}` : action.title }); return;
				case "body": await put({ description: action.body }); return;
				case "ready": await put({ title: current.title.replace(draftTitle, "") }); return;
				case "draft": await put({ title: `Draft: ${current.title.replace(draftTitle, "")}` }); return;
				case "comment":
					await request("POST", `${path}/notes`, { body: action.body });
					if (action.then) await put({ state_event: action.then });
					return;
				case "review":
					if (action.comments?.length) throw unsupported(name, noun);
					if (action.event === "request-changes") throw new Error("GitLab has no request-changes verdict. Leave a comment instead.");
					if (action.event === "approve") await request("POST", `${path}/approve`, { sha: current.headOid });
					if (action.body.trim()) await request("POST", `${path}/notes`, { body: action.body });
					return;
				case "label": await put(action.applied ? { add_labels: action.name } : { remove_labels: action.name }); return;
				default: throw unsupported(name, noun);
			}
		},
		async forBranch(branch) {
			const values = list(await request("GET", `${project}/merge_requests?source_branch=${enc(branch)}&order_by=updated_at&sort=desc&per_page=5`));
			const entry = values.map(item).find(value => value.source_branch === branch);
			if (!entry) return null;
			const summary = gitlabRequest(remote, entry), status = state(entry.state);
			return status ? { repository: remote.repository, number: summary.number, url: summary.url, title: summary.title.slice(0, 500), state: status, draft: summary.draft } : null;
		},
		async create(input) {
			const created = item(await request("POST", `${project}/merge_requests`, { source_branch: input.head, target_branch: input.base, title: input.title, description: input.body, remove_source_branch: false }));
			if (!Number.isSafeInteger(created.iid)) throw invalid(name, "the new merge request");
			return { number: Number(created.iid), url: codeHostRequestUrl(remote, Number(created.iid)) };
		},
	};
	return provider;
}
