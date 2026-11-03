import { phoneLimits, type PhoneDiffFile, type PhoneGitFile, type PhoneResults } from "@phaseo/phone-protocol";
import type { GitDiffResult } from "../../shared/gitDiff";
import type { GitFile } from "../../shared/workspace";

/** What git_status needs of the window's review read (projectFiles' gitWorkingStatus). */
export type GitWorkingStatus = { files: GitFile[]; branch: string; upstream?: { name: string; ahead: number; behind: number }; hasRemote?: boolean };

/** A status pair as one word, the way the window's changed-files list reads it. */
function statusWord(file: GitFile): PhoneGitFile["status"] {
	const pair = `${file.indexStatus}${file.worktreeStatus}`;
	if (pair === "??") return "untracked";
	if (pair.includes("U") || pair === "AA" || pair === "DD") return "conflicted";
	if (pair.includes("R") || pair.includes("C")) return "renamed";
	if (pair.includes("A")) return "added";
	if (pair.includes("D")) return "deleted";
	return "modified";
}

export function phoneGitStatus(status: GitWorkingStatus | null): PhoneResults["git_status"] {
	if (!status) return { repository: false, branch: "", hasRemote: false, files: [] };
	return {
		repository: true, branch: status.branch, ...status.upstream ? { upstream: status.upstream } : {}, hasRemote: status.hasRemote === true,
		files: status.files.map(file => ({ path: file.path, ...file.oldPath ? { oldPath: file.oldPath } : {}, status: statusWord(file), staged: file.indexStatus !== " " && file.indexStatus !== "?" })),
	};
}

/** Git's C-quoted path ("a/caf\303\251.txt"), or the path as it is. */
function unquote(value: string) {
	if (!value.startsWith("\"") || !value.endsWith("\"")) return value;
	const bytes: number[] = [], inner = value.slice(1, -1), escapes: Record<string, number> = { n: 10, t: 9, r: 13, "\"": 34, "\\": 92, a: 7, b: 8, f: 12, v: 11 };
	for (let index = 0; index < inner.length; index++) {
		const char = inner[index]!;
		if (char !== "\\") { bytes.push(...Buffer.from(char)); continue; }
		const octal = /^[0-7]{3}/.exec(inner.slice(index + 1));
		if (octal) { bytes.push(parseInt(octal[0], 8)); index += 3; continue; }
		const next = inner[++index] ?? "";
		bytes.push(escapes[next] ?? next.charCodeAt(0));
	}
	return Buffer.from(bytes).toString("utf8");
}
const side = (value: string, prefix: string) => {
	const path = unquote(value.trim());
	return path === "/dev/null" ? null : path.startsWith(prefix) ? path.slice(prefix.length) : path;
};

/** A unified diff (git's, with untracked files added) cut into its files, with each one's lines counted. */
export function splitPatch(patch: string): PhoneDiffFile[] {
	const starts: number[] = [];
	if (patch.startsWith("diff --git ")) starts.push(0);
	for (let at = patch.indexOf("\ndiff --git "); at >= 0; at = patch.indexOf("\ndiff --git ", at + 1)) starts.push(at + 1);
	return starts.map((start, index) => {
		const text = patch.slice(start, starts[index + 1] ?? patch.length), lines = text.split("\n");
		let oldPath: string | null | undefined, newPath: string | null | undefined, renamed = false, binary = false, hunks = false, additions = 0, deletions = 0;
		for (const line of lines) {
			if (hunks) {
				if (line.startsWith("+")) additions++;
				else if (line.startsWith("-")) deletions++;
				continue;
			}
			if (line.startsWith("@@")) hunks = true;
			else if (line.startsWith("--- ")) oldPath = side(line.slice(4), "a/");
			else if (line.startsWith("+++ ")) newPath = side(line.slice(4), "b/");
			else if (line.startsWith("rename from ")) { oldPath = unquote(line.slice(12)); renamed = true; }
			else if (line.startsWith("rename to ")) { newPath = unquote(line.slice(10)); renamed = true; }
			else if (line.startsWith("new file mode")) oldPath = null;
			else if (line.startsWith("deleted file mode")) newPath = null;
			else if (line.startsWith("Binary files ") || line === "GIT binary patch") binary = true;
		}
		// A binary or mode-only change has no ---/+++ lines; its header names it twice ("a/x b/x"), since a rename has its own lines.
		if (oldPath === undefined || newPath === undefined) {
			const header = lines[0]!.slice("diff --git ".length), half = (header.length - 1) / 2;
			const left = side(header.slice(0, half), "a/"), right = side(header.slice(half + 1), "b/");
			const name = left !== null && left === right ? left : side(header.slice(0, Math.max(0, header.lastIndexOf(" b/"))), "a/") ?? "";
			if (oldPath === undefined) oldPath = name;
			if (newPath === undefined) newPath = name;
		}
		const path = newPath ?? oldPath ?? "";
		const status = oldPath === null ? "added" : newPath === null ? "deleted" : renamed && oldPath !== newPath ? "renamed" : "modified";
		return {
			path, ...status === "renamed" && oldPath ? { oldPath } : {}, status, additions: binary ? -1 : additions, deletions: binary ? -1 : deletions,
			...binary ? { binary: true as const } : { patch: text.endsWith("\n") ? text : `${text}\n` },
		};
	});
}

/** Room left in a frame for its other fields and encryption. */
const diffBudget = phoneLimits.frameBytes - 64 * 1024;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) + 1;

/**
 * A diff for one frame: every file listed, and patches in order while they fit. A file whose patch is past the budget,
 * or larger than diffFileBytes on its own, comes without it, for read_diff_file. If even the list doesn't fit, the
 * rest is left out and the answer says truncated.
 */
export function phoneDiff(diff: Pick<GitDiffResult, "patch" | "hash" | "truncated" | "repository" | "headRef" | "baseRef">): PhoneResults["read_diff"] {
	const base = { repository: diff.repository, hash: diff.hash, ...diff.headRef ? { headRef: diff.headRef } : {}, ...diff.baseRef ? { baseRef: diff.baseRef } : {} };
	const all = splitPatch(diff.patch), files: PhoneDiffFile[] = [];
	let used = bytes(base) + 64, truncated = diff.truncated;
	const listed = all.map(({ patch: _patch, ...file }) => file);
	for (const file of listed) {
		const size = bytes(file);
		if (used + size > diffBudget) { truncated = true; break; }
		files.push(file); used += size;
	}
	for (let index = 0; index < files.length; index++) {
		const patch = all[index]!.patch;
		if (!patch || Buffer.byteLength(patch) > phoneLimits.diffFileBytes) continue;
		const size = bytes(patch);
		if (used + size > diffBudget) continue;
		files[index] = { ...files[index]!, patch }; used += size;
	}
	return { ...base, files, truncated };
}

/** One file of a diff, its patch cut at the last whole line under diffFileBytes. */
export function phoneDiffFile(diff: Pick<GitDiffResult, "patch">, path: string): PhoneDiffFile | undefined {
	const file = splitPatch(diff.patch).find(value => value.path === path);
	if (!file?.patch || Buffer.byteLength(file.patch) <= phoneLimits.diffFileBytes) return file;
	const head = Buffer.from(file.patch).subarray(0, phoneLimits.diffFileBytes).toString("utf8");
	return { ...file, patch: head.slice(0, head.lastIndexOf("\n") + 1), truncated: true };
}
