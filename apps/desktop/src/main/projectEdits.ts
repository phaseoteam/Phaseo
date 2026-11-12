import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectTarget, type ProjectTarget } from "./projectFiles";

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Largest text file the agent's tools read whole, hash and edit. */
export const TEXT_FILE_LIMIT = 8 * 1024 * 1024;
export const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const coded = (message: string, code: string) => Object.assign(new Error(message), { code });
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const reserved = new Set(["con", "prn", "aux", "nul", "conin$", "conout$", ...[..."123456789¹²³"].flatMap(digit => [`com${digit}`, `lpt${digit}`])]);

/** Why a project path must not be written, or undefined: anything in .git, NTFS alternate data streams, and Windows device names. */
export function unsafeWritePath(relative: string, platform: NodeJS.Platform = process.platform): string | undefined {
	for (const segment of relative.split(/[\\/]+/)) {
		if (!segment || segment === "." || segment === "..") continue;
		if (/^\.git[. ]*$/i.test(segment) || /^git~\d+$/i.test(segment)) return "Files inside `.git` can't be changed.";
		if (segment.includes(":")) return `\`${segment}\` contains ":", which would write an NTFS alternate data stream.`;
		if (platform !== "win32") continue;
		if (reserved.has(segment.split(".")[0].replace(/ +$/, "").toLowerCase())) return `\`${segment}\` is a reserved Windows device name.`;
		if (/[. ]$/.test(segment)) return `\`${segment}\` ends with a dot or space, which Windows drops.`;
	}
}

/** Resolves a path the agent may write. The resolved location is checked too, so a link into .git is refused. */
export async function writableTarget(root: string, relative: string): Promise<ProjectTarget> {
	const reason = unsafeWritePath(relative); if (reason) throw coded(reason, "EUNSAFE");
	const target = await resolveProjectTarget(root, relative);
	const resolved = unsafeWritePath(path.relative(target.root, target.absolute)); if (resolved) throw coded(resolved, "EUNSAFE");
	return target;
}

export type TextFile = { bytes: Buffer; text: string; mode: number; size: number; mtimeMs: number };
/** Reads an existing file as UTF-8 for editing; refuses folders, binaries and other encodings. */
export async function readTextFile(absolute: string, label: string, limit = TEXT_FILE_LIMIT): Promise<TextFile> {
	const metadata = await stat(absolute);
	if (!metadata.isFile()) throw coded(`\`${label}\` is a folder, not a file.`, "EISDIR");
	if (metadata.size > limit) throw coded(`\`${label}\` is ${formatSize(metadata.size)}, over the ${formatSize(limit)} limit for text edits.`, "EFBIG");
	const bytes = await readFile(absolute);
	if (bytes.includes(0)) throw coded(`\`${label}\` is binary (or UTF-16), so it can't be edited as text.`, "EBINARY");
	let text: string;
	try { text = decoder.decode(bytes); } catch { throw coded(`\`${label}\` is not valid UTF-8 (it may be Latin-1 or another encoding), so it can't be edited without corrupting it.`, "EENCODING"); }
	return { bytes, text, mode: metadata.mode, size: metadata.size, mtimeMs: metadata.mtimeMs };
}

const locks = new Map<string, Promise<void>>();
/** Runs changes to one path one at a time within this process. */
export async function withPathLock<T>(absolute: string, operation: () => Promise<T>): Promise<T> {
	const key = process.platform === "linux" ? absolute : absolute.toLowerCase(), previous = locks.get(key) ?? Promise.resolve();
	let release!: () => void; const tail = previous.then(() => new Promise<void>(resolve => { release = resolve; }));
	locks.set(key, tail); await previous;
	try { return await operation(); }
	finally { release(); if (locks.get(key) === tail) locks.delete(key); }
}

async function renameWithRetry(from: string, to: string) {
	for (let attempt = 0; ; attempt++) {
		try { return await rename(from, to); }
		catch (error) {
			// Windows refuses to replace a file another program briefly holds open (editors, indexers, antivirus).
			if (process.platform !== "win32" || attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
			await new Promise(resolve => setTimeout(resolve, 40 * 2 ** attempt));
		}
	}
}

/** Writes a temporary file beside the target and renames it into place; creates missing folders for a new file. */
async function commitFile(target: ProjectTarget, label: string, bytes: Buffer, current?: TextFile) {
	const directory = path.dirname(target.absolute);
	if (!target.exists && !(await stat(target.ancestor)).isDirectory()) throw coded(`\`${label}\` can't be created because a parent is a file, not a folder.`, "ENOTDIR");
	if (target.missing.length > 1) await mkdir(directory, { recursive: true });
	const temporary = path.join(directory, `.${path.basename(target.absolute)}.${randomBytes(6).toString("hex")}.tmp`);
	await writeFile(temporary, bytes, { flag: "wx", ...(current && process.platform !== "win32" ? { mode: current.mode & 0o7777 } : {}) });
	try {
		if (!current) {
			// A hard link creates the file only if nothing is there; fall back to a checked rename where links are unsupported.
			try { await link(temporary, target.absolute); await unlink(temporary).catch(() => {}); return; }
			catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw coded(`\`${label}\` already exists.`, "EEXIST"); }
			if (await lstat(target.absolute).then(() => true, () => false)) throw coded(`\`${label}\` already exists.`, "EEXIST");
		} else {
			const latest = await stat(target.absolute);
			if (latest.size !== current.size || latest.mtimeMs !== current.mtimeMs) throw coded(`\`${label}\` changed while it was being written. Read it again before editing.`, "ESTALE");
		}
		await renameWithRetry(temporary, target.absolute);
	} catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

/** Reads, changes and atomically replaces one file under the per-path lock. `change` gets undefined for a missing file and returns the new text. */
export async function changeProjectFile<T>(root: string, relative: string, change: (current: TextFile | undefined, target: ProjectTarget) => Promise<{ text: string; result: T }> | { text: string; result: T }): Promise<T> {
	const label = relative.replaceAll("\\", "/"), planned = await writableTarget(root, relative);
	return withPathLock(planned.absolute, async () => {
		const target = await writableTarget(root, relative);
		const current = target.exists ? await readTextFile(target.absolute, label) : undefined;
		const { text, result } = await change(current, target);
		await commitFile(target, label, Buffer.from(text, "utf8"), current);
		return result;
	});
}

/** Deletes one file under the per-path lock after `check` accepts its current content. */
export async function deleteProjectFile(root: string, relative: string, check: (current: TextFile) => void) {
	const label = relative.replaceAll("\\", "/"), planned = await writableTarget(root, relative);
	return withPathLock(planned.absolute, async () => {
		const target = await writableTarget(root, relative);
		if (!target.exists) throw coded(`No file at \`${label}\`.`, "ENOENT");
		const current = await readTextFile(target.absolute, label);
		check(current); await unlink(target.absolute);
		return current;
	});
}

export async function writeProjectFile(root: string, filename: string, content: string, expected: string) {
	if (typeof filename !== "string" || !filename || path.isAbsolute(filename) || filename.includes("\0") || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error("Invalid file edit.");
	await changeProjectFile(root, filename, current => {
		if (expected === "new" && current) throw coded(`\`${filename}\` already exists.`, "EEXIST");
		if (expected !== "new" && !current) throw coded(`No file at \`${filename}\`.`, "ENOENT");
		if (current && contentHash(current.text) !== expected) throw new Error("The file changed since it was read. Read it again before editing.");
		return { text: content, result: undefined };
	});
	return { path: filename, hash: contentHash(content) };
}
