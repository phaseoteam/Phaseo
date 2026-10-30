import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GitFile, GitReview, ProjectFile } from "../shared/workspace";
import { extensionOf, FILE_EDIT_LIMIT, FILE_IMAGE_LIMIT, FILE_PDF_LIMIT, imageTypes, type FilePreview } from "../shared/filePreview";

const execute = promisify(execFile);
const outside = (root: string, absolute: string) => { const remainder = path.relative(root, absolute); return remainder === ".." || remainder.startsWith(`..${path.sep}`) || path.isAbsolute(remainder); };
export async function resolveProjectPath(root: string, relative: string): Promise<string> {
	if (typeof relative !== "string" || relative.includes("\0") || path.isAbsolute(relative)) throw new Error("Choose a path inside this project.");
	const absoluteRoot = await realpath(root);
	const absolute = await realpath(path.resolve(absoluteRoot, relative || "."));
	if (outside(absoluteRoot, absolute)) throw new Error("This path is outside the project.");
	return absolute;
}

/** A model-supplied path as project-relative with forward slashes and no `./`. Absolute paths inside the project are accepted. */
export async function projectRelativePath(root: string, value: unknown): Promise<string> {
	if (typeof value !== "string" || value.includes("\0")) throw new Error("Expected `path` as a project-relative path.");
	let candidate = value.trim();
	if (path.isAbsolute(candidate) && /^([a-zA-Z]:)?[\\/]/.test(candidate)) {
		const bases = [await realpath(root).catch(() => path.resolve(root)), path.resolve(root)], base = bases.find(base => !outside(base, path.resolve(candidate)));
		if (base) candidate = path.relative(base, path.resolve(candidate));
		else if (/^[\\/][^\\/]/.test(candidate)) candidate = candidate.slice(1);
		else throw new Error(`\`${value}\` is outside this project. Use a path relative to the project root, such as \`src/app.ts\`.`);
	}
	const normal = path.posix.normalize(candidate.replaceAll("\\", "/")).replace(/\/+$/, "");
	if (normal === ".." || normal.startsWith("../")) throw new Error(`\`${value}\` is outside this project. Use a path inside it.`);
	return normal === "." ? "" : normal.replace(/^(\.\/)+/, "");
}

export type ProjectTarget ={ root: string; absolute: string; exists: boolean; ancestor: string; missing: string[] };
/** Resolves a path that may not exist yet. The deepest existing ancestor is realpath-contained; `missing` lists the segments below it. */
export async function resolveProjectTarget(root: string, relative: string): Promise<ProjectTarget> {
	if (typeof relative !== "string" || relative.includes("\0") || path.isAbsolute(relative)) throw new Error("Choose a path inside this project.");
	const absoluteRoot = await realpath(root), lexical = path.resolve(absoluteRoot, relative || ".");
	if (outside(absoluteRoot, lexical)) throw new Error("This path is outside the project.");
	const missing: string[] = [];
	for (let current = lexical; ;) {
		let ancestor: string;
		try { ancestor = await realpath(current); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT" || current === absoluteRoot) throw error;
			missing.unshift(path.basename(current)); current = path.dirname(current); continue;
		}
		if (outside(absoluteRoot, ancestor)) throw new Error("This path is outside the project.");
		return { root: absoluteRoot, absolute: path.join(ancestor, ...missing), exists: !missing.length, ancestor, missing };
	}
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
	const git = async (args: string[]) => (await execute("git", ["--no-pager", "-c", "core.fsmonitor=false", ...args],{ cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } })).stdout;
	const [status, diff, stagedDiff, branch] = await Promise.all([
		git(["status", "--porcelain=v1", "-z"]), git(["diff", "--no-ext-diff", "--no-textconv", "--full-index"]),
		git(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--full-index"]), git(["branch", "--show-current"]),
	]);
	const files = parseGitStatus(status);
	const [upstream, counts, remotes] = await Promise.all([
		git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).then(value => value.trim(), () => ""),
		git(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]).then(value => value.trim().split(/\s+/).map(Number), () => [] as number[]),
		git(["remote"]).then(value => value.trim(), () => ""),
	]);
	return { status: files.map(file => `${file.indexStatus}${file.worktreeStatus} ${file.path}${file.oldPath ? ` ← ${file.oldPath}` : ""}`).join("\n"), files, diff, stagedDiff, diffHash: createHash("sha256").update(diff).digest("hex"), stagedDiffHash: createHash("sha256").update(stagedDiff).digest("hex"), branch: branch.trim(),
		...(upstream && counts.length === 2 ? { upstream: { name: upstream, behind: counts[0] || 0, ahead: counts[1] || 0 } } : {}), hasRemote: Boolean(remotes) };
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

/** What the file surface shows: editable text up to 1 MB, the first 1 MB of larger text, images, PDF text, or a binary notice. */
export async function readFilePreview(root: string, filename: string, extractPdf: (bytes: Uint8Array) => Promise<{ text: string; pages: number }>): Promise<FilePreview> {
	if (typeof filename !== "string" || !filename || filename.length > 4096) throw new Error("Invalid file request.");
	const absolute = await resolveProjectPath(root, filename);
	const metadata = await stat(absolute);
	if (!metadata.isFile()) throw new Error("This path is a folder or special file, not a regular file.");
	const size = metadata.size, extension = extensionOf(filename);
	if (imageTypes[extension]) {
		if (size > FILE_IMAGE_LIMIT) return { kind: "too-large", size };
		return { kind: "image", mimeType: imageTypes[extension], dataUrl: `data:${imageTypes[extension]};base64,${(await readFile(absolute)).toString("base64")}`, size };
	}
	if (extension === "pdf") {
		if (size > FILE_PDF_LIMIT) return { kind: "too-large", size };
		const pdf = await extractPdf(new Uint8Array(await readFile(absolute)));
		return { kind: "pdf", text: pdf.text, pages: pdf.pages, size };
	}
	const handle = await open(absolute, "r");
	try {
		const bytes = Buffer.alloc(Math.min(size, FILE_EDIT_LIMIT));
		let offset = 0;
		while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
		const content = bytes.subarray(0, offset);
		if (content.includes(0)) return { kind: "binary", size };
		if (size > FILE_EDIT_LIMIT) {
			// Drop a multi-byte character cut in half at the limit.
			const text = content.toString("utf8").replace(/\uFFFD$/, "");
			return { kind: "text", text, size, truncated: true };
		}
		const text = content.toString("utf8");
		return { kind: "text", text, size, truncated: false, hash: createHash("sha256").update(text).digest("hex") };
	} finally { await handle.close(); }
}
