import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { runGh } from "./projectPullRequestView";
import { codeHostProvider } from "./codeHosts";
import { parsePullRequestReference, pullRequestUrl } from "../shared/pullRequestView";
import type { BranchPullRequest } from "../shared/pullRequests";

type Gh = (root: string, args: string[]) => Promise<string>;
const cache = new Map<string, { at: number; read: Promise<BranchPullRequest> }>();
const cacheMs = 30_000;

/** Reads `gh pr view <branch> --json …`; a branch with no pull request answers with an error, which means none. */
export function parseBranchPullRequest(branch: string, output: string): BranchPullRequest["pullRequest"] {
	let value: Record<string, unknown>;
	try { value = JSON.parse(output) as Record<string, unknown>; } catch { return null; }
	const reference = typeof value.url === "string" ? parsePullRequestReference(value.url) : undefined;
	if (!reference?.repository || reference.number !== value.number || typeof value.title !== "string" || !["OPEN", "CLOSED", "MERGED"].includes(value.state as string)) return null;
	// gh falls back to a pull request from another branch of the same name in a fork; only this branch's counts.
	if (typeof value.headRefName === "string" && value.headRefName !== branch) return null;
	return { repository: reference.repository, number: reference.number, url: pullRequestUrl(reference.repository, reference.number), title: value.title.slice(0, 500), state: value.state as "OPEN" | "CLOSED" | "MERGED", draft: value.isDraft === true };
}

/**
 * The pull request for the checkout's current branch, linked or not (T3's branchPullRequest), so the pane can offer it
 * and Git actions can offer to create one only when there is none. Reads are cached briefly per branch.
 */
export async function branchPullRequest(root: string, fresh = false, gh: Gh = runGh): Promise<BranchPullRequest> {
	const branch = (await git(root, ["branch", "--show-current"]).catch(() => "")).trim();
	let defaultBranch: string | undefined;
	try { defaultBranch = (await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "") || undefined; } catch { /* No remote default. */ }
	if (!branch) return { branch: "", ...(defaultBranch ? { defaultBranch } : {}), pullRequest: null };
	const key = `${root.toLowerCase()}\n${branch}`, cached = cache.get(key);
	if (!fresh && cached && Date.now() - cached.at < cacheMs) return cached.read;
	// Pinned to github.com like every other pull request read; a checkout without a github.com origin has no pull request here.
	const read = git(root, ["remote", "get-url", "origin"]).then(async remote => {
		const other = await codeHostProvider(root, remote);
		if (other) return other.forBranch(branch);
		return parseBranchPullRequest(branch, await gh(root, ["pr", "view", branch, "--repo", `github.com/${githubRepository(remote)}`, "--json", "number,url,state,title,isDraft,headRefName"]));
	}).catch(() => null)
		.then(pullRequest => ({ branch, ...(defaultBranch ? { defaultBranch } : {}), pullRequest }));
	cache.set(key, { at: Date.now(), read });
	return read;
}
export function forgetBranchPullRequest(root: string) { for (const key of cache.keys()) if (key.startsWith(`${root.toLowerCase()}\n`)) cache.delete(key); }
