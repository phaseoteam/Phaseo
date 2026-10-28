import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "./gitProcess";
import { ghFailure, runGh } from "./projectPullRequestView";
import { gitReview } from "./projectFiles";
import type { PublishRepositoryRequest } from "../shared/gitWorkflow";

const execute = promisify(execFile);
type Gh = (root: string, args: string[]) => Promise<string>;
/** Calls the title model (WorkspaceRuntime.completeWithTitleModel). */
type Complete = (input: { system: string; user: string; maxTokens: number; timeoutMs: number; label: string }) => Promise<{ reply?: string }>;

const limit = (text: string, size: number) => text.length > size ? `${text.slice(0, size)}\n[truncated]` : text;

/** T3's commit message prompt, asking for plain text instead of JSON. */
export function commitMessagePrompt(input: { branch: string; summary: string; patch: string }) {
	return {
		system: [
			"You write concise git commit messages.",
			"Reply with the commit message only: a subject line, then optionally a blank line and a short body.",
			"Rules:",
			"- subject must be imperative, <= 72 chars, and no trailing period",
			"- body can be empty or short bullet points",
			"- capture the primary user-visible or developer-visible change",
		].join("\n"),
		user: [`Branch: ${input.branch || "(detached)"}`, "", "Changed files:", limit(input.summary, 6_000), "", "Patch:", limit(input.patch, 40_000)].join("\n"),
	};
}

/** A model reply as a commit message: no code fences, quotes or "Subject:" labels, a subject of at most 72 characters. */
export function cleanCommitMessage(raw: string) {
	const lines = raw.replace(/^```[a-z]*\n?|```\s*$/gim, "").split(/\r?\n/);
	while (lines.length && !lines[0].trim()) lines.shift();
	const subject = (lines.shift() ?? "").trim().replace(/^(subject|commit message):\s*/i, "").replace(/^["'`]+|["'`]+$/g, "").replace(/\.+$/, "").slice(0, 72).trim();
	const body = lines.join("\n").replace(/^\s*body:\s*/i, "").trim();
	if (!subject) throw new Error("The title model did not write a commit message. Try again or type one.");
	return body ? `${subject}\n\n${body}` : subject;
}

/** What a commit would contain: the staged changes, or every change when nothing is staged (Commit all). */
export async function commitChanges(root: string) {
	const [branch, staged] = await Promise.all([git(root, ["branch", "--show-current"]), git(root, ["diff", "--cached", "--name-status"])]);
	if (staged.trim()) return { branch: branch.trim(), summary: staged, patch: await git(root, ["diff", "--cached", "--no-ext-diff"]) };
	const summary = await git(root, ["status", "--porcelain"]);
	if (!summary.trim()) throw new Error("There are no changes to commit.");
	return { branch: branch.trim(), summary, patch: await git(root, ["diff", "--no-ext-diff"]).catch(() => "") };
}

/** T3's generated commit message: the title model reads the changes and writes the message. */
export async function generateCommitMessage(root: string, complete: Complete) {
	const { reply } = await complete({ ...commitMessagePrompt(await commitChanges(root)), maxTokens: 400, timeoutMs: 60_000, label: "The title model" });
	return cleanCommitMessage(reply ?? "");
}

/** Git output for a failed network command, without credentials or hints. */
function gitFailure(error: unknown, fallback: string) {
	const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim().split(/\r?\n/).filter(line => line.trim() && !line.startsWith("hint:")).at(-1) : "";
	return detail ? `${fallback}: ${detail.replace(/^(?:error|fatal): /, "").replace(/\/\/[^/@\s]+@/g, "//")}` : `${fallback}.`;
}

/** Fast-forwards the branch from its upstream. Never merges, rebases or prompts for credentials. */
export async function gitPull(root: string) {
	if (!(await git(root, ["branch", "--show-current"])).trim()) throw new Error("Switch to a branch before pulling.");
	try { await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]); } catch { throw new Error("This branch has no upstream to pull from. Push it first."); }
	try { await execute("git", ["--no-pager", "pull", "--ff-only"], { cwd: root, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }); }
	catch (error) {
		const message = gitFailure(error, "Pull failed");
		throw new Error(/not possible to fast-forward|diverg/i.test(message) ? "The branch and its upstream have diverged. Rebase or merge in a terminal first." : message, { cause: error });
	}
}

/** T3's Initialise Git: makes a plain folder a repository. */
export async function gitInit(root: string) {
	let inside = false;
	try { inside = (await git(root, ["rev-parse", "--is-inside-work-tree"])).trim() === "true"; } catch { /* Not a repository yet. */ }
	if (inside) throw new Error("This folder is already in a Git repository.");
	await git(root, ["init"]);
	return gitReview(root);
}

/** The GitHub accounts a repository can be published to: the signed-in user, then their organisations. */
export async function publishOwners(root: string, gh: Gh = runGh) {
	try {
		const user = JSON.parse(await gh(root, ["api", "--hostname", "github.com", "user"])) as { login?: unknown };
		if (typeof user.login !== "string") throw new Error("GitHub CLI did not say who is signed in.");
		const orgs = JSON.parse(await gh(root, ["api", "--hostname", "github.com", "user/orgs"]).catch(() => "[]")) as { login?: unknown }[];
		return [user.login, ...orgs.flatMap(org => typeof org.login === "string" ? [org.login] : [])];
	} catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, reason instanceof Error && !("stderr" in reason) ? reason.message : "Sign in to GitHub CLI with gh auth login first."), { cause: reason }); }
}

/**
 * T3's Publish repository: creates the GitHub repository through `gh api --hostname github.com`, adds it as origin and
 * pushes the current branch when there are commits. The remote stays if the push fails, so a retry is a plain push.
 */
export async function publishRepository(root: string, request: PublishRepositoryRequest, push: (root: string) => Promise<void>, gh: Gh = runGh) {
	if ((await git(root, ["remote"])).trim()) throw new Error("This repository already has a remote. Push to it instead.");
	const owners = await publishOwners(root, gh);
	const owner = request.owner ?? owners[0];
	if (!owners.includes(owner)) throw new Error("Choose your GitHub account or one of your organisations.");
	let created: { full_name?: unknown; clone_url?: unknown; html_url?: unknown };
	try {
		created = JSON.parse(await gh(root, ["api", "--hostname", "github.com", "--method", "POST", owner === owners[0] ? "user/repos" : `orgs/${owner}/repos`, "-f", `name=${request.name}`, "-F", `private=${request.visibility === "private"}`, ...request.description ? ["-f", `description=${request.description}`] : []]));
	} catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, "Could not create the repository."), { cause: reason }); }
	if (typeof created.full_name !== "string" || typeof created.clone_url !== "string" || !created.clone_url.startsWith("https://github.com/")) throw new Error("GitHub did not return the new repository's address.");
	await git(root, ["remote", "add", "origin", created.clone_url]);
	let hasCommits = true;
	try { await git(root, ["rev-parse", "--verify", "HEAD"]); } catch { hasCommits = false; }
	const result = { repository: created.full_name, url: typeof created.html_url === "string" ? created.html_url : `https://github.com/${created.full_name}` };
	if (!hasCommits || !(await git(root, ["branch", "--show-current"])).trim()) return { ...result, pushed: false };
	try { await push(root); } catch (error) { throw new Error(`Created ${created.full_name} and added it as origin, but the push failed. ${error instanceof Error ? error.message : ""} Fix the problem, then push again.`.trim(), { cause: error }); }
	return { ...result, pushed: true };
}
