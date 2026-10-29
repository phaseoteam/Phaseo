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

const isAncestor = async (root: string, ancestor: string, descendant: string) => { try { await git(root, ["merge-base", "--is-ancestor", ancestor, descendant]); return true; } catch { return false; } };
/** Worktrees (other than this checkout) that have a branch checked out. */
async function branchesInOtherWorktrees(root: string) {
	const lines = (await git(root, ["worktree", "list", "--porcelain"])).split(/\r?\n/);
	const current = (await git(root, ["rev-parse", "--show-toplevel"])).trim().replaceAll("\\", "/").toLowerCase();
	const taken = new Set<string>(); let directory = "";
	for (const line of lines) {
		if (line.startsWith("worktree ")) directory = line.slice(9).trim().replaceAll("\\", "/").toLowerCase();
		else if (line.startsWith("branch refs/heads/") && directory !== current) taken.add(line.slice(18).trim());
	}
	return taken;
}

/**
 * T3's "Check out in this repository" (like `gh pr checkout`): switches the project's own checkout to the pull
 * request's branch at its head. Unlike `gh pr checkout --force` it never discards work: it refuses while the working
 * tree has changes, and moves an existing local branch only forward. Forks come through refs/pull/N/head.
 */
export async function checkoutPullRequestHere(root: string, view: PullRequestView) {
	if (view.state !== "OPEN") throw new Error("Only an open pull request can be checked out.");
	const sameRepository = view.headRepository?.toLowerCase() === view.repository.toLowerCase() && view.headRefExists;
	return withGitLock(root, async () => {
		if ((await git(root, ["status", "--porcelain"])).trim()) throw new Error("This repository has uncommitted changes. Commit or stash them before checking out the pull request here, or check it out in a new worktree.");
		const tracking = sameRepository && await validBranch(root, view.head) ? `refs/remotes/origin/${view.head}` : undefined;
		try { await git(root, ["fetch", "--no-tags", "origin", `refs/pull/${view.number}/head`, ...(tracking ? [`+refs/heads/${view.head}:${tracking}`] : [])]); }
		catch (reason) { throw new Error("Could not fetch the pull request from origin. Check your network and access to the repository.", { cause: reason }); }
		const elsewhere = await branchesInOtherWorktrees(root);
		const candidates = [view.head, `pull/${view.number}`];
		let branch: string | undefined, created = false;
		// An existing local branch is reused when it is behind or at the head; one with other commits is left alone.
		for (const candidate of candidates) {
			if (!await validBranch(root, candidate) || !await branchExists(root, candidate)) continue;
			if (!await isAncestor(root, `refs/heads/${candidate}`, view.headOid)) continue;
			if (elsewhere.has(candidate)) throw new Error(`The pull request's branch ${candidate} is checked out in a worktree. Open that worktree instead.`);
			branch = candidate; break;
		}
		if (!branch) {
			for (const candidate of candidates) if (await validBranch(root, candidate) && !await branchExists(root, candidate)) { branch = candidate; created = true; break; }
		}
		if (!branch) throw new Error(`The local branches ${view.head} and pull/${view.number} have commits that are not in this pull request. Check it out in a new worktree, or rename those branches first.`);
		try {
			if (created) await git(root, ["switch", "-c", branch, view.headOid]);
			else { await git(root, ["switch", branch]); await git(root, ["merge", "--ff-only", view.headOid]); }
		} catch (reason) { throw new Error(`Could not switch this repository to ${branch}. Files that are not tracked may be in the way.`, { cause: reason }); }
		if (tracking) await git(root, ["branch", `--set-upstream-to=origin/${view.head}`, branch]).catch(() => undefined);
		return { branch };
	});
}
