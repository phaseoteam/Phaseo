import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { ghFailure, runGh } from "./projectPullRequestView";
import { IssueIsPullRequestError, issueUrl, parseGithubReferenceUrl, type GithubReference, type GithubReferenceCandidate, type GithubReferenceSearch, type IssueDetails } from "../shared/issueView";
import { untrustedBlock, untrustedLabel, untrustedNotice } from "../shared/untrustedContent";

type Gh = (root: string, args: string[]) => Promise<string>;
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 65536) => typeof value === "string" ? value.slice(0, limit) : "";
const login = (value: unknown) => { const name = record(value).login; return typeof name === "string" ? name : null; };
const nodes = (value: unknown) => { const list = record(value).nodes; return Array.isArray(list) ? list.map(record) : []; };
const literal = (value: string) => JSON.stringify(value);
const stderr = (reason: unknown) => (reason as { stderr?: unknown })?.stderr;

/** The GitHub repository a project folder's origin points at. */
export async function originRepository(root: string) {
	let remote: string;
	try { remote = await git(root, ["remote", "get-url", "origin"]); } catch { throw new Error("This project has no origin remote. Pass the issue's full URL instead."); }
	return githubRepository(remote);
}

async function graphql(root: string, query: string, gh: Gh, fallback: string) {
	let output: string;
	try { output = await gh(root, ["api", "graphql", "--hostname", "github.com", "-f", `query=${query}`]); }
	catch (reason) { throw Object.assign(new Error(ghFailure(stderr(reason), fallback)), { stderr: stderr(reason) }); }
	let parsed: Record<string, unknown>;
	try { parsed = record(JSON.parse(output)); } catch { throw new Error(fallback); }
	if (!parsed.data && parsed.errors) throw new Error(`${fallback} GitHub said: ${untrustedLabel(JSON.stringify(parsed.errors), 240)}`);
	return record(parsed.data);
}

const issueFields = "number title body url state stateReason createdAt updatedAt closedAt author{login} labels(first:20){nodes{name}} assignees(first:10){nodes{login}}";
/** One issue with its latest 20 comments; a number that is a pull request is refused with a hint. */
export async function readIssue(root: string, repository: string, number: number, gh: Gh = runGh): Promise<IssueDetails> {
	const [owner, name] = repository.split("/");
	const data = await graphql(root, `query{viewer{login} repository(owner:${literal(owner)},name:${literal(name)}){issueOrPullRequest(number:${number}){__typename ... on Issue{${issueFields} comments(last:20){totalCount nodes{id body createdAt url authorAssociation author{login}}}}}}}`, gh, `Could not read issue #${number} from ${repository}.`);
	const item = record(record(data.repository).issueOrPullRequest);
	if (item.__typename === "PullRequest") throw new IssueIsPullRequestError(repository, number);
	if (item.__typename !== "Issue") throw new Error(`${repository} has no issue #${number}.`);
	const comments = record(item.comments);
	return {
		repository, number, url: issueUrl(repository, number), title: text(item.title, 500), body: text(item.body), state: item.state === "CLOSED" ? "closed" : "open",
		...(typeof item.stateReason === "string" ? { stateReason: item.stateReason.toLowerCase() } : {}),
		author: login(item.author), labels: nodes(item.labels).map(label => text(label.name, 200)).filter(Boolean), assignees: nodes(item.assignees).map(person => text(person.login, 100)).filter(Boolean),
		createdAt: text(item.createdAt, 100), updatedAt: text(item.updatedAt, 100), ...(typeof item.closedAt === "string" ? { closedAt: item.closedAt } : {}),
		comments: nodes(comments).map(comment => ({ id: text(comment.id, 200), author: login(comment.author), ...(typeof comment.authorAssociation === "string" ? { authorAssociation: comment.authorAssociation } : {}), body: text(comment.body), createdAt: text(comment.createdAt, 100), ...(typeof comment.url === "string" ? { url: comment.url } : {}) })),
		commentCount: Number.isSafeInteger(comments.totalCount) ? Number(comments.totalCount) : 0,
		...(login(data.viewer) ? { viewer: login(data.viewer)! } : {}), fetchedAt: new Date().toISOString(),
	};
}

const candidateFields = "__typename ... on Issue{number title url state updatedAt} ... on PullRequest{number title url state isDraft updatedAt}";
function candidate(repository: string, item: Record<string, unknown>): GithubReferenceCandidate | undefined {
	const number = Number(item.number);
	if ((item.__typename !== "Issue" && item.__typename !== "PullRequest") || !Number.isSafeInteger(number) || number < 1) return;
	const kind = item.__typename === "Issue" ? "issue" as const : "pull-request" as const;
	const state = item.state === "MERGED" ? "merged" as const : item.state === "CLOSED" ? "closed" as const : "open" as const;
	return { kind, repository, number, url: kind === "issue" ? issueUrl(repository, number) : `https://github.com/${repository}/pull/${number}`, title: text(item.title, 500), state, ...(item.isDraft === true ? { draft: true } : {}), updatedAt: text(item.updatedAt, 100) };
}
/** The `#` composer menu: the project's issues and pull requests matching the query, open ones first, most recently updated. */
export async function searchGithubReferences(root: string, query: string, gh: Gh = runGh): Promise<GithubReferenceSearch> {
	const repository = await originRepository(root), [owner, name] = repository.split("/");
	const words = query.replace(/^#/, "").replace(/["\\]/g, " ").trim(), exact = /^\d{1,10}$/.test(words) && Number(words) <= 2147483647 ? Number(words) : undefined;
	const search = `repo:${repository} sort:updated-desc ${exact ? "" : words}`.trim();
	const data = await graphql(root, `query{${exact ? `repository(owner:${literal(owner)},name:${literal(name)}){issueOrPullRequest(number:${exact}){${candidateFields}}} ` : ""}search(query:${literal(search)},type:ISSUE,first:30){nodes{${candidateFields}}}}`, gh, "Could not search this project's issues.");
	const found = [record(record(data.repository).issueOrPullRequest), ...nodes(data.search)].map(item => candidate(repository, item)).filter((value): value is GithubReferenceCandidate => Boolean(value));
	const unique = found.filter((item, index) => found.findIndex(other => other.number === item.number) === index);
	// The exact number stays on top; the rest put open work first, keeping GitHub's recency order within each.
	const [first, ...rest] = unique;
	const ordered = exact && first?.number === exact ? [first, ...rest.filter(item => item.state === "open"), ...rest.filter(item => item.state !== "open")] : [...unique.filter(item => item.state === "open"), ...unique.filter(item => item.state !== "open")];
	return { repository, results: ordered.slice(0, 20) };
}

const bodyExcerpt = 1500;
function excerpt(body: string) {
	const value = body.replace(/<!--[\s\S]*?-->/g, " ").replace(/\n{3,}/g, "\n\n").trim();
	return value.length <= bodyExcerpt ? value : `${value.slice(0, bodyExcerpt - 3)}...`;
}
/**
 * The context block a message's `#` references add to its prompt: each issue's or pull request's title, state and URL,
 * and an issue's body excerpt, fenced as third-party text. A reference GitHub does not answer for is still listed by URL.
 */
export async function githubReferenceContext(root: string, urls: string[], gh: Gh = runGh, timeoutMs = 10_000): Promise<string> {
	const references = urls.map(parseGithubReferenceUrl).filter((value): value is GithubReference => Boolean(value));
	if (!references.length) return "";
	const fields = "__typename ... on Issue{title url state body} ... on PullRequest{title url state isDraft}";
	const query = `query{${references.map((reference, index) => { const [owner, name] = reference.repository.split("/"); return `r${index}: repository(owner:${literal(owner)},name:${literal(name)}){issueOrPullRequest(number:${reference.number}){${fields}}}`; }).join(" ")}}`;
	let data: Record<string, unknown> = {};
	try {
		let timer: ReturnType<typeof setTimeout> | undefined;
		data = await Promise.race([graphql(root, query, gh, "Could not read the referenced issues."), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); })]).finally(() => clearTimeout(timer));
	} catch { /* Listed by URL only. */ }
	let fenced = false;
	const lines = references.map((reference, index) => {
		const item = record(record(data[`r${index}`]).issueOrPullRequest);
		const kind = item.__typename === "PullRequest" ? "Pull request" : item.__typename === "Issue" ? "Issue" : reference.kind === "issue" ? "Issue" : "Pull request";
		const url = typeof item.url === "string" ? item.url : reference.url;
		if (!item.__typename) return `- ${kind} ${reference.repository}#${reference.number}: ${url} (could not be read from GitHub)`;
		const state = item.state === "MERGED" ? "merged" : item.state === "CLOSED" ? "closed" : item.isDraft === true ? "draft" : "open";
		const head = `- ${kind} ${reference.repository}#${reference.number} (${state}): "${untrustedLabel(text(item.title, 500))}" ${url}`;
		const body = item.__typename === "Issue" ? excerpt(text(item.body)) : "";
		if (!body) return head;
		fenced = true;
		return `${head}\n${untrustedBlock(`issue #${reference.number} body`, body).replace(/^/gm, "  ")}`;
	});
	return `\n\nThe user referenced these GitHub issues and pull requests. Use read_issue for an issue's full thread and comments.${fenced ? ` ${untrustedNotice}` : ""}\n${lines.join("\n")}`;
}
