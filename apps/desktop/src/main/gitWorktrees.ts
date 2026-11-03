import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { withGitLock } from "./gitOperations";
import { git } from "./gitProcess";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { WorktreeSubmodules } from "../shared/sourceControlPreferences";

const execute = promisify(execFile);

/** The folder new worktrees go in: the one chosen in Settings → Worktrees, else the worktrees folder in the workspace's data folder. */
export const worktreeRoot = (workspaceDirectory: string, chosen: string | null) => chosen ? path.resolve(chosen) : path.join(workspaceDirectory, "worktrees");

/**
 * The folders a managed worktree may sit in, for removal: the one recorded when it was made, the chosen folder and the
 * default one. Worktrees made before the location changed stay where they are and can still be removed.
 */
export const ownedWorktreeRoots = (workspaceDirectory: string, chosen: string | null, recorded?: string) => [...new Set([...recorded ? [recorded] : [], worktreeRoot(workspaceDirectory, chosen), worktreeRoot(workspaceDirectory, null)])];

/** The git commands that check out a new worktree's submodules: none, the ones the repository declares, or those and theirs. */
export function submoduleCommands(mode: WorktreeSubmodules): string[][] {
	if (mode === "none") return [];
	return [["submodule", "init"], mode === "recursive" ? ["submodule", "update", "--init", "--recursive"] : ["submodule", "update", "--init"]];
}

/**
 * Checks out a new worktree's submodules, which `git worktree add` leaves empty. Skipped when the repository has none.
 * Cloning can take a while, so it gets ten minutes and never prompts for credentials; a failure leaves the worktree usable
 * without them (it is reported in the result, not thrown).
 */
export async function checkoutSubmodules(directory: string, mode: WorktreeSubmodules): Promise<{ ran: boolean; error?: string }> {
	if (mode === "none" || !existsSync(path.join(directory, ".gitmodules"))) return { ran: false };
	try {
		for (const args of submoduleCommands(mode)) await execute("git", ["--no-pager", ...args], { cwd: directory, windowsHide: true, timeout: 600_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
		return { ran: true };
	} catch (error) {
		const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim().split(/\r?\n/).filter(Boolean).at(-1) : undefined;
		return { ran: true, error: detail?.replace(/\/\/[^/@\s]+@/g, "//") || "Git could not check out the submodules." };
	}
}


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

/** Removes a managed worktree: one made directly inside one of `ownedRoots` (see ownedWorktreeRoots), clean (submodules included), and still a worktree of `root`. */
export async function removeGitWorktree(root: string, ownedRoots: string | readonly string[], directory: string, stopManagedTools?: () => Promise<void>) {
	const target = await realpath(directory);
	// A root that no longer exists owns nothing.
	const owned = await Promise.all((typeof ownedRoots === "string" ? [ownedRoots] : ownedRoots).map(value => realpath(value).catch(() => undefined)));
	if (!owned.some(value => value && /^[a-f0-9-]{36}$/.test(path.relative(value, target)))) throw new Error("Only desktop-managed worktrees can be removed.");
	await withGitLock(root, async () => {
		const [sourceCommon, targetCommon] = await Promise.all([root, target].map(async value => realpath((await git(value, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim())));
		if (path.relative(sourceCommon, targetCommon)) throw new Error("This worktree no longer belongs to its source repository.");
		// Changes inside submodules count too, whatever the repository's ignore settings say.
		const status = ["status", "--porcelain", "--ignore-submodules=none"];
		if ((await git(target, status)).trim()) throw new Error("Commit or move all tracked and untracked changes before removing this worktree.");
		await stopManagedTools?.();
		if ((await git(target, status)).trim()) throw new Error("The worktree changed while its tools were stopping. Keep those changes before removing it.");
		// Git refuses to remove a worktree with checked-out submodules unless forced. The checks above already found it
		// clean, submodules included, so forcing loses nothing.
		const submodules = existsSync(path.join(target, ".gitmodules")) && (await git(target, ["submodule", "status", "--recursive"])).split(/\r?\n/).some(line => line.trim() && !line.startsWith("-"));
		await git(root, ["worktree", "remove", ...submodules ? ["--force"] : [], "--", target]); await git(root, ["worktree", "prune"]);
	});
}
