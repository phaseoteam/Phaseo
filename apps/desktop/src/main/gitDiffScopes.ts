import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { GitDiffContents } from "../shared/workspace";
import { isRefName, isTreeId, validateGitDiffRequest, type GitDiffRequest, type GitDiffResult, type GitRefs } from "../shared/gitDiff";
import { gitFilename } from "./gitHunks";
import { blobContents, workingContents } from "./gitDiffContents";

/** Large enough for a busy branch; beyond it the surface says the preview is incomplete. */
export const PATCH_LIMIT = 6 * 1024 * 1024;
const UNTRACKED_LIMIT = 200, UNTRACKED_FILE_LIMIT = 1024 * 1024;
const DIFF_FLAGS = ["--no-ext-diff", "--no-textconv", "--no-color", "--full-index"];

/** Runs git; `allowDifference` treats exit code 1 as success, which is how `diff --no-index` reports changes. */
export function runGit(root: string, args: string[], options: { allowDifference?: boolean; input?: string; env?: NodeJS.ProcessEnv } = {}) {
	return new Promise<string>((resolve, reject) => {
		const child = execFile("git", ["--no-pager", ...args], { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: PATCH_LIMIT * 2, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...options.env } }, (error, stdout) => {
			if (error && !(options.allowDifference && (error as { code?: unknown }).code === 1)) reject(error); else resolve(stdout);
		});
		child.stdin?.end(options.input ?? "");
	});
}

async function revision(root: string, ref: string) {
	try { return (await runGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).trim() || undefined; } catch { return undefined; }
}
async function emptyTree(root: string) { return (await runGit(root, ["mktree"], { input: "" })).trim(); }

export async function isRepository(root: string) {
	try { return (await runGit(root, ["rev-parse", "--is-inside-work-tree"])).trim() === "true"; } catch { return false; }
}

export async function gitRefs(root: string): Promise<GitRefs> {
	const [local, remote, current] = await Promise.all([
		runGit(root, ["for-each-ref", "--format=%(refname:short)", "--sort=-committerdate", "refs/heads/"]),
		runGit(root, ["for-each-ref", "--format=%(refname:short)", "--sort=-committerdate", "refs/remotes/"]),
		runGit(root, ["branch", "--show-current"]),
	]);
	const lines = (value: string) => value.split(/\r?\n/).filter(Boolean).slice(0, 500);
	return { local: lines(local), remote: lines(remote).filter(name => !name.endsWith("/HEAD") && name.includes("/")), current: current.trim() };
}

/** The branch a feature branch most likely started from: the remote's default branch, then main or master. */
export async function automaticBaseRef(root: string, current: string): Promise<string | undefined> {
	try {
		const remoteHead = (await runGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim();
		if (remoteHead && await revision(root, remoteHead)) return remoteHead;
	} catch { /* No remote default branch. */ }
	for (const candidate of ["origin/main", "origin/master", "main", "master"]) if (candidate !== current && await revision(root, candidate)) return candidate;
}

/** Patches for untracked files, which `git diff` leaves out, so new files show as additions. */
async function untrackedPatch(root: string, ignoreWhitespace: boolean) {
	const files = (await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
	let patch = "";
	for (const file of files.slice(0, UNTRACKED_LIMIT)) {
		const metadata = await stat(path.join(root, file)).catch(() => undefined);
		if (!metadata?.isFile() || metadata.size > UNTRACKED_FILE_LIMIT) continue;
		patch += await runGit(root, ["diff", "--no-index", ...DIFF_FLAGS, ...(ignoreWhitespace ? ["-w"] : []), "--", "/dev/null", file], { allowDifference: true });
		if (patch.length > PATCH_LIMIT) break;
	}
	return { patch, truncated: files.length > UNTRACKED_LIMIT };
}

/** Cuts an oversized patch at the last whole file that fits. */
export function limitPatch(patch: string, limit = PATCH_LIMIT) {
	if (patch.length <= limit) return { patch, truncated: false };
	const cut = patch.lastIndexOf("\ndiff --git ", limit);
	return { patch: cut > 0 ? patch.slice(0, cut + 1) : "", truncated: true };
}

type ScopedDiff = GitDiffResult & { base?: string; target?: string };
export async function gitScopedDiff(root: string, value: unknown): Promise<ScopedDiff> {
	const request: GitDiffRequest = validateGitDiffRequest(value);
	if (!await isRepository(root)) return { patch: "", hash: "", truncated: false, repository: false };
	const whitespace = request.ignoreWhitespace ? ["-w"] : [];
	let base: string, target: string | undefined, headRef: string | undefined, baseRef: string | undefined;
	if (request.scope === "turn") { base = request.from; target = request.to; }
	else {
		const head = await revision(root, "HEAD");
		headRef = (await runGit(root, ["branch", "--show-current"])).trim() || "HEAD";
		if (request.scope === "branch") {
			if (request.baseRef) { await runGit(root, ["check-ref-format", "--allow-onelevel", request.baseRef]); if (!await revision(root, request.baseRef)) throw new Error(`${request.baseRef} no longer exists.`); }
			baseRef = request.baseRef ?? await automaticBaseRef(root, headRef);
		}
		const mergeBase = baseRef && head ? (await runGit(root, ["merge-base", baseRef, "HEAD"]).catch(() => "")).trim() : "";
		base = mergeBase || head || await emptyTree(root);
	}
	const tracked = await runGit(root, ["diff", ...DIFF_FLAGS, ...whitespace, base, ...(target ? [target] : []), "--"]);
	const untracked = target ? { patch: "", truncated: false } : await untrackedPatch(root, request.ignoreWhitespace === true);
	const limited = limitPatch(tracked + untracked.patch);
	return { patch: limited.patch, hash: createHash("sha256").update(limited.patch).digest("hex"), truncated: limited.truncated || untracked.truncated, repository: true, headRef, baseRef, base, target };
}

/** Old and new text of one changed file, so the viewer can expand unchanged lines. */
export async function readScopedDiffContents(root: string, value: unknown): Promise<GitDiffContents> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diff context request.");
	const request = value as Record<string, unknown>;
	const filename = gitFilename(request.filename), oldName = request.oldFilename === undefined ? filename : gitFilename(request.oldFilename);
	if (typeof request.hash !== "string" || !/^[a-f0-9]{64}$/.test(request.hash)) throw new Error("Invalid diff context request.");
	const diff = await gitScopedDiff(root, request.diff);
	if (diff.hash !== request.hash) throw new Error("The diff changed. Refresh to see the latest changes.");
	if (!diff.base || (!isTreeId(diff.base) && !isRefName(diff.base))) throw new Error("Full context is unavailable for this comparison.");
	const [oldText, newText] = await Promise.all([
		blobContents(root, `${diff.base}:${oldName}`),
		diff.target ? blobContents(root, `${diff.target}:${filename}`) : workingContents(root, filename),
	]);
	return { oldFile: { name: oldName, contents: oldText }, newFile: { name: filename, contents: newText } };
}
