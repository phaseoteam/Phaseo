import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { GitFile, GitReview, ProjectFile } from "../shared/workspace";

const execute = promisify(execFile);
export async function resolveProjectPath(root: string, relative: string): Promise<string> {
	if (typeof relative !== "string" || relative.includes("\0") || path.isAbsolute(relative)) throw new Error("Choose a path inside this project.");
	const absoluteRoot = await realpath(root);
	const absolute = await realpath(path.resolve(absoluteRoot, relative || "."));
	const remainder = path.relative(absoluteRoot, absolute);
	if (remainder === ".." || remainder.startsWith(`..${path.sep}`) || path.isAbsolute(remainder)) throw new Error("This path is outside the project.");
	return absolute;
}

export async function listProjectFiles(root: string, directory: string): Promise<ProjectFile[]> {
	const absolute = await resolveProjectPath(root, directory);
	const entries = await readdir(absolute, { withFileTypes: true });
	return entries.filter(entry => ![".git", "node_modules"].includes(entry.name)).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0, 1000).map(entry => ({ name: entry.name, path: path.posix.join(directory.replaceAll("\\", "/"), entry.name), directory: entry.isDirectory() }));
}

export async function readProjectFile(root: string, filename: string): Promise<string> {
	const absolute = await resolveProjectPath(root, filename);
	const metadata = await stat(absolute);
	if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024) throw new Error("Preview supports text files up to 2 MB.");
	const content = await readFile(absolute);
	if (content.includes(0)) throw new Error("This file requires a binary preview.");
	return content.toString("utf8");
}

export async function gitReview(root: string): Promise<GitReview> {
	const git = async (args: string[]) => (await execute("git", ["--no-pager", ...args], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } })).stdout;
	const [status, diff, stagedDiff, branch] = await Promise.all([
		git(["status", "--porcelain=v1", "-z"]), git(["diff", "--no-ext-diff", "--no-textconv"]),
		git(["diff", "--cached", "--no-ext-diff", "--no-textconv"]), git(["branch", "--show-current"]),
	]);
	const files = parseGitStatus(status);
	return { status: files.map(file => `${file.indexStatus}${file.worktreeStatus} ${file.path}${file.oldPath ? ` ← ${file.oldPath}` : ""}`).join("\n"), files, diff, stagedDiff, branch: branch.trim() };
}

export function parseGitStatus(output: string): GitFile[] {
	const records = output.split("\0"); const files: GitFile[] = [];
	for (let index = 0; index < records.length; index++) {
		const value = records[index]; if (!value) continue;
		if (value.length < 4 || value[2] !== " ") throw new Error("Git returned an invalid status record.");
		const file: GitFile = { path: value.slice(3), indexStatus: value[0], worktreeStatus: value[1] };
		if (/[RC]/.test(value.slice(0, 2))) { file.oldPath = records[++index]; if (!file.oldPath) throw new Error("Git returned an incomplete rename record."); }
		files.push(file);
	}
	return files;
}
