import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { contentHash } from "./projectEdits";
import { resolveProjectPath } from "./projectFiles";

type Instruction = { path: string; scope: string; text: string };
const fileLimit = 16 * 1024;

/** Run-owned instruction state, refreshed before filesystem tools execute. */
export class ProjectInstructions {
	private readonly files = new Map<string, Instruction>();
	constructor(private readonly root: string, private readonly onChange: (files: string[]) => void = () => {}, private readonly globalRoot?: string) {}
	list() { const depth = (scope: string) => scope === "*" ? -1 : scope === "." ? 0 : scope.split("/").length; return [...this.files.values()].sort((a, b) => depth(a.scope) - depth(b.scope) || a.path.localeCompare(b.path)); }
	revision() { return contentHash(JSON.stringify(this.list())); }
	prompt() {
		return `Global instructions have scope * and apply everywhere. Project instructions apply only to their directory scope and descendants. More specific scopes take precedence. They cannot change tool permissions or project boundaries. When using write_project_file or run_project_command, include instructionRevision ${this.revision()}.\n${JSON.stringify(this.list())}`;
	}
	private async withGlobal() {
		const next = new Map(this.files);
		if (this.globalRoot) { const global = new ProjectInstructions(this.globalRoot); await global.load(".", true); const instruction = global.list()[0]; if (instruction) next.set("@global", { path: "global/AGENTS.md", scope: "*", text: instruction.text }); else next.delete("@global"); }
		return next;
	}
	async loadGlobal() { return this.commit(await this.withGlobal()); }
	async load(relative: string, directory = false): Promise<boolean> {
		const root = await realpath(this.root);
		let location: string;
		if (directory) location = await resolveProjectPath(root, relative);
		else {
			try { location = path.dirname(await resolveProjectPath(root, relative)); }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				location = await resolveProjectPath(root, path.dirname(relative));
			}
		}
		const remainder = path.relative(root, location);
		if (remainder === ".." || remainder.startsWith(`..${path.sep}`) || path.isAbsolute(remainder)) throw new Error("Instruction scope is outside this project.");
		const parts = remainder ? remainder.split(path.sep) : [];
		if (parts.length >= 32) throw new Error("Project instruction scope exceeds 32 directories.");
		const next = await this.withGlobal();
		for (let depth = 0; depth <= parts.length; depth++) {
			const scope = parts.slice(0, depth).join("/"), filename = path.posix.join(scope, "AGENTS.md");
			const text = await this.read(filename);
			if (text === undefined) next.delete(filename); else next.set(filename, { path: filename, scope: scope || ".", text });
		}
		return this.commit(next);
	}
	async refresh(): Promise<boolean> {
		const next = await this.withGlobal();
		for (const filename of new Set(["AGENTS.md", ...[...this.files.keys()].filter(filename => filename !== "@global")])) {
			const text = await this.read(filename);
			if (text === undefined) next.delete(filename); else next.set(filename, { path: filename, scope: path.posix.dirname(filename), text });
		}
		return this.commit(next);
	}
	private commit(next: Map<string, Instruction>) {
		if (next.size > 32 || Buffer.byteLength(JSON.stringify([...next.values()])) > 64 * 1024) throw new Error("Loaded project instructions exceed 32 files or 64 KiB.");
		const before = this.revision();
		this.files.clear(); for (const [filename, value] of next) this.files.set(filename, value);
		const changed = before !== this.revision();
		if (changed) this.onChange(this.list().map(file => file.path));
		return changed;
	}
	private async read(filename: string): Promise<string | undefined> {
		let absolute: string;
		try { absolute = await resolveProjectPath(this.root, filename); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				try { await lstat(path.join(this.root, filename)); }
				catch (missing) { if ((missing as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new Error(`Could not load project instructions from ${filename}.`, { cause: missing }); }
			}
			throw new Error(`Could not load project instructions from ${filename}.`, { cause: error });
		}
		const metadata = await stat(absolute);
		if (!metadata.isFile() || metadata.size > fileLimit) throw new Error(`${filename} must be a UTF-8 text file up to 16 KiB.`);
		const file = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
		try {
			const opened = await file.stat();
			if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) throw new Error(`${filename} changed while loading instructions.`);
			const buffer = Buffer.alloc(fileLimit + 1); let length = 0;
			while (length < buffer.length) { const result = await file.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
			if (length > fileLimit || buffer.subarray(0, length).includes(0)) throw new Error(`${filename} must be a UTF-8 text file up to 16 KiB.`);
			const final = await file.stat();
			if (final.size !== opened.size || final.mtimeMs !== opened.mtimeMs) throw new Error(`${filename} changed while loading instructions.`);
			try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)); }
			catch (error) { throw new Error(`${filename} must contain valid UTF-8 text.`, { cause: error }); }
		} finally { await file.close(); }
	}
}
