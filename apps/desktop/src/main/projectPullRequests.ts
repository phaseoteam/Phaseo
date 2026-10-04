import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "./gitProcess";
import { resolveNativeCommand } from "./nativeProcess";
import type { ProjectPullRequests, PullRequest } from "../shared/pullRequests";

const execute = promisify(execFile);
const query = `query PhaseoPullRequests($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){pullRequests(first:100,after:$after,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title author{login} isDraft headRefName baseRefName updatedAt reviewDecision commits(last:1){nodes{commit{statusCheckRollup{state}}}}}pageInfo{hasNextPage endCursor}}}}`;
export function githubRepository(remote: string): string {
	const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
	if (!match || [match[1], match[2]].some(value => value === "." || value === "..")) throw new Error("Choose a project with a github.com origin remote.");
	return `${match[1]}/${match[2]}`;
}
function checks(values: unknown): PullRequest["checks"] {
	if (!Array.isArray(values)) return "unknown";
	if (!values.length) return "none";
	const states = values.map(value => {
		if (!value || typeof value !== "object") return "unknown";
		const item = value as Record<string, unknown>, state = item.state ?? (item.status === "COMPLETED" ? item.conclusion : item.status);
		if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(String(state))) return "passing";
		if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes(String(state))) return "failed";
		if (["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "PENDING_DEPLOYMENT"].includes(String(state))) return "pending";
		return "unknown";
	});
	return states.includes("failed") ? "failed" : states.includes("pending") ? "pending" : states.includes("unknown") ? "unknown" : "passing";
}
export function parsePullRequests(repository: string, value: unknown): PullRequest[] {
	if (!Array.isArray(value) || value.length > 100) throw new Error("GitHub returned an invalid pull-request list.");
	const numbers = new Set<number>();
	return value.map(entry => {
		const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
		const author = item.author && typeof item.author === "object" ? (item.author as Record<string, unknown>).login : "Unknown author";
		if (!Number.isSafeInteger(item.number) || Number(item.number) < 1 || numbers.has(Number(item.number)) || typeof item.isDraft !== "boolean" || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt)) || [item.title, item.headRefName, item.baseRefName, author].some(text => typeof text !== "string" || text.length > 2000)) throw new Error("GitHub returned an invalid pull request.");
		numbers.add(Number(item.number));
		return { number: Number(item.number), title: item.title as string, url: `https://github.com/${repository}/pull/${item.number}`, author: author as string, draft: item.isDraft, head: item.headRefName as string, base: item.baseRefName as string, updatedAt: item.updatedAt,
			review: item.reviewDecision === "APPROVED" ? "approved" : item.reviewDecision === "CHANGES_REQUESTED" ? "changes-requested" : item.reviewDecision === "REVIEW_REQUIRED" ? "required" : "none", checks: checks(item.statusCheckRollup) };
	});
}
export async function projectPullRequests(root: string, cursor?: unknown): Promise<ProjectPullRequests> {
	if (cursor !== undefined && (typeof cursor !== "string" || !cursor.length || cursor.length > 2048 || /[^\x20-\x7e]/.test(cursor))) throw new Error("Invalid pull-request page cursor.");
	let remote: string;
	try { remote = await git(root, ["remote", "get-url", "origin"]); } catch { throw new Error("Choose a Git repository with an origin remote."); }
	const repository = githubRepository(remote);
	let command: Awaited<ReturnType<typeof resolveNativeCommand>>;
	try { command = await resolveNativeCommand("gh"); } catch { throw new Error("Install GitHub CLI and sign in with gh auth login."); }
	let output: string;
	const [owner, name] = repository.split("/");
	try { output = (await execute(command.executable, [...command.prefix, "api", "graphql", "--hostname", "github.com", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`, ...(cursor === undefined ? [] : ["-f", `after=${cursor}`])], { cwd: root, windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_DEBUG: "" } })).stdout; }
	catch (reason) { if ((reason as NodeJS.ErrnoException)?.code === "ENOENT") throw new Error("Install GitHub CLI and sign in with gh auth login.", { cause: reason }); throw new Error("Could not load pull requests. Check GitHub CLI sign-in and repository access, then retry.", { cause: reason }); }
	let parsed: unknown;
	try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned an unreadable pull-request list."); }
	const response = parsed as { errors?: unknown[]; data?: { repository?: { pullRequests?: { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: unknown } } } } } | null;
	const page = response?.data?.repository?.pullRequests;
	if (response?.errors?.length || !Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== "boolean") throw new Error("GitHub returned an incomplete pull-request list.");
	const nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
	if (page.pageInfo.hasNextPage && (typeof nextCursor !== "string" || !nextCursor.length || nextCursor.length > 2048 || /[^\x20-\x7e]/.test(nextCursor) || nextCursor === cursor || !page.nodes.length)) throw new Error("GitHub returned an invalid next-page cursor.");
	const requests = parsePullRequests(repository, page.nodes.map(entry => {
		const item = entry as Record<string, unknown> | null;
		const commits = item?.commits as { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] } | undefined;
		const commit = commits?.nodes?.[0]?.commit;
		return { ...item, statusCheckRollup: !commit ? null : commit.statusCheckRollup === null ? [] : [{ state: commit.statusCheckRollup?.state }] };
	}));
	return { repository, requests, fetchedAt: new Date().toISOString(), limitReached: page.pageInfo.hasNextPage, nextCursor: nextCursor as string | undefined };
}
