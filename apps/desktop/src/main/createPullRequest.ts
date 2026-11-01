import { git } from "./gitProcess";
import { gitCommand } from "./gitOperations";
import { githubRepository } from "./projectPullRequests";
import { codeHostProvider } from "./codeHosts";
import type { CodeHostProvider } from "./codeHosts/common";
import { ghFailure, runGh } from "./projectPullRequestView";
import { parsePullRequestReference, pullRequestUrl } from "../shared/pullRequestView";

export type CreatedPullRequest = { repository: string; number: number; url: string; status: "created" | "opened_existing" };
type Gh = (root: string, args: string[]) => Promise<string>;

const defaultBranch = async (root: string) => { try { return (await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "") || undefined; } catch { return undefined; } };
const parseUrl = (text: string) => {
	const reference = text.split(/\s+/).reverse().map(word => word.startsWith("https://github.com/") ? parsePullRequestReference(word) : undefined).find(Boolean);
	return reference?.repository ? { url: pullRequestUrl(reference.repository, reference.number), repository: reference.repository, number: reference.number } : undefined;
};

/**
 * T3's create_pr Git action: publishes the branch if it has unpushed commits, then opens a pull request for it with
 * GitHub CLI, titled and described from its commits. A branch that already has an open pull request gets that one
 * back instead ("opened_existing"), so the caller links it either way.
 */
export async function createPullRequest(root: string, gh: Gh = runGh): Promise<CreatedPullRequest> {
	const branch = (await git(root, ["branch", "--show-current"])).trim();
	if (!branch) throw new Error("Switch to a branch before creating a pull request.");
	const remote = await git(root, ["remote", "get-url", "origin"]).catch(() => { throw new Error("Choose a Git repository with an origin remote."); });
	const other = await codeHostProvider(root, remote);
	if (other) return createOnOtherHost(root, branch, other);
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
	let output: string;
	try { output = await gh(root, ["pr", "create", "--repo", repo, "--fill", "--head", branch, ...(base ? ["--base", base] : [])]); }
	catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, "Could not create the pull request."), { cause: reason }); }
	const created = parseUrl(output);
	if (!created) throw new Error("GitHub CLI did not report the new pull request's address.");
	return { ...created, status: "created" };
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
async function createOnOtherHost(root: string, branch: string, host: CodeHostProvider): Promise<CreatedPullRequest> {
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
	const created = await host.create({ head: branch, base, ...await fillFromCommits(root, base, branch) });
	return { repository: host.remote.repository, ...created, status: "created" };
}
