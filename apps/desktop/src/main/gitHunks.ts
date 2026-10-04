import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import type { GitHunkReview } from "../shared/workspace";
import { git } from "./gitProcess";

export function gitFilename(value: unknown): string {
	if (typeof value !== "string" || !value || value.length > 10000 || value.includes("\0") || path.isAbsolute(value) || value.split(/[\\/]/).some(segment => segment === ".." || segment.toLowerCase() === ".git")) throw new Error("Choose a file inside this repository.");
	return value.replaceAll("\\", "/");
}

export async function readGitHunks(root: string, filename: unknown, staged: unknown): Promise<GitHunkReview> {
	const file = gitFilename(filename);
	if (typeof staged !== "boolean") throw new Error("Choose staged or unstaged changes.");
	const diff = await git(root, ["diff", ...(staged ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--full-index", "--no-renames", "--", `:(literal)${file}`]);
	const hash = createHash("sha256").update(diff).digest("hex");
	const starts = [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/gm)];
	const header = starts.length ? diff.slice(0, starts[0].index) : "";
	// Metadata changes and non-text content remain whole-file operations.
	if (!header || !/^index [a-f0-9]+\.\.[a-f0-9]+ 100(?:644|755)$/m.test(header) || /^(?:new file mode|deleted file mode|old mode|new mode|Binary files|GIT binary patch)/m.test(diff)) return { filename: file, staged, hash, hunks: [] };
	return { filename: file, staged, hash, hunks: starts.map((start, index) => ({ index, heading: start[0], text: diff.slice(start.index, starts[index + 1]?.index ?? diff.length), patch: header + diff.slice(start.index, starts[index + 1]?.index ?? diff.length) })) };
}

export async function applyGitHunk(root: string, command: Record<string, unknown>) {
	if (typeof command.hash !== "string" || !/^[a-f0-9]{64}$/.test(command.hash) || !Number.isSafeInteger(command.index) || (command.index as number) < 0) throw new Error("Invalid Git hunk.");
	const review = await readGitHunks(root, command.filename, command.type === "unstage-hunk");
	if (review.hash !== command.hash) throw new Error("The diff changed. Refresh before applying this action.");
	const hunk = review.hunks[command.index as number];
	if (!hunk) throw new Error("This change cannot be staged individually. Use the whole-file action.");
	await new Promise<void>((resolve, reject) => {
		const child = execFile("git", ["--no-pager", "apply", "--cached", "--recount", ...(review.staged ? ["--reverse"] : []), "-"], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, error => error ? reject(error) : resolve());
		child.stdin?.on("error", reject); child.stdin?.end(hunk.patch);
	});
}
