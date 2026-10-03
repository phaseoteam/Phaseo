import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { gitReview, parseGitStatus } from "./projectFiles";

const execute = promisify(execFile);
const locks = new Map<string, Promise<unknown>>();
export async function git(root: string, args: string[]) {
	return (await execute("git", ["--no-pager", ...args], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout;
}
export async function gitBranches(root: string) {
	return (await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])).split(/\r?\n/).filter(Boolean);
}
export async function withGitLock<T>(root: string, run: () => Promise<T>): Promise<T> {
	const repository = (await git(root, ["rev-parse", "--show-toplevel"])).trim();
	const [projectRoot, repositoryRoot] = await Promise.all([realpath(root), realpath(repository)]);
	if (path.relative(projectRoot, repositoryRoot)) throw new Error("Open the repository root before changing Git state.");
	const common = await realpath((await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
	const key = process.platform === "win32" ? common.toLowerCase() : common;
	const previous = locks.get(key);
	const operation = (previous ?? Promise.resolve()).catch(() => {}).then(run);
	locks.set(key, operation);
	try { return await operation; } finally { if (locks.get(key) === operation) locks.delete(key); }
}
export async function gitCommand(root: string, value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Git action.");
	const command = value as Record<string, unknown>;
	if (!["stage", "unstage", "create-branch", "switch-branch", "commit"].includes(String(command.type))) throw new Error("Invalid Git action.");
	return withGitLock(root, async () => {
		if (command.type === "stage" || command.type === "unstage") {
			const filename = command.filename;
			if (typeof filename !== "string" || !filename || filename.length > 10000 || filename.includes("\0") || path.isAbsolute(filename) || filename.split(/[\\/]/).some(segment => segment === ".." || segment === ".git")) throw new Error("Choose a file inside this repository.");
			const literalPath = `:(literal)${filename.replaceAll("\\", "/")}`;
			const existing = parseGitStatus(await git(root, ["status", "--porcelain=v1", "-z"])).find(file => file.path === filename.replaceAll("\\", "/"));
			const paths = existing?.oldPath ? [literalPath, `:(literal)${existing.oldPath}`] : [literalPath];
			if (command.type === "stage") await git(root, ["add", "--", literalPath]);
			else {
				let hasHead = true;
				try { await git(root, ["rev-parse", "--verify", "HEAD"]); } catch { hasHead = false; }
				await git(root, hasHead ? ["reset", "--", ...paths] : ["rm", "--cached", "--", ...paths]);
			}
		} else if (command.type === "commit") {
			if (typeof command.message !== "string" || !command.message.trim() || command.message.length > 10000 || command.message.includes("\0")) throw new Error("Enter a commit message.");
			if (!(await git(root, ["diff", "--cached", "--name-only"])).trim()) throw new Error("Stage changes before committing.");
			await git(root, ["commit", "-m", command.message]);
		} else {
			if (typeof command.name !== "string" || !command.name || command.name.length > 200 || command.name.startsWith("-") || command.name.includes("\0")) throw new Error("Invalid branch name.");
			await git(root, ["check-ref-format", "--branch", command.name]);
			if ((await git(root, ["status", "--porcelain"])).trim()) throw new Error("Commit or stash working changes before switching branches.");
			if (command.type === "create-branch") await git(root, ["switch", "-c", command.name]);
			else {
				if (!(await gitBranches(root)).includes(command.name)) throw new Error("Choose an existing local branch.");
				await git(root, ["switch", command.name]);
			}
		}
		return gitReview(root);
	});
}
