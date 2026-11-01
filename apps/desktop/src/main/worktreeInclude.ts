import { copyFile, lstat, mkdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import path from "node:path";
import { git } from "./gitProcess";

export const WORKTREE_INCLUDE_FILE = ".worktreeinclude";
const MAX_FILES = 500, MAX_BYTES = 200 * 1024 * 1024;

export type WorktreeIncludeResult = { copied: string[]; skipped: string[] };

/**
 * Copies the source checkout's untracked files that match `.worktreeinclude` (gitignore patterns, such as `.env`) into a
 * new worktree before its setup runs, so it starts with the same local config. Git does the matching. Files the
 * worktree already has are never overwritten, links are not followed, and the copy stops at 500 files or 200 MB.
 */
export async function copyWorktreeIncludes(source: string, worktree: string): Promise<WorktreeIncludeResult> {
	const patterns = path.join(source, WORKTREE_INCLUDE_FILE);
	if (!existsSync(patterns)) return { copied: [], skipped: [] };
	const listed = (await git(source, ["ls-files", "--others", "--ignored", "-z", `--exclude-from=${patterns}`])).split("\0").filter(Boolean);
	const copied: string[] = [], skipped: string[] = [];
	let bytes = 0;
	for (const relative of listed) {
		const from = path.join(source, relative), to = path.join(worktree, relative);
		// Git only lists paths under the checkout; this guards against anything that resolves outside the worktree.
		if (path.relative(worktree, to).startsWith("..") || path.isAbsolute(path.relative(worktree, to))) { skipped.push(relative); continue; }
		const info = await lstat(from).catch(() => undefined);
		if (!info?.isFile() || existsSync(to)) { skipped.push(relative); continue; }
		if (copied.length >= MAX_FILES || bytes + info.size > MAX_BYTES) { skipped.push(relative); continue; }
		await mkdir(path.dirname(to), { recursive: true });
		await copyFile(from, to, constants.COPYFILE_EXCL);
		copied.push(relative); bytes += info.size;
	}
	return { copied, skipped };
}
