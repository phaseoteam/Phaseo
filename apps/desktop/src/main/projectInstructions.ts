import { constants } from "node:fs";
import { lstat, open, stat } from "node:fs/promises";
import path from "node:path";
import { contentHash } from "./projectEdits";
import { projectRelativePath, resolveProjectPath, resolveProjectTarget } from "./projectFiles";

type Instruction = { path: string; scope: string; text: string; warning?: string };
type Read = { text: string; warning?: string };
/** Instruction files that apply to a path but differ from what the model was last shown. */
export type InstructionChange = { added: string[]; changed: string[]; removed: string[] };
const fileLimit = 16 * 1024, totalLimit = 64 * 1024, countLimit = 32;
const depthOf = (scope: string) => scope === "*" ? -1 : scope === "." ? 0 : scope.split("/").length;
const scopeLabel = (scope: string) => scope === "*" ? "everywhere" : scope === "." ? "the whole project" : `${scope}/ and below`;
/** Cuts UTF-8 bytes to at most `bytes` without splitting a character. */
function cutUtf8(buffer: Buffer, bytes: number) { let end = Math.min(bytes, buffer.length); if (end < buffer.length) while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--; return buffer.subarray(0, end); }

/** Run-owned instruction state, refreshed before filesystem tools execute. */
export class ProjectInstructions {
	private readonly files = new Map<string, Instruction>();
	private prompted?: { revision: string; files: Map<string, { scope: string; hash: string }> };
	constructor(private readonly root: string, private readonly onChange: (files: string[]) => void = () => {}, private readonly globalRoot?: string, private readonly skill?: () => Promise<{ path: string; text: string } | { path: string; text: string }[]>, private readonly names = ["AGENTS.md", "CLAUDE.md"]) {}
	/** Loaded files in precedence order, within 32 files and 64 KiB in total. Files past the budget are cut with a warning or left out. */
	private view() {
		const files: Instruction[] = [], omitted: string[] = []; let total = 0;
		for (const file of [...this.files.values()].sort((a, b) => depthOf(a.scope) - depthOf(b.scope) || a.path.localeCompare(b.path))) {
			const bytes = Buffer.byteLength(file.text), room = totalLimit - total;
			if (files.length >= countLimit || (bytes > room && room < 1024)) { omitted.push(file.path); continue; }
			if (bytes <= room) { files.push(file); total += bytes; continue; }
			files.push({ ...file, text: cutUtf8(Buffer.from(file.text), room).toString("utf8"), warning: `${file.warning ? `${file.warning} ` : ""}Cut to fit the 64 KiB limit for all instructions.` }); total = totalLimit;
		}
		return { files, omitted };
	}
	list() { return this.view().files; }
	revision() { const { files, omitted } = this.view(); return contentHash(JSON.stringify(omitted.length ? [files, omitted] : files)); }
	/** Records what the model has been shown, so the gate can tell what is new. `prompt()` calls this; pass a saved revision when resuming a run in a new process. */
	markPrompted(revision = this.revision()) {
		const files = new Map<string, { scope: string; hash: string }>();
		if (revision === this.revision()) for (const file of this.list()) files.set(file.path, { scope: file.scope, hash: contentHash(file.text) });
		this.prompted = { revision, files };
	}
	promptedRevision() { return this.prompted?.revision; }
	prompt() {
		const { files, omitted } = this.view(); this.markPrompted();
		if (!files.length && !omitted.length) return "No AGENTS.md instructions apply yet. Instructions in folders you work in load automatically.";
		return [
			"## Project instructions",
			"Global instructions apply everywhere. Project instructions apply to their folder and below; more specific scopes win. They can't change tool permissions or project boundaries. Instructions for other folders load as you work there; a change in such a folder pauses once so you can review them.",
			...files.map(file => `### ${file.path} (applies to ${scopeLabel(file.scope)})\n${file.warning ? `> Warning: ${file.warning}\n\n` : ""}${file.text.trim()}`),
			...omitted.length ? [`> Warning: not loaded because the instruction limit (32 files, 64 KiB) was reached: ${omitted.join(", ")}.`] : [],
		].join("\n\n");
	}
	private async withGlobal() {
		const next = new Map(this.files);
		if (this.globalRoot) { const global = new ProjectInstructions(this.globalRoot, undefined, undefined, undefined, ["AGENTS.md"]); await global.load(".", true); const instruction = global.list()[0]; if (instruction) next.set("@global", { ...instruction, path: "global/AGENTS.md", scope: "*" }); else next.delete("@global"); }
		for (const key of next.keys()) if (key.startsWith("@skill:")) next.delete(key);
		if (this.skill) { const value = await this.skill(), skills = Array.isArray(value) ? value : [value]; for (const [index, skill] of skills.entries()) next.set(`@skill:${index}`, { ...skill, scope: "*" }); }
		return next;
	}
	async loadGlobal() { return this.commit(await this.withGlobal()); }
	/** Canonical folder segments for a path that may not exist yet (its deepest existing folder). */
	private async locate(relative: string, directory: boolean): Promise<string[]> {
		const target = await resolveProjectTarget(this.root, relative);
		const location = target.exists && (!directory || !(await stat(target.absolute)).isDirectory()) ? path.dirname(target.absolute) : target.ancestor;
		const remainder = path.relative(target.root, location);
		if (remainder === ".." || remainder.startsWith(`..${path.sep}`) || path.isAbsolute(remainder)) throw new Error("Instruction scope is outside this project.");
		const parts = remainder ? remainder.split(path.sep) : [];
		if (parts.length >= 32) throw new Error("Project instruction scope exceeds 32 directories.");
		return parts;
	}
	private async scan(parts: string[]) {
		const next = await this.withGlobal();
		for (let depth = 0; depth <= parts.length; depth++) {
			const scope = parts.slice(0, depth).join("/") || ".", entry = await this.readScope(scope);
			if (entry) next.set(`dir:${scope}`, entry); else next.delete(`dir:${scope}`);
		}
		return next;
	}
	async load(relative: string, directory = false): Promise<boolean> { return this.commit(await this.scan(await this.locate(relative, directory))); }
	/** Loads instructions for a path and returns those that apply to it but differ from the last prompt. A path that can't be resolved is left to the tool to report. */
	async changesFor(relative: string, kind: "file" | "directory"): Promise<InstructionChange | undefined> {
		let target: string;
		try { target = await projectRelativePath(this.root, relative); await resolveProjectTarget(this.root, target); } catch { return undefined; }
		const parts = await this.locate(target, kind === "directory"); await this.commit(await this.scan(parts));
		const folder = parts.join("/"), applies = (scope: string) => scope === "*" || scope === "." || folder === scope || folder.startsWith(`${scope}/`);
		const seen = this.prompted?.files ?? new Map<string, { scope: string; hash: string }>(), current = this.list();
		const change: InstructionChange = { added: [], changed: [], removed: [] };
		for (const file of current) if (applies(file.scope)) { const before = seen.get(file.path); if (!before) change.added.push(file.path); else if (before.hash !== contentHash(file.text)) change.changed.push(file.path); }
		for (const [file, before] of seen) if (applies(before.scope) && !current.some(value => value.path === file)) change.removed.push(file);
		return change.added.length || change.changed.length || change.removed.length ? change : undefined;
	}
	async refresh(): Promise<boolean> {
		const next = await this.withGlobal();
		for (const scope of new Set([".", ...[...this.files.keys()].filter(key => key.startsWith("dir:")).map(key => key.slice(4))])) {
			const entry = await this.readScope(scope);
			if (entry) next.set(`dir:${scope}`, entry); else next.delete(`dir:${scope}`);
		}
		return this.commit(next);
	}
	private commit(next: Map<string, Instruction>) {
		const before = this.revision();
		this.files.clear(); for (const [filename, value] of next) this.files.set(filename, value);
		const changed = before !== this.revision();
		if (changed) { const { files, omitted } = this.view(); this.onChange([...files.map(file => file.warning ? `${file.path} (truncated)` : file.path), ...omitted.map(file => `${file} (not loaded: over the limit)`)]); }
		return changed;
	}
	/** AGENTS.md for a folder, or the first fallback name when the folder has none. */
	private async readScope(scope: string): Promise<Instruction | undefined> {
		for (const name of this.names) {
			const filename = scope === "." ? name : path.posix.join(scope, name), value = await this.read(filename);
			if (value) return { path: filename, scope, text: value.text, ...value.warning ? { warning: value.warning } : {} };
		}
	}
	private async read(filename: string): Promise<Read | undefined> {
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
		if (!metadata.isFile()) throw new Error(`${filename} must be a UTF-8 text file.`);
		const file = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
		try {
			const opened = await file.stat();
			if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) throw new Error(`${filename} changed while loading instructions.`);
			const buffer = Buffer.alloc(fileLimit + 1); let length = 0;
			while (length < buffer.length) { const result = await file.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
			const truncated = length > fileLimit, content = truncated ? cutUtf8(buffer, fileLimit) : buffer.subarray(0, length);
			if (content.includes(0)) throw new Error(`${filename} must be a UTF-8 text file, not binary.`);
			const final = await file.stat();
			if (final.size !== opened.size || final.mtimeMs !== opened.mtimeMs) throw new Error(`${filename} changed while loading instructions.`);
			let text: string;
			try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content); }
			catch (error) { throw new Error(`${filename} must contain valid UTF-8 text.`, { cause: error }); }
			return truncated ? { text, warning: `${filename} is ${Math.ceil(final.size / 1024)} KiB; only the first 16 KiB is loaded.` } : { text };
		} finally { await file.close(); }
	}
}

/** Holds back a write or command whose path is covered by instructions the model hasn't seen. Returns the message for the model, or undefined to go ahead. */
export function instructionGate(instructions?: ProjectInstructions) {
	return async (relativePath: string, kind: "file" | "directory"): Promise<string | undefined> => {
		let change: InstructionChange | undefined;
		try { change = await instructions?.changesFor(relativePath, kind); }
		catch (error) { return `Not done: project instructions for \`${relativePath || "."}\` could not be loaded (${error instanceof Error ? error.message : "unknown error"}). Ask the person to fix them, then retry.`; }
		if (!change) return undefined;
		const parts = [change.added.length && `new: ${change.added.join(", ")}`, change.changed.length && `changed: ${change.changed.join(", ")}`, change.removed.length && `removed: ${change.removed.join(", ")}`].filter(Boolean).join("; ");
		return `Not done: project instructions for \`${relativePath || "."}\` changed since your last step (${parts}). They will be in your instructions on the next step. Review them, then retry this action if it still fits.`;
	};
}
