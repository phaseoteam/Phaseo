import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isTreeId } from "../shared/gitDiff";
import { isRepository, runGit } from "./gitDiffScopes";

/**
 * Records the working tree, untracked files included, as a Git tree without touching the index,
 * branches or stash: files are added to a copy of the index and only the tree object is kept.
 * Never rejects: outside a repository or when Git fails it returns undefined, so a turn never waits on it.
 */
export async function captureCheckpoint(root: string): Promise<string | undefined> {
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
