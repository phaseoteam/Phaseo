import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isTreeId, type CheckpointChange, type TurnFileChange } from "../shared/gitDiff";
import { isRepository, runGit } from "./gitDiffScopes";
import { span } from "./diagnostics/tracer";

/**
 * Records the working tree, untracked files included, as a Git tree without touching the index,
 * branches or stash: files are added to a copy of the index and only the tree object is kept.
 * Never rejects: outside a repository or when Git fails it returns undefined, so a turn never waits on it.
 */
/** Snapshots being taken, by folder. Chats starting together in one project share one: they share its working tree too. */
const capturing = new Map<string, Promise<string | undefined>>();
export function captureCheckpoint(root: string): Promise<string | undefined> {
	const key = path.resolve(root);
	let capture = capturing.get(key);
	if (!capture) { capture = span("git.checkpoint", undefined, () => snapshot(root)).finally(() => capturing.delete(key)); capturing.set(key, capture); }
	return capture;
}

async function snapshot(root: string): Promise<string | undefined> {
	let directory: string | undefined;
	try {
		if (!await isRepository(root)) return;
		directory = await mkdtemp(path.join(tmpdir(), "phaseo-checkpoint-"));
		const index = path.join(directory, "index");
		const real = (await runGit(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
		// Starting from the real index keeps Git's file stat cache, so unchanged files are not re-read.
		await copyFile(real, index).catch(() => undefined);
		const env = { GIT_INDEX_FILE: index };
		await runGit(root, ["add", "--all", "--", "."], { env });
		const tree = (await runGit(root, ["write-tree"], { env })).trim();
		return isTreeId(tree) ? tree : undefined;
	} catch { return; }
	finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined); }
}

/** What restoring `tree` would change in the working tree now: files added since, changed since, and removed since. */
export async function checkpointChanges(root: string, tree: string): Promise<CheckpointChange[]> {
	if (!isTreeId(tree)) throw new Error("This turn has no saved snapshot.");
	try { await runGit(root, ["cat-file", "-e", `${tree}^{tree}`]); } catch { throw new Error("This turn's snapshot is no longer in the repository."); }
	const current = await captureCheckpoint(root);
	if (!current) throw new Error("Could not read the project's files.");
	// --relative: the project folder may sit inside a larger repository, and paths are read from the folder.
	const output = await runGit(root, ["diff", "--name-status", "--no-renames", "--relative", "-z", tree, current]);
	const parts = output.split("\0"), changes: CheckpointChange[] = [];
	// Reading from the checkpoint to now: A is a file added since, D one removed since.
	for (let index = 0; index + 1 < parts.length; index += 2) { const code = parts[index], file = parts[index + 1]; if (code && file) changes.push({ path: file, status: code === "A" ? "added" : code === "D" ? "deleted" : "modified" }); }
	return changes;
}

/**
 * Puts the working tree back to `tree` (T3's restore): changed and removed files come back, files added since go.
 * Only the working tree changes, never the index, HEAD or ignored files, so staged work and commits stay as they are.
 */
export async function restoreCheckpoint(root: string, tree: string): Promise<CheckpointChange[]> {
	const changes = await checkpointChanges(root, tree);
	const restored = changes.filter(change => change.status !== "added").map(change => change.path);
	// Literal pathspecs, so a file named with * or ? restores only itself.
	if (restored.length) await runGit(root, ["restore", `--source=${tree}`, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"], { input: restored.map(file => `:(literal)${file}`).join("\0") });
	for (const change of changes) if (change.status === "added") await rm(path.join(root, change.path), { force: true });
	return changes;
}

/** Files a turn changed between its snapshots, with lines added and removed (-1 for binary files): the chat's changed-files row. */
export async function turnChanges(root: string, from: string, to: string): Promise<TurnFileChange[]> {
	if (!isTreeId(from) || !isTreeId(to)) throw new Error("This turn has no saved snapshot.");
	const output = await runGit(root, ["diff", "--numstat", "--no-renames", "--relative", "-z", from, to]);
	return output.split("\0").flatMap(entry => {
		const [added, removed, ...name] = entry.split("\t"), file = name.join("\t");
		return file ? [{ path: file, additions: added === "-" ? -1 : Number(added), deletions: removed === "-" ? -1 : Number(removed) }] : [];
	});
}
