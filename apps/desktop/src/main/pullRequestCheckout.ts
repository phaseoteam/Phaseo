import { git } from "./gitProcess";
import { withGitLock } from "./gitOperations";
import type { PullRequestView } from "../shared/pullRequestView";

const branchExists = async (root: string, branch: string) => { try { await git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]); return true; } catch { return false; } };
const validBranch = async (root: string, branch: string) => { try { await git(root, ["check-ref-format", "--branch", branch]); return !branch.startsWith("-"); } catch { return false; } };

/** The local branch a checkout uses: the pull request's own name, or `pull/N` when that is taken or unusable here. */
export async function pullRequestBranch(root: string, view: Pick<PullRequestView, "number" | "head">) {
	for (const candidate of [view.head, `pull/${view.number}`]) if (await validBranch(root, candidate) && !await branchExists(root, candidate)) return candidate;
	throw new Error(`A local branch for this pull request already exists (${view.head} or pull/${view.number}). Open its worktree, or delete the branch first.`);
}

/**
 * T3's "Check out in a separate worktree": fetches the pull request's head from GitHub (forks included, through
 * refs/pull/N/head), then makes a managed worktree on a new local branch at exactly that commit, so nothing open moves.
 * A same-repository branch tracks its remote branch so pushes go back to the pull request.
 */
export async function checkoutPullRequestWorktree(root: string, view: PullRequestView, createWorktree: (branch: string, base: string) => Promise<{ projectId: string; directory?: string }>) {
	if (view.state !== "OPEN") throw new Error("Only an open pull request can be checked out.");
	const sameRepository = view.headRepository?.toLowerCase() === view.repository.toLowerCase() && view.headRefExists;
	const tracking = sameRepository && await validBranch(root, view.head) ? `refs/remotes/origin/${view.head}` : undefined;
	await withGitLock(root, async () => {
		try { await git(root, ["fetch", "--no-tags", "origin", `refs/pull/${view.number}/head`, ...(tracking ? [`+refs/heads/${view.head}:${tracking}`] : [])]); }
		catch (reason) { throw new Error("Could not fetch the pull request from origin. Check your network and access to the repository.", { cause: reason }); }
	});
	const branch = await pullRequestBranch(root, view);
	const created = await createWorktree(branch, view.headOid);
	if (tracking && created.directory) await git(created.directory, ["branch", `--set-upstream-to=origin/${view.head}`, branch]).catch(() => undefined);
	return { ...created, branch };
}
