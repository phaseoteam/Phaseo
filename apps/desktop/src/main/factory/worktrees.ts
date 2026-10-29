import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { proofKind } from "../../shared/factory/report";
import { FACTORY_BRANCH_PREFIX } from "../../shared/factory/intake";
import { PROOF_FOLDER } from "../../shared/factory/stages";
import type { ProofFile, WorkItem } from "../../shared/factory/types";

/** Factory's git work: one worktree per work item, and the folder each run saves its proof in. */

/** `raw`: the output as git printed it, for formats where leading spaces mean something. */
export function git(cwd: string, args: string[], raw = false): Promise<string> {
	return new Promise((resolve, reject) => {
		// Never waits on a password prompt nobody can see: a push that needs one fails and says so.
		execFile("git", ["-C", cwd, ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (error, stdout, stderr) => {
			if (error) reject(new Error(stderr.trim() || error.message));
			else resolve(raw ? stdout : stdout.trim());
		});
	});
}

function slug(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * One worktree per work item, reused by every stage so later stages see earlier stages' commits.
 * It never changes a branch of yours: a pull request is checked out under a name of Factory's own unless
 * its branch is one Factory made, and an existing branch is checked out as it is, never reset. `note` says
 * what happened to bring a pull request's worktree up to date, for the run's log.
 */
export async function prepareWorktree(root: string, checkout: string, item: WorkItem): Promise<{ dir: string; branch: string; note?: string }> {
	const dir = await worktreeFolder(root, checkout, item);
	const wanted = item.branch ?? `factory/${item.number}-${slug(item.title)}`;
	if (existsSync(dir)) {
		// The branch it really has: it may have been given another name when it was made.
		const current = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "");
		const note = item.kind === "pull" ? await catchUp(dir, item.number) : undefined;
		return { dir, branch: current && current !== "HEAD" ? current : wanted, note };
	}
	await mkdir(root, { recursive: true });
	// A worktree whose folder was deleted still holds its branch until it's pruned.
	await git(checkout, ["worktree", "prune"]).catch(() => undefined);
	if (item.kind === "pull") {
		// A branch can only be checked out once. When Factory fixed the issue this pull request
		// came from, that worktree already holds the branch and its commits, so the work carries on there.
		const holder = await worktreeWith(checkout, wanted);
		if (holder && inside(root, holder.dir)) return { dir: holder.dir, branch: wanted, note: await catchUp(holder.dir, item.number) };
		// Someone else's branch name (main, a fork's patch-1, a branch of yours) is never used for the local
		// branch: Factory works on factory/pr-N. Fixes still go to the pull request's own branch when pushed.
		const branch = wanted.startsWith(FACTORY_BRANCH_PREFIX) && !holder ? wanted : await freeBranch(checkout, `factory/pr-${item.number}`);
		if (await branchExists(checkout, branch)) {
			await git(checkout, ["worktree", "add", dir, branch]);
			return { dir, branch, note: await catchUp(dir, item.number) };
		}
		await git(checkout, ["fetch", "origin", `pull/${item.number}/head:${branch}`]);
		await git(checkout, ["worktree", "add", dir, branch]);
		return { dir, branch };
	}
	await git(checkout, ["fetch", "origin"]);
	const head = (await git(checkout, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "origin/main")) || "origin/main";
	// Never take a branch another worktree has out: a numbered name leaves that work alone.
	const branch = await freeBranch(checkout, wanted);
	// A branch that's already there keeps its commits, such as a fix that hasn't gone up as a pull request yet.
	if (await branchExists(checkout, branch)) await git(checkout, ["worktree", "add", dir, branch]);
	else await git(checkout, ["worktree", "add", "--no-track", "-b", branch, dir, head]);
	return { dir, branch };
}

/**
 * The work item's worktree folder. Different repositories can share a slug (acme/tools-api and acme-tools/api),
 * so a folder that's already there is only this item's when it's a worktree of the same clone; otherwise the
 * item gets a folder named with a hash of its repository too.
 */
async function worktreeFolder(root: string, checkout: string, item: WorkItem): Promise<string> {
	const plain = path.join(root, `${slug(item.repo)}-${item.number}`);
	if (!existsSync(plain) || (await sameClone(plain, checkout))) return plain;
	const hash = createHash("sha256").update(item.repo.toLowerCase()).digest("hex").slice(0, 8);
	const hashed = path.join(root, `${slug(item.repo)}-${hash}-${item.number}`);
	if (existsSync(hashed) && !(await sameClone(hashed, checkout))) throw new Error(`${hashed} is a worktree of another repository, so ${item.repo}#${item.number} can't use it`);
	return hashed;
}

/** Whether two folders are checkouts of the same clone: they share its .git folder. */
async function sameClone(dir: string, checkout: string): Promise<boolean> {
	const common = (cwd: string) => git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).then((found) => path.resolve(found).toLowerCase(), () => null);
	const [mine, theirs] = await Promise.all([common(dir), common(checkout)]);
	return mine !== null && mine === theirs;
}

async function branchExists(checkout: string, branch: string): Promise<boolean> {
	return git(checkout, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true, () => false);
}

/**
 * Brings a pull request's worktree up to its latest commits, when that only moves it forward and nothing
 * is uncommitted. Commits here that the pull request doesn't have yet are never thrown away.
 */
async function catchUp(dir: string, number: number): Promise<string | undefined> {
	if (!(await git(dir, ["fetch", "origin", `pull/${number}/head`]).then(() => true, () => false))) return "Couldn't read the pull request's latest commits; working on the ones already here";
	const head = await git(dir, ["rev-parse", "HEAD"]);
	const latest = await git(dir, ["rev-parse", "FETCH_HEAD"]);
	if (head === latest) return undefined;
	const behind = await git(dir, ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"]).then(() => true, () => false);
	if (!behind) return "This worktree has commits the pull request doesn't, so it was left as it is";
	if ((await changedFiles(dir)).length) return "The pull request has new commits, but this worktree has uncommitted changes, so it was left as it is";
	await git(dir, ["merge", "--ff-only", "FETCH_HEAD"]);
	return `Brought up to date with the pull request's latest commit, ${latest.slice(0, 7)}`;
}

/** Real paths, so a short Windows name (C:\Users\RUNNER~1) and the long one git reports compare equal. */
const real = (value: string) => { try { return realpathSync.native(value); } catch { return path.resolve(value); } };
const inside = (root: string, dir: string) => real(dir).toLowerCase().startsWith(real(root).toLowerCase() + path.sep);

/** The worktree that has a branch checked out, if one does and it's still there. */
async function worktreeWith(checkout: string, branch: string): Promise<{ dir: string; clone: boolean } | null> {
	const list = await git(checkout, ["worktree", "list", "--porcelain"]).catch(() => "");
	const clone = real(checkout).toLowerCase();
	for (const entry of list.split(/\r?\n\r?\n/)) {
		const dir = entry.match(/^worktree (.+)$/m)?.[1];
		if (!dir || !entry.split(/\r?\n/).includes(`branch refs/heads/${branch}`)) continue;
		if (real(dir).toLowerCase() === clone || existsSync(dir)) return { dir: path.normalize(dir), clone: real(dir).toLowerCase() === clone };
	}
	return null;
}

/** The branch name, or the first numbered one after it, that no worktree has checked out. */
async function freeBranch(checkout: string, wanted: string): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		const name = attempt === 1 ? wanted : `${wanted}-${attempt}`;
		if (!(await worktreeWith(checkout, name))) return name;
	}
}

export function proofDir(worktree: string, runId: string): string {
	return path.join(worktree, ...PROOF_FOLDER.split("/"), runId);
}

/** Makes the run's proof folder and keeps `.factory/` out of git, without touching the repository's .gitignore. */
export async function prepareProof(worktree: string, runId: string): Promise<string> {
	const dir = proofDir(worktree, runId);
	await mkdir(dir, { recursive: true });
	const exclude = path.resolve(worktree, await git(worktree, ["rev-parse", "--git-path", "info/exclude"]));
	const current = await readFile(exclude, "utf8").catch(() => "");
	if (!current.split(/\r?\n/).includes(".factory/")) {
		await mkdir(path.dirname(exclude), { recursive: true });
		await appendFile(exclude, `${current && !current.endsWith("\n") ? "\n" : ""}.factory/\n`);
	}
	return dir;
}

const MAX_PROOF_FILES = 40;

export async function collectProof(dir: string): Promise<Omit<ProofFile, "caption">[]> {
	const names = await readdir(dir).catch(() => [] as string[]);
	const files: Omit<ProofFile, "caption">[] = [];
	for (const name of names.sort()) {
		const info = await stat(path.join(dir, name)).catch(() => null);
		if (info?.isFile()) files.push({ name, kind: proofKind(name), bytes: info.size });
		if (files.length === MAX_PROOF_FILES) break;
	}
	return files;
}

/** Tracked or new files a run changed outside its proof folder. */
export async function changedFiles(worktree: string): Promise<string[]> {
	// Raw: each line starts with two status columns, and the first is often a space.
	const status = await git(worktree, ["status", "--porcelain", "--untracked-files=all"], true).catch(() => "");
	return status.split("\n").map((line) => line.slice(3).trim()).filter((file) => file && !file.startsWith(".factory/"));
}
