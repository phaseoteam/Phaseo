import { git, withGitLock } from "./gitOperations";

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
