import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ProjectFile } from "../shared/workspace";

const execute = promisify(execFile);
const MAX_FILES = 50_000, INDEX_TTL = 15_000;
const skipped = new Set([".git", "node_modules"]);
const indexes = new Map<string, { at: number; files: Promise<string[]> }>();

/** Tracked and untracked files that Git does not ignore; a bounded walk when the project is not a repository. */
async function indexFiles(root: string): Promise<string[]> {
	try {
		const { stdout } = await execute("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
		return stdout.split("\0").filter(Boolean).slice(0, MAX_FILES);
	} catch {
		const files: string[] = [], queue = [""];
		while (queue.length && files.length < MAX_FILES) {
			const directory = queue.shift()!;
			const entries = await readdir(path.join(root, directory), { withFileTypes: true }).catch(() => []);
			for (const entry of entries) {
				if (skipped.has(entry.name)) continue;
				const relative = directory ? `${directory}/${entry.name}` : entry.name;
				if (entry.isDirectory()) queue.push(relative); else if (entry.isFile()) files.push(relative);
			}
		}
		return files;
	}
}

function projectIndex(root: string) {
	const cached = indexes.get(root);
	if (cached && Date.now() - cached.at < INDEX_TTL) return cached.files;
	const files = indexFiles(root);
	indexes.set(root, { at: Date.now(), files });
	files.catch(() => indexes.delete(root));
	return files;
}

/** Name matches beat path matches; an in-order subsequence is the last resort. Shorter paths win ties. */
function score(candidate: string, name: string, query: string) {
	if (name === query) return 1000;
	if (name.startsWith(query)) return 800;
	if (name.includes(query)) return 600;
	if (candidate.startsWith(query)) return 500;
	if (candidate.includes(query)) return 400;
	let at = 0, gaps = 0;
	for (const character of query) { const found = candidate.indexOf(character, at); if (found < 0) return 0; gaps += found - at; at = found + 1; }
	return Math.max(1, 200 - gaps);
}

/** Files and folders that match a query typed after `@`, best first. */
export function rankProjectPaths(files: string[], query: string, limit = 30): ProjectFile[] {
	const needle = query.trim().toLowerCase().replaceAll("\\", "/");
	const directories = new Set<string>();
	for (const file of files) for (let slash = file.indexOf("/"); slash >= 0; slash = file.indexOf("/", slash + 1)) directories.add(file.slice(0, slash));
	const candidates = [...directories].map(value => ({ path: value, directory: true })).concat(files.map(value => ({ path: value, directory: false })));
	const ranked = candidates.map(candidate => {
		const lower = candidate.path.toLowerCase(), name = lower.slice(lower.lastIndexOf("/") + 1);
		return { candidate, score: needle ? score(lower, name, needle) : 1 };
	}).filter(value => value.score > 0);
	ranked.sort((a, b) => b.score - a.score || a.candidate.path.split("/").length - b.candidate.path.split("/").length || Number(a.candidate.directory) - Number(b.candidate.directory) || a.candidate.path.length - b.candidate.path.length || a.candidate.path.localeCompare(b.candidate.path));
	return ranked.slice(0, limit).map(({ candidate }) => ({ name: candidate.path.slice(candidate.path.lastIndexOf("/") + 1), path: candidate.path, directory: candidate.directory }));
}

export async function searchProjectFiles(root: string, query: string, limit = 30): Promise<ProjectFile[]> {
	if (typeof query !== "string" || query.length > 500) throw new Error("Invalid file search.");
	return rankProjectPaths(await projectIndex(root), query, Math.max(1, Math.min(100, limit)));
}
