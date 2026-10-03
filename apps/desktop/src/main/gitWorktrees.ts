import { git, withGitLock } from "./gitOperations";
import { realpath } from "node:fs/promises";
import path from "node:path";

export async function createGitWorktree(root: string, directory: string, branch: string, base: string) {
	if (!branch || branch.length > 200 || branch.startsWith("-") || branch.includes("\0")) throw new Error("Invalid worktree branch name.");
	if (!base || base.length > 1000 || base.startsWith("-") || base.includes("\0")) throw new Error("Invalid worktree starting ref.");
	return withGitLock(root, async () => {
		await git(root, ["check-ref-format", "--branch", branch]);
		const commit = (await git(root, ["rev-parse", "--verify", `${base}^{commit}`])).trim();
		if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error("Choose a valid Git commit.");
		await git(root, ["worktree", "add", "-b", branch, "--", directory, commit]);
		return commit;
	});
}

export async function removeGitWorktree(root: string, ownedRoot: string, directory: string, stopManagedTools?: () => Promise<void>) {
	const [owned, target] = await Promise.all([realpath(ownedRoot), realpath(directory)]); const relative = path.relative(owned, target);
	if (!/^[a-f0-9-]{36}$/.test(relative)) throw new Error("Only desktop-managed worktrees can be removed.");
	await withGitLock(root, async () => {
		const [sourceCommon, targetCommon] = await Promise.all([root, target].map(async value => realpath((await git(value, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim())));
		if (path.relative(sourceCommon, targetCommon)) throw new Error("This worktree no longer belongs to its source repository.");
		if ((await git(target, ["status", "--porcelain"])).trim()) throw new Error("Commit or move all tracked and untracked changes before removing this worktree.");
		await stopManagedTools?.();
		if ((await git(target, ["status", "--porcelain"])).trim()) throw new Error("The worktree changed while its tools were stopping. Keep those changes before removing it.");
		await git(root, ["worktree", "remove", "--", target]); await git(root, ["worktree", "prune"]);
	});
}
