import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { git } from "./gitProcess";
import { gitCommand } from "./gitOperations";
import { githubRepository } from "./projectPullRequests";
import { codeHostProvider } from "./codeHosts";
import type { CodeHostProvider } from "./codeHosts/common";
import { ghFailure, runGh } from "./projectPullRequestView";
import { parsePullRequestReference, pullRequestUrl } from "../shared/pullRequestView";

export type CreatedPullRequest = { repository: string; number: number; url: string; status: "created" | "opened_existing"; /** The model that wrote the title and description; absent when they came from the commits. */ writtenBy?: string };
type Gh = (root: string, args: string[]) => Promise<string>;
/** What the writer reads: the branch's commits and changes, the repository's template, and the chat's work. */
export type PullRequestContext = { branch: string; base?: string; commits: string; summary: string; patch: string; template?: string };
/** Writes a title and description, or undefined to fall back to the commits. */
export type DescribePullRequest = (context: PullRequestContext) => Promise<{ title: string; body: string; model?: string } | undefined>;

const defaultBranch = async (root: string) => { try { return (await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "") || undefined; } catch { return undefined; } };
const parseUrl = (text: string) => {
	const reference = text.split(/\s+/).reverse().map(word => word.startsWith("https://github.com/") ? parsePullRequestReference(word) : undefined).find(Boolean);
	return reference?.repository ? { url: pullRequestUrl(reference.repository, reference.number), repository: reference.repository, number: reference.number } : undefined;
};

/**
 * The create_pr Git action: publishes the branch if it has unpushed commits, then opens a pull request for it with
 * GitHub CLI, titled and described from its commits. A branch that already has an open pull request gets that one
 * back instead ("opened_existing"), so the caller links it either way.
 */
export async function createPullRequest(root: string, gh: Gh = runGh, describe?: DescribePullRequest): Promise<CreatedPullRequest> {
	const branch = (await git(root, ["branch", "--show-current"])).trim();
	if (!branch) throw new Error("Switch to a branch before creating a pull request.");
	const remote = await git(root, ["remote", "get-url", "origin"]).catch(() => { throw new Error("Choose a Git repository with an origin remote."); });
	const other = await codeHostProvider(root, remote);
	if (other) return createOnOtherHost(root, branch, other, describe);
	const repo = `github.com/${githubRepository(remote)}`;
	const base = await defaultBranch(root);
	if (base && branch === base) throw new Error(`This is ${base}, the repository's default branch. Create a feature branch first.`);
	try {
		const existing = JSON.parse(await gh(root, ["pr", "view", branch, "--repo", repo, "--json", "number,url,state"])) as { number?: unknown; url?: unknown; state?: unknown };
		const parsed = typeof existing.url === "string" ? parseUrl(existing.url) : undefined;
		if (existing.state === "OPEN" && parsed && parsed.number === existing.number) return { ...parsed, status: "opened_existing" };
	} catch { /* No pull request for this branch yet. */ }
	let upstream = true, ahead = 0;
	try { await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]); ahead = Number((await git(root, ["rev-list", "--count", "@{upstream}..HEAD"])).trim()) || 0; } catch { upstream = false; }
	if (base) {
		let unique = 1;
		try { unique = Number((await git(root, ["rev-list", "--count", `origin/${base}..HEAD`])).trim()); } catch { /* No remote base to compare with. */ }
		if (unique === 0) throw new Error(`This branch has no commits that are not on ${base}. Commit your changes first.`);
	}
	if (!upstream || ahead > 0) await gitCommand(root, { type: "push" });
	// A writer that fails leaves the pull request to its commits rather than blocking it.
	const written = describe ? await describe(await pullRequestContext(root, branch, base)).catch(() => undefined) : undefined;
	const folder = written ? await mkdtemp(path.join(tmpdir(), "phaseo-pr-")) : undefined;
	let output: string;
	try {
		if (folder && written) await writeFile(path.join(folder, "body.md"), written.body, "utf8");
		output = await gh(root, ["pr", "create", "--repo", repo, ...(folder && written ? ["--title", written.title, "--body-file", path.join(folder, "body.md")] : ["--fill"]), "--head", branch, ...(base ? ["--base", base] : [])]);
	}
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, "Could not create the pull request."), { cause: reason }); }
	finally { if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined); }
	const created = parseUrl(output);
	if (!created) throw new Error("GitHub CLI did not report the new pull request's address.");
	return { ...created, status: "created", ...written?.model ? { writtenBy: written.model } : {} };
}

const templatePaths = [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "pull_request_template.md", "PULL_REQUEST_TEMPLATE.md", "docs/pull_request_template.md", "docs/PULL_REQUEST_TEMPLATE.md"];

/** The repository's pull request template, where GitHub looks for one; with several in a folder, the first by name. */
export async function pullRequestTemplate(root: string) {
	for (const relative of templatePaths) { try { const text = await readFile(path.join(root, relative), "utf8"); if (text.trim()) return text; } catch { /* Not here. */ } }
	try {
		const folder = path.join(root, ".github", "PULL_REQUEST_TEMPLATE");
		const first = (await readdir(folder)).filter(name => name.toLowerCase().endsWith(".md")).sort()[0];
		if (first) return await readFile(path.join(folder, first), "utf8");
	} catch { /* No template folder. */ }
	return undefined;
}

async function pullRequestContext(root: string, branch: string, base?: string): Promise<PullRequestContext> {
	const range = base ? `origin/${base}...HEAD` : "HEAD~20..HEAD";
	const read = (args: string[]) => git(root, args).catch(() => "");
	const [commits, summary, patch, template] = await Promise.all([read(["log", "--no-merges", "--format=%s%n%b", "-n", "50", base ? `origin/${base}..HEAD` : "HEAD"]), read(["diff", "--stat", range]), read(["diff", "--no-ext-diff", range]), pullRequestTemplate(root)]);
	return { branch, base, commits, summary, patch, ...template ? { template } : {} };
}

const limit = (text: string, size: number) => text.length > size ? `${text.slice(0, size)}\n[truncated]` : text;

/**
 * The writer's prompt. The chat's work (what was asked, the commands the agent ran and its last reply) lets the
 * description say what was checked; the model is told not to claim checks the chat does not show.
 */
export function pullRequestPrompt(context: PullRequestContext, thread?: string) {
	return {
		system: [
			"You write GitHub pull request titles and descriptions.",
			"Reply with the title on the first line, then a blank line, then the description in Markdown. No code fences around the reply.",
			"Rules:",
			"- the title says plainly what is different now, in at most 100 characters, with no trailing period",
			"- when a template is given, keep its headings and order, fill every section from the changes, and drop its HTML comments and placeholder text",
			"- without a template, write a short summary, then the main changes as bullet points",
			"- mention tests or checks only when the work log shows they ran, with their result; never invent results",
			"- do not mention the assistant, the model or this prompt",
		].join("\n"),
		user: [
			`Branch: ${context.branch}${context.base ? ` into ${context.base}` : ""}`, "", "Commits:", limit(context.commits.trim() || "(none)", 6_000), "",
			...context.template ? ["Pull request template:", limit(context.template, 6_000), ""] : [],
			...thread?.trim() ? ["Work log from the chat that made the changes:", limit(thread, 12_000), ""] : [],
			"Changed files:", limit(context.summary, 4_000), "", "Patch:", limit(context.patch, 30_000),
		].join("\n"),
	};
}

/** A model reply as a title and description, without code fences or "Title:" labels. */
export function parsePullRequestText(raw: string) {
	const lines = raw.replace(/^\s*```[a-z]*\n?|```\s*$/gi, "").split(/\r?\n/);
	while (lines.length && !lines[0].trim()) lines.shift();
	const title = (lines.shift() ?? "").trim().replace(/^#+\s*/, "").replace(/^(title|pull request title):\s*/i, "").replace(/^["'`]+|["'`]+$/g, "").replace(/\.+$/, "").slice(0, 120).trim();
	const body = lines.join("\n").replace(/^\s*(description|body):\s*/i, "").trim();
	return title ? { title, body } : undefined;
}

type ThreadLike = { messages: { role: string; text: string; delivery?: string; autopilot?: true; notice?: unknown }[]; activities?: { type: string; title: string; status?: string }[] };

/** The chat's work for the writer: what the person asked, the agent's tool calls with their outcome, and its last reply. */
export function threadWorkLog(task: ThreadLike) {
	const asked = task.messages.filter(message => message.role === "user" && !message.delivery && !message.autopilot && !message.notice).slice(-5).map(message => `- ${limit(message.text.trim(), 1_500)}`);
	const tools = (task.activities ?? []).filter(activity => activity.type === "tool").slice(-40).map(activity => `- ${activity.title}${activity.status === "failed" ? " (failed)" : ""}`);
	const reply = task.messages.findLast(message => message.role === "assistant")?.text.trim();
	return [...asked.length ? ["Asked:", ...asked, ""] : [], ...tools.length ? ["Tool calls:", ...tools, ""] : [], ...reply ? ["Last reply:", limit(reply, 3_000)] : []].join("\n").trim();
}

/** Like gh's --fill: one commit gives the title and description; several give the branch name and a list of their subjects. */
export async function fillFromCommits(root: string, base: string, branch: string) {
	let log = "";
	try { log = await git(root, ["log", "--reverse", "--format=%s%x1f%b%x1e", `origin/${base}..HEAD`]); } catch { /* No remote base to compare with. */ }
	const commits = log.split("\x1e").map(entry => entry.trim()).filter(Boolean).map(entry => { const [subject, body = ""] = entry.split("\x1f"); return { subject: subject.trim(), body: body.trim() }; });
	if (commits.length === 1) return { title: commits[0].subject.slice(0, 255), body: commits[0].body };
	return { title: branch.replace(/^.*\//, "").replace(/[-_]+/g, " ").replace(/^./, letter => letter.toUpperCase()).slice(0, 255), body: commits.map(commit => `- ${commit.subject}`).join("\n") };
}

/** The same steps on GitLab, Forgejo, Bitbucket or Azure DevOps: reuse an open request for the branch, push, then create. */
async function createOnOtherHost(root: string, branch: string, host: CodeHostProvider, describe?: DescribePullRequest): Promise<CreatedPullRequest> {
	const base = await defaultBranch(root);
	if (!base) throw new Error("Phaseo can't tell origin's default branch. Run git remote set-head origin --auto, then try again.");
	if (branch === base) throw new Error(`This is ${base}, the repository's default branch. Create a feature branch first.`);
	const existing = await host.forBranch(branch).catch(() => null);
	if (existing?.state === "OPEN") return { repository: existing.repository, number: existing.number, url: existing.url, status: "opened_existing" };
	let unique = 1;
	try { unique = Number((await git(root, ["rev-list", "--count", `origin/${base}..HEAD`])).trim()); } catch { /* No remote base to compare with. */ }
	if (unique === 0) throw new Error(`This branch has no commits that are not on ${base}. Commit your changes first.`);
	let upstream = true, ahead = 0;
	try { await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]); ahead = Number((await git(root, ["rev-list", "--count", "@{upstream}..HEAD"])).trim()) || 0; } catch { upstream = false; }
	if (!upstream || ahead > 0) await gitCommand(root, { type: "push" });
	const written = describe ? await describe(await pullRequestContext(root, branch, base)).catch(() => undefined) : undefined;
	const created = await host.create({ head: branch, base, ...written ? { title: written.title, body: written.body } : await fillFromCommits(root, base, branch) });
	return { repository: host.remote.repository, ...created, status: "created", ...written?.model ? { writtenBy: written.model } : {} };
}
