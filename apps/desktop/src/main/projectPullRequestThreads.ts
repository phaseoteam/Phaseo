import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { resolveNativeCommand } from "./nativeProcess";
import { reviewCursor, reviewNodeId, validatePullRequestThreadsQuery, type PullRequestThreadsPage, type PullRequestThreadsQuery, type ReviewComment, type ReviewThread } from "../shared/pullRequestThreads";

const execute = promisify(execFile);
const identity = "number headRefOid baseRefOid repository{nameWithOwner}";
const threadsQuery = `query PhaseoReviewThreads($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){${identity} reviewThreads(first:20,after:$after){nodes{id path line originalLine diffSide isResolved isOutdated comments{totalCount}}totalCount pageInfo{hasNextPage endCursor}}}}}`;
const commentsQuery = `query PhaseoReviewComments($id:ID!,$after:String){node(id:$id){__typename ... on PullRequestReviewThread{id pullRequest{${identity}} comments(first:5,after:$after){nodes{id author{login} body createdAt}totalCount pageInfo{hasNextPage endCursor}}}}}`;
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("GitHub returned invalid review data."); return value as RecordValue; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647; }
function position(value: unknown): number | undefined { if (value === null || value === undefined) return; if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 10_000_000) throw Error("GitHub returned an invalid review location."); return Number(value); }
function connection(value: unknown, limit: number, cursor?: string) {
	const page = object(value), info = object(page.pageInfo);
	if (!Array.isArray(page.nodes) || page.nodes.length > limit || !count(page.totalCount) || page.nodes.length > page.totalCount || typeof info.hasNextPage !== "boolean") throw Error("GitHub returned an invalid review page.");
	if (info.hasNextPage && (!page.nodes.length || !reviewCursor(info.endCursor) || info.endCursor === cursor)) throw Error("GitHub returned an invalid review cursor.");
	return { nodes: page.nodes, total: page.totalCount, nextCursor: info.hasNextPage ? info.endCursor as string : undefined };
}
function unique<T>(nodes: unknown[], parse: (value: unknown) => T & { id: string }): T[] {
	const seen = new Set<string>();
	return nodes.map(value => { const parsed = parse(value); if (!reviewNodeId(parsed.id) || seen.has(parsed.id)) throw Error("GitHub returned invalid or repeated review identities."); seen.add(parsed.id); return parsed; });
}
export function parsePullRequestThreads(repository: string, query: PullRequestThreadsQuery, value: unknown): PullRequestThreadsPage {
	const encoded = JSON.stringify(value); if (typeof encoded !== "string") throw Error("GitHub returned invalid review data.");
	if (Buffer.byteLength(encoded, "utf8") > 2 * 1024 * 1024) throw Error("Review data exceeds the 2 MiB page limit.");
	const response = object(value); if (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) throw Error("GitHub returned incomplete review data.");
	const data = object(response.data), node = query.type === "threads" ? object(object(data.repository).pullRequest) : object(data.node);
	if (query.type === "comments" && (node.__typename !== "PullRequestReviewThread" || node.id !== query.threadId)) throw Error("This review thread is no longer available.");
	const pullRequest = query.type === "threads" ? node : object(node.pullRequest);
	const returnedRepository = object(pullRequest.repository).nameWithOwner;
	if (pullRequest.number !== query.number || typeof returnedRepository !== "string" || returnedRepository.toLowerCase() !== repository.toLowerCase()) throw Error("GitHub returned review data for another pull request.");
	if (pullRequest.headRefOid !== query.headOid || pullRequest.baseRefOid !== query.baseOid) throw Error("This pull request changed. Refresh details before reading reviews.");
	const page = connection(query.type === "threads" ? node.reviewThreads : node.comments, query.type === "threads" ? 20 : 5, query.cursor);
	const common = { repository, number: query.number, headOid: query.headOid, baseOid: query.baseOid, total: page.total, nextCursor: page.nextCursor };
	if (query.type === "threads") {
		const threads = unique<ReviewThread>(page.nodes, value => {
			const item = object(value), comments = object(item.comments);
			if (typeof item.path !== "string" || !item.path || item.path.length > 4096 || item.path.includes("\0") || typeof item.isResolved !== "boolean" || typeof item.isOutdated !== "boolean" || !["LEFT", "RIGHT"].includes(String(item.diffSide)) || !count(comments.totalCount)) throw Error("GitHub returned invalid review threads.");
			return { id: item.id as string, path: item.path, line: position(item.line), originalLine: position(item.originalLine), side: item.diffSide as "LEFT" | "RIGHT", resolved: item.isResolved, outdated: item.isOutdated, comments: comments.totalCount };
		});
		return { ...common, type: "threads", threads };
	}
	const comments = unique<ReviewComment>(page.nodes, value => {
		const item = object(value), author = item.author === null ? "Deleted user" : object(item.author).login;
		if (typeof author !== "string" || !author || author.length > 256 || typeof item.body !== "string" || Buffer.byteLength(item.body, "utf8") > 512 * 1024 || typeof item.createdAt !== "string" || item.createdAt.length > 100 || !Number.isFinite(Date.parse(item.createdAt))) throw Error("GitHub returned invalid review comments.");
		return { id: item.id as string, author, body: item.body, createdAt: item.createdAt };
	});
	return { ...common, type: "comments", threadId: query.threadId, comments };
}
export async function projectPullRequestThreads(root: string, value: unknown): Promise<PullRequestThreadsPage> {
	const request = validatePullRequestThreadsQuery(value);
	let remote: string; try { remote = await git(root, ["remote", "get-url", "origin"]); } catch { throw Error("Choose a Git repository with an origin remote."); }
	const repository = githubRepository(remote), [owner, name] = repository.split("/");
	let command: Awaited<ReturnType<typeof resolveNativeCommand>>;
	try { command = await resolveNativeCommand("gh"); } catch { throw Error("Install GitHub CLI and sign in with gh auth login."); }
	let output: string;
	try {
		output = (await execute(command.executable, [...command.prefix, "api", "graphql", "--hostname", "github.com", "-f", `query=${request.type === "threads" ? threadsQuery : commentsQuery}`, ...(request.type === "threads" ? ["-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${request.number}`] : ["-f", `id=${request.threadId}`]), ...(request.cursor ? ["-f", `after=${request.cursor}`] : [])], { cwd: root, windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_DEBUG: "" } })).stdout;
	} catch { throw Error("Could not load review threads. Check GitHub CLI sign-in and repository access, then retry."); }
	let parsed: unknown; try { parsed = JSON.parse(output); } catch { throw Error("GitHub returned unreadable review data."); }
	const result = parsePullRequestThreads(repository, request, parsed);
	if (githubRepository(await git(root, ["remote", "get-url", "origin"])).toLowerCase() !== repository.toLowerCase()) throw Error("The project repository changed while reviews loaded. Refresh details to continue.");
	return result;
}
