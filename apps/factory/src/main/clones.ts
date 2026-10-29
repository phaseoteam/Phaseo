import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalClone } from "../shared/types";

/**
 * Finds clones of GitHub repositories on this computer, so a repository can be matched to its folder
 * without asking. GitHub doesn't know where anything was cloned, but each clone's .git/config names its
 * origin, and the coding tools people already use keep a list of the folders they've opened.
 */

/** owner/name from a GitHub remote URL, over HTTPS or SSH. */
export function githubRepoOf(url: string): string | null {
	const match = url.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
	return match ? `${match[1]}/${match[2]}` : null;
}

/** The origin remote's repository in a git config file's text. */
export function originOf(config: string): string | null {
	const section = config.match(/\[remote "origin"\]([^[]*)/)?.[1];
	const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1];
	return url ? githubRepoOf(url) : null;
}

const readText = (file: string) => readFile(file, "utf8").catch(() => "");
const isDir = (dir: string) => stat(dir).then((info) => info.isDirectory(), () => false);

/** Folders Claude Code, Codex, VS Code and Cursor remember opening. */
async function rememberedFolders(home: string): Promise<string[]> {
	const folders: string[] = [];
	try {
		folders.push(...Object.keys((JSON.parse(await readText(path.join(home, ".claude.json"))) as { projects?: object }).projects ?? {}));
	} catch { /* not there, or not JSON */ }
	for (const match of (await readText(path.join(home, ".codex", "config.toml"))).matchAll(/^\[projects\.(['"])(.+?)\1\]/gm)) folders.push(match[2]!);
	const appData = process.env.APPDATA ?? (process.platform === "darwin" ? path.join(home, "Library", "Application Support") : path.join(home, ".config"));
	for (const editor of ["Code", "Cursor"]) {
		const text = await readText(path.join(appData, editor, "User", "globalStorage", "storage.json"));
		for (const match of text.matchAll(/"(file:\/\/\/[^"]+)"/g)) {
			try {
				folders.push(fileURLToPath(match[1]!));
			} catch { /* not a local path */ }
		}
	}
	return folders;
}

/** Where people usually keep clones, searched two folders deep. Other drives' roots count on Windows. */
async function usualPlaces(home: string): Promise<string[]> {
	const places = [home, ...["Documents/GitHub", "source/repos", "code", "dev", "projects", "src", "repos", "GitHub", "Developer", "git"].map((dir) => path.join(home, dir))];
	if (process.platform === "win32") {
		for (const letter of "DEFGHIJ") places.push(`${letter}:\\`);
	}
	return places;
}

/** One spelling per folder: absolute, with Windows drive letters in capitals. */
const tidy = (dir: string) => path.resolve(dir).replace(/^[a-z]:/, (drive) => drive.toUpperCase());

const SKIP = new Set(["node_modules", "AppData", "Library", "Program Files", "Program Files (x86)", "Windows", "$Recycle.Bin", "System Volume Information"]);

async function children(dir: string): Promise<string[]> {
	const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(() => []);
	return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIP.has(entry.name)).map((entry) => path.join(dir, entry.name));
}

/**
 * The clone a folder belongs to: it, or the nearest parent with a .git folder. A .git file means a
 * worktree, which isn't counted; Factory makes its own worktrees from the clone.
 */
async function cloneRoot(dir: string): Promise<string | null> {
	for (let current = tidy(dir), steps = 0; steps < 5; steps++) {
		if (await isDir(path.join(current, ".git"))) return current;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
	return null;
}

export async function findClones(home = os.homedir()): Promise<LocalClone[]> {
	const roots = new Set<string>();
	await Promise.all((await rememberedFolders(home)).map(async (folder) => {
		const root = await cloneRoot(folder);
		if (root) roots.add(root);
	}));
	const levelOne = (await Promise.all((await usualPlaces(home)).map(children))).flat();
	const levelTwo = (await Promise.all(levelOne.map(children))).flat();
	await Promise.all([...levelOne, ...levelTwo].map(async (dir) => {
		if (await isDir(path.join(dir, ".git"))) roots.add(tidy(dir));
	}));

	const clones: (LocalClone & { used: number })[] = [];
	const seen = new Set<string>();
	await Promise.all([...roots].map(async (root) => {
		const key = root.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		const repo = originOf(await readText(path.join(root, ".git", "config")));
		if (repo) clones.push({ repo, path: root, used: await lastUsed(root) });
	}));
	return clones.sort((a, b) => b.used - a.used || a.path.localeCompare(b.path)).map(({ repo, path: dir }) => ({ repo, path: dir }));
}

/** When git last touched a clone: a commit, checkout or fetch rewrites its index or HEAD. */
async function lastUsed(root: string): Promise<number> {
	const times = await Promise.all(["index", "HEAD", "FETCH_HEAD"].map((file) => stat(path.join(root, ".git", file)).then((info) => info.mtimeMs, () => 0)));
	return Math.max(...times);
}

let cached: { at: number; clones: Promise<LocalClone[]> } | null = null;

/** Searching takes a second or two, so a result is reused for a minute. */
export function localClones(): Promise<LocalClone[]> {
	if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), clones: findClones() };
	return cached.clones;
}
