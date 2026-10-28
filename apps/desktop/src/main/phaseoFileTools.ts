import { spawn } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { defineTool, type AgentTool } from "@phaseo/agent-sdk";
import { extensionOf, FILE_PDF_LIMIT, imageTypes } from "../shared/filePreview";
import { changeProjectFile, contentHash, deleteProjectFile, formatSize, readTextFile, TEXT_FILE_LIMIT } from "./projectEdits";
import { projectRelativePath, resolveProjectPath } from "./projectFiles";
import { projectFileIndex, refreshProjectIndex } from "./projectFileSearch";
import { instructionGate, type ProjectInstructions } from "./projectInstructions";
import { extractPdfText } from "./pdfText";
import { unifiedDiff } from "./unifiedDiff";

type PdfReader = (bytes: Uint8Array) => Promise<{ text: string; pages: number }>;
export type PhaseoFileToolOptions = { writable: boolean; instructions?: ProjectInstructions; extractPdf?: PdfReader };
type Input = Record<string, unknown>;
type Match = { path: string; line: number; text: string };

const READ_LINES = 2000, LINE_CHARS = 2000, READ_CHARS = 100_000, LIST_LIMIT = 500, MATCH_LIMIT = 200, MATCH_CHARS = 500, FIND_LIMIT = 500, SCAN_BYTES = 1024 * 1024, SEARCH_MS = 20_000;
const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString("en-GB")} ${count === 1 ? word : many}`;
const posix = (value: string) => value.split(path.sep).join("/");

function args(value: unknown): Input {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected the tool arguments as a JSON object.");
	return value as Input;
}
function text(input: Input, field: string): string {
	if (typeof input[field] !== "string") throw new Error(`Expected \`${field}\` as a string.`);
	return input[field];
}
const optionalText = (input: Input, field: string) => input[field] === undefined || input[field] === null ? undefined : text(input, field);
function whole(input: Input, field: string, fallback: number, min: number, max: number) {
	const value = input[field];
	if (value === undefined || value === null) return fallback;
	if (typeof value !== "number" || !Number.isInteger(value) || value < min) throw new Error(`Expected \`${field}\` as a whole number from ${min}.`);
	return Math.min(value, max);
}
const flag = (input: Input, field: string, fallback = false) => typeof input[field] === "boolean" ? input[field] as boolean : fallback;

const projectPath = projectRelativePath;
const shown = (relative: string) => relative || ".";

async function exists(root: string, relative: string) { return resolveProjectPath(root, relative).then(() => true, () => false); }
/** Rewrites a filesystem error about `relative` for the model. Errors that are already readable pass through. */
async function explain(error: unknown, root: string, relative: string, kind: "file" | "folder"): Promise<Error> {
	const code = (error as NodeJS.ErrnoException).code, syscall = (error as NodeJS.ErrnoException).syscall;
	if ((code === "ENOENT" || code === "ENOTDIR") && (syscall || (error as Error).message === "missing")) {
		let parent = path.posix.dirname(relative || ".");
		while (parent !== "." && !(await exists(root, parent))) parent = path.posix.dirname(parent);
		return new Error(`No ${kind} at \`${shown(relative)}\`. Use list_files on \`${parent}\` to see what exists.`);
	}
	if (error instanceof Error && /outside the project/.test(error.message)) return new Error(`\`${shown(relative)}\` is outside this project. Use a path inside it.`);
	if (syscall && (code === "EACCES" || code === "EPERM")) return new Error(`\`${shown(relative)}\` can't be accessed: permission denied.`);
	if (syscall && code === "EBUSY") return new Error(`\`${shown(relative)}\` is locked by another program. Try again shortly.`);
	return error instanceof Error ? error : new Error(String(error));
}
async function located(root: string, relative: string, kind: "file" | "folder") {
	try { const absolute = await resolveProjectPath(root, relative); return { absolute, stats: await stat(absolute), relative: posix(path.relative(await realpath(root), absolute)) }; }
	catch (error) { throw await explain(error, root, relative, kind); }
}

/** A read-only note when reading reveals instructions the model hasn't seen; reads never block. */
async function instructionNote(instructions: ProjectInstructions | undefined, relative: string, kind: "file" | "directory") {
	if (!instructions) return "";
	try {
		const change = await instructions.changesFor(relative, kind), files = change ? [...change.added, ...change.changed] : [];
		return files.length ? `\nNote: project instructions now apply here (${files.join(", ")}); they will be in your instructions from the next step.` : "";
	} catch (error) { return `\nNote: project instructions here could not be loaded: ${error instanceof Error ? error.message : "unknown error"}`; }
}

function splitLines(value: string) { const lines = value.split("\n"); if (lines.at(-1) === "") lines.pop(); return lines; }
const cutLine = (line: string, limit: number) => line.length > limit ? `${line.slice(0, limit)}… [line cut: ${(line.length - limit).toLocaleString("en-GB")} more characters]` : line;
const stripReturn = (line: string) => line.endsWith("\r") ? line.slice(0, -1) : line;

function numbered(label: string, header: string, body: string, offset: number, limit: number) {
	const lines = splitLines(body), total = lines.length;
	if (!total) return `${label} · empty${header}`;
	if (offset > total) throw new Error(`\`${label}\` has ${plural(total, "line")}; offset ${offset} is past the end.`);
	const output: string[] = []; let size = 0, last = offset - 1;
	for (let index = offset - 1; index < Math.min(total, offset - 1 + limit); index++) {
		const line = `${String(index + 1).padStart(6)}\t${cutLine(stripReturn(lines[index]), LINE_CHARS)}`;
		if (size + line.length > READ_CHARS && output.length) break;
		output.push(line); size += line.length + 1; last = index + 1;
	}
	const footer = last < total ? `\n[${plural(total - last, "more line")}. Continue with offset ${last + 1}.]` : "";
	return `${label} · ${plural(total, "line")} · showing ${offset}-${last}${header}\n${output.join("\n")}${footer}`;
}

async function readFileTool(root: string, input: Input, extractPdf: PdfReader, instructions?: ProjectInstructions) {
	const requested = await projectPath(root, input.path), offset = whole(input, "offset", 1, 1, Number.MAX_SAFE_INTEGER), limit = whole(input, "limit", READ_LINES, 1, READ_LINES);
	if (!requested) throw new Error("`.` is the project folder. Use list_files to see its contents.");
	const { absolute, stats } = await located(root, requested, "file"), label = requested;
	if (stats.isDirectory()) throw new Error(`\`${label}\` is a folder. Use list_files to see its contents.`);
	if (!stats.isFile()) throw new Error(`\`${label}\` is not a regular file.`);
	const note = await instructionNote(instructions, requested, "file"), extension = extensionOf(label);
	if (imageTypes[extension]) return `${label} is an image (${imageTypes[extension]}, ${formatSize(stats.size)}). Images can't be shown as text.${note}`;
	if (extension === "pdf") {
		if (stats.size > FILE_PDF_LIMIT) return `${label} is a PDF (${formatSize(stats.size)}), too large to extract text from.${note}`;
		try { const pdf = await extractPdf(new Uint8Array(await readFile(absolute))); return numbered(label, ` · PDF text, ${plural(pdf.pages, "page")}, ${formatSize(stats.size)}${note}`, pdf.text, offset, limit); }
		catch (error) { if (/past the end/.test(error instanceof Error ? error.message : "")) throw error; return `${label} is a PDF (${formatSize(stats.size)}); its text could not be extracted.${note}`; }
	}
	if (stats.size > TEXT_FILE_LIMIT) throw new Error(`\`${label}\` is ${formatSize(stats.size)}, over the ${formatSize(TEXT_FILE_LIMIT)} read limit. Use search_files to find the lines you need.`);
	const bytes = await readFile(absolute);
	if (bytes.includes(0)) return `${label} is a binary file (${formatSize(stats.size)}); it can't be read as text.${note}`;
	let decoded: string, valid = true;
	try { decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { decoded = bytes.toString("utf8"); valid = false; }
	const header = valid ? ` · hash: ${contentHash(decoded)}` : " · not valid UTF-8, shown with replacement characters; it can't be edited";
	return numbered(label, header + note, decoded.replace(/^\ufeff/, ""), offset, limit);
}

type Tree = { folders: Map<string, Tree>; files: string[] };
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
function renderTree(files: string[], folders: string[], base: string, recursive: boolean, limit: number) {
	const tree: Tree = { folders: new Map(), files: [] }, prefix = base ? `${base}/` : "";
	const add = (value: string, file: boolean) => {
		const parts = value.slice(prefix.length).split("/"); let node = tree;
		for (const part of file ? parts.slice(0, -1) : parts) { let child = node.folders.get(part); if (!child) node.folders.set(part, child = { folders: new Map(), files: [] }); node = child; }
		if (file) node.files.push(parts.at(-1)!);
	};
	for (const folder of folders) add(folder, false);
	for (const file of files) add(file, true);
	const lines: string[] = []; let total = 0;
	const walk = (node: Tree, at: string) => {
		for (const name of [...node.folders.keys()].sort(byName)) { total++; if (lines.length < limit) lines.push(`${at}${name}/`); if (recursive) walk(node.folders.get(name)!, `${at}${name}/`); }
		for (const name of node.files.sort(byName)) { total++; if (lines.length < limit) lines.push(`${at}${name}`); }
	};
	walk(tree, prefix);
	return { lines, total };
}
/** Files and folders below a folder by walking the disk, for projects outside Git and folders Git ignores. Links are listed, not followed. */
async function walkFiles(absolute: string, base: string, recursive: boolean, limit: number) {
	const files: string[] = [], folders: string[] = [], queue = [{ absolute, relative: base }];
	while (queue.length && files.length + folders.length < limit) {
		const folder = queue.shift()!;
		const entries = await readdir(folder.absolute, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			const relative = folder.relative ? `${folder.relative}/${entry.name}` : entry.name;
			if (!entry.isDirectory()) { files.push(relative); continue; }
			folders.push(relative);
			if (recursive) queue.push({ absolute: path.join(folder.absolute, entry.name), relative });
		}
	}
	return { files, folders };
}

async function listFilesTool(root: string, input: Input, instructions?: ProjectInstructions) {
	const requested = await projectPath(root, input.path ?? ""), recursive = flag(input, "recursive"), limit = whole(input, "limit", LIST_LIMIT, 1, 5000);
	const { absolute, stats, relative } = await located(root, requested, "folder");
	if (!stats.isDirectory()) throw new Error(`\`${shown(requested)}\` is a file, not a folder. Use read_file to read it.`);
	const note = await instructionNote(instructions, requested, "directory"), index = await projectFileIndex(root), prefix = relative ? `${relative}/` : "";
	let entries = { files: index.files.filter(file => file.startsWith(prefix)), folders: [] as string[] }, hidden = index.git;
	if (!index.git || !entries.files.length) { entries = await walkFiles(absolute, relative, recursive, 20_000); hidden = false; }
	const { lines, total } = renderTree(entries.files, entries.folders, relative, recursive, limit);
	if (!total) return `${shown(relative)}/ is empty${hidden ? " (or holds only Git-ignored files)" : ""}.${note}`;
	const extra = [total > lines.length ? `[${plural(total - lines.length, "more entry", "more entries")} not shown]` : "", index.truncated && hidden ? "[The project index stops at 50,000 files, so some files may be missing.]" : ""].filter(Boolean);
	return [`${shown(relative)}/ · ${plural(total, "entry", "entries")}${recursive ? ", recursive" : ""}${hidden ? " · Git-ignored files hidden" : ""}${note}`, ...lines, ...extra].join("\n");
}

/** Expands `{a,b}` alternatives so Git pathspecs, which lack them, can match. */
function expandBraces(glob: string): string[] {
	const open = glob.indexOf("{"), close = open < 0 ? -1 : glob.indexOf("}", open);
	if (close < 0) return [glob];
	return glob.slice(open + 1, close).split(",").flatMap(part => expandBraces(glob.slice(0, open) + part + glob.slice(close + 1))).slice(0, 64);
}
/** Glob syntax as a regular expression source: `**` crosses folders, `*` and `?` don't, plus `[...]` and `{a,b}`. */
function globSource(glob: string): string {
	let source = "";
	for (let index = 0; index < glob.length; index++) {
		const character = glob[index];
		if (character === "*" && glob[index + 1] === "*") {
			if ((index === 0 || glob[index - 1] === "/") && glob[index + 2] === "/") { source += "(?:[^/]*/)*"; index += 2; } else { source += ".*"; index++; }
		} else if (character === "*") source += "[^/]*";
		else if (character === "?") source += "[^/]";
		else if (character === "[" && glob.indexOf("]", index + 2) > 0) { const end = glob.indexOf("]", index + 2), body = glob.slice(index + 1, end); source += `[${body.startsWith("!") ? `^${body.slice(1)}` : body}]`.replaceAll("\\", "\\\\"); index = end; }
		else if (character === "{" && glob.indexOf("}", index) > 0) { const end = glob.indexOf("}", index); source += `(?:${glob.slice(index + 1, end).split(",").map(globSource).join("|")})`; index = end; }
		else source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return source;
}
/** Matches project paths below `base`. A glob without `/` matches file names at any depth. */
function globMatcher(glob: string, base = "") {
	const pattern = glob.replaceAll("\\", "/").replace(/^\.?\//, ""), prefix = base ? `${base.replace(/[.+^${}()|[\]\\*?]/g, "\\$&")}/` : "";
	const expression = new RegExp(`^${prefix}${pattern.includes("/") ? "" : "(?:[^/]*/)*"}${globSource(pattern)}$`, "i");
	return (file: string) => expression.test(file);
}

async function findFilesTool(root: string, input: Input) {
	const pattern = text(input, "pattern").trim();
	if (!pattern) throw new Error("Expected a glob `pattern`, such as `**/*.ts`.");
	const index = await projectFileIndex(root), matches = globMatcher(pattern), found = index.files.filter(matches).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
	if (!found.length) return `No files match \`${pattern}\`${index.git ? " (Git-ignored files are not searched)" : ""}.`;
	const more = found.length > FIND_LIMIT ? [`[${plural(found.length - FIND_LIMIT, "more file")} not shown. Use a narrower pattern.]`] : [];
	return [`${plural(found.length, "file")} match \`${pattern}\``, ...found.slice(0, FIND_LIMIT), ...more].join("\n");
}

let gitPcre = true;
function gitGrep(cwd: string, args: string[], limit: number, signal?: AbortSignal): Promise<{ matches: Match[]; more: boolean; timedOut: boolean; error?: string }> {
	return new Promise(resolve => {
		const child = spawn("git", args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
		const matches: Match[] = []; let buffer = "", errors = "", bytes = 0, more = false, timedOut = false, settled = false;
		const timer = setTimeout(() => { timedOut = true; child.kill(); }, SEARCH_MS), abort = () => child.kill();
		signal?.addEventListener("abort", abort, { once: true });
		const finish = (error?: string) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve({ matches, more, timedOut, error }); };
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			if (more) return;
			bytes += chunk.length; buffer += chunk;
			for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
				const [file, line, ...rest] = buffer.slice(0, newline).split("\0"); buffer = buffer.slice(newline + 1);
				if (!rest.length || !/^\d+$/.test(line)) continue;
				if (matches.length >= limit) { more = true; child.kill(); return; }
				matches.push({ path: file, line: Number(line), text: stripReturn(rest.join("\0")) });
			}
			if (bytes > 32 * 1024 * 1024) { more = true; child.kill(); }
		});
		child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk: string) => { if (errors.length < 4000) errors += chunk; });
		child.on("error", error => finish(error.message));
		child.on("close", code => finish(code === 0 || code === 1 || more || timedOut || signal?.aborted ? undefined : errors.trim() || `git grep exited with code ${code}`));
	});
}
/** Searches files under 1 MB one line at a time, for projects outside Git. */
async function scanFiles(root: string, files: string[], expression: RegExp, limit: number, signal?: AbortSignal) {
	const matches: Match[] = [], started = Date.now(), base = await realpath(root); let more = false, timedOut = false;
	scan: for (const file of files) {
		signal?.throwIfAborted();
		if (Date.now() - started > SEARCH_MS) { timedOut = true; break; }
		const absolute = path.join(base, file);
		const content = await lstat(absolute).then(stats => stats.isFile() && stats.size <= SCAN_BYTES ? readFile(absolute) : undefined, () => undefined);
		if (!content || content.includes(0)) continue;
		const lines = content.toString("utf8").split("\n");
		for (let index = 0; index < lines.length; index++) {
			if (!expression.test(lines[index])) continue;
			if (matches.length >= limit) { more = true; break scan; }
			matches.push({ path: file, line: index + 1, text: stripReturn(lines[index]) });
		}
	}
	return { matches, more, timedOut };
}
/** Match lines (`path:line: text`) with context lines (`path-line- text`) in blocks separated by `--`. */
async function withContext(root: string, matches: Match[], context: number) {
	const output: string[] = [], files = new Map<string, Match[]>();
	for (const match of matches) files.set(match.path, [...files.get(match.path) ?? [], match]);
	for (const [file, found] of files) {
		const lines = await resolveProjectPath(root, file).then(absolute => readFile(absolute, "utf8")).then(splitLines, () => undefined);
		if (!lines) { output.push(...found.map(match => `${file}:${match.line}: ${cutLine(match.text, MATCH_CHARS)}`)); continue; }
		const hits = new Set(found.map(match => match.line)); let end = 0;
		for (const match of found) {
			const from = Math.max(1, match.line - context), to = Math.min(lines.length, match.line + context);
			if (to <= end) continue;
			if (output.length && from > end + 1) output.push("--");
			for (let line = Math.max(from, end + 1); line <= to; line++) output.push(`${file}${hits.has(line) ? ":" : "-"}${line}${hits.has(line) ? ":" : "-"} ${cutLine(stripReturn(lines[line - 1]), MATCH_CHARS)}`);
			end = to;
		}
	}
	return output;
}

async function searchFilesTool(root: string, input: Input, signal?: AbortSignal, instructions?: ProjectInstructions) {
	const pattern = text(input, "pattern"), glob = optionalText(input, "glob")?.trim(), caseSensitive = flag(input, "caseSensitive", true), literal = flag(input, "literal");
	const context = whole(input, "contextLines", 0, 0, 10), limit = whole(input, "maxResults", MATCH_LIMIT, 1, 1000);
	if (!pattern) throw new Error("Expected a non-empty search `pattern`.");
	const requested = await projectPath(root, input.path ?? ""), { stats, relative } = await located(root, requested, "folder");
	const note = await instructionNote(instructions, requested, stats.isDirectory() ? "directory" : "file"), index = await projectFileIndex(root);
	let result: { matches: Match[]; more: boolean; timedOut: boolean; error?: string } | undefined;
	if (index.git) {
		const specs = stats.isDirectory() && glob ? expandBraces(glob).map(value => { const part = value.replaceAll("\\", "/").replace(/^\.?\//, ""); return `:(glob)${relative ? `${relative}/` : ""}${part.includes("/") ? "" : "**/"}${part}`; }) : relative ? [`:(literal)${relative}`] : [];
		const grep = (engine: string) => ["-c", "core.fsmonitor=false", "-c", "core.quotepath=off", "grep", "-n", "-I", "-z", "--untracked", "--no-color", ...caseSensitive ? [] : ["-i"], literal ? "-F" : engine, "-e", pattern, "--", ...specs];
		result = await gitGrep(root, grep(gitPcre ? "-P" : "-E"), limit, signal);
		if (result.error && gitPcre && /not compiled with|USE_LIBPCRE/i.test(result.error)) { gitPcre = false; result = await gitGrep(root, grep("-E"), limit, signal); }
		if (result.error && /command line|compile|regex|unmatched|invalid/i.test(result.error)) throw new Error(`Invalid search pattern: ${result.error.replace(/^fatal:\s*/, "").split("\n")[0]}. Set literal to search for the text as typed.`);
		if (result.error) result = undefined;
		signal?.throwIfAborted();
	}
	if (!result) {
		let expression: RegExp;
		try { expression = new RegExp(literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern, caseSensitive ? "" : "i"); }
		catch (error) { throw new Error(`Invalid search pattern: ${error instanceof Error ? error.message : "unknown error"}. Set literal to search for the text as typed.`, { cause: error }); }
		const within = stats.isDirectory() ? (glob ? globMatcher(glob, relative) : (file: string) => !relative || file.startsWith(`${relative}/`)) : (file: string) => file === relative;
		const files = stats.isDirectory() && !index.files.some(within) ? (await walkFiles(path.join(await realpath(root), relative), relative, true, 50_000)).files : index.files;
		result = await scanFiles(root, files.filter(within), expression, limit, signal);
	}
	const where = `${relative ? ` in \`${relative}\`` : ""}${glob ? ` matching \`${glob}\`` : ""}`;
	if (!result.matches.length) return `No matches for \`${pattern}\`${where}.${result.timedOut ? " The search stopped after 20 seconds; narrow it with path or glob." : ""}${note}`;
	const lines = context ? await withContext(root, result.matches, context) : result.matches.map(match => `${match.path}:${match.line}: ${cutLine(match.text, MATCH_CHARS)}`);
	const notices = [result.more ? `[Showing the first ${plural(result.matches.length, "match", "matches")}; there are more. Narrow the search with path or glob, or raise maxResults.]` : "", result.timedOut ? "[The search stopped after 20 seconds, so results may be incomplete.]" : ""].filter(Boolean);
	return [...lines, ...notices].join("\n") + note;
}

/** Keeps a file's BOM and dominant line ending when the model's text uses the other convention. */
function lineEndings(original: string) {
	const crlf = original.match(/\r\n/g)?.length ?? 0, lf = original.match(/\n/g)?.length ?? 0;
	const windows = crlf > 0 && crlf * 2 >= lf;
	return { bom: original.startsWith("\ufeff") ? "\ufeff" : "", fit: (value: string) => windows ? value.replace(/\r?\n/g, "\r\n") : value.replace(/\r\n/g, "\n") };
}
const stale = (relative: string) => new Error(`\`${relative}\` changed since you read it (its hash differs). Read it again, then retry.`);
const lineAt = (value: string, offset: number) => { let line = 1; for (let index = value.indexOf("\n"); index >= 0 && index < offset; index = value.indexOf("\n", index + 1)) line++; return line; };
type Edit = { oldString: string; newString: string; replaceAll: boolean; expectedHash?: string };

/** Applies an exact-match edit to a file's text, or throws a message saying why it can't. */
function applyEdit(relative: string, original: string, edit: Edit) {
	if (edit.expectedHash && edit.expectedHash !== contentHash(original)) throw stale(relative);
	const { bom, fit } = lineEndings(original), body = original.slice(bom.length);
	let oldString = fit(edit.oldString), newString = fit(edit.newString);
	const positions = (needle: string) => { const found: number[] = []; for (let index = body.indexOf(needle); index >= 0; index = body.indexOf(needle, index + needle.length)) found.push(index); return found; };
	let found = positions(oldString);
	if (!found.length && oldString !== edit.oldString) { found = positions(edit.oldString); if (found.length) { oldString = edit.oldString; newString = edit.newString; } }
	if (!found.length) {
		const first = edit.oldString.split(/\r?\n/).find(line => line.trim())?.trim(), near = first ? body.split("\n").findIndex(line => line.includes(first)) : -1;
		const hint = /^\s*\d+\t/.test(edit.oldString) ? " Leave out the line-number prefixes that read_file adds." : near >= 0 ? ` Its first line appears at line ${near + 1}; check the lines after it, including whitespace.` : " Read the file again and copy the text exactly, including indentation.";
		throw new Error(`\`oldString\` was not found in \`${relative}\`.${hint}`);
	}
	const lines = found.map(index => lineAt(body, index)), listed = `${lines.slice(0, 10).join(", ")}${lines.length > 10 ? ", …" : ""}`;
	if (found.length > 1 && !edit.replaceAll) throw new Error(`\`oldString\` matches ${found.length} places in \`${relative}\` (lines ${listed}). Include more surrounding lines to make it unique, or set replaceAll.`);
	let next = "", at = 0;
	for (const index of edit.replaceAll ? found : found.slice(0, 1)) { next += body.slice(at, index) + newString; at = index + oldString.length; }
	return { text: bom + next + body.slice(at), count: edit.replaceAll ? found.length : 1, lines: listed };
}
function editInput(input: Input): Edit {
	const oldString = text(input, "oldString"), newString = text(input, "newString");
	if (!oldString) throw new Error("`oldString` is empty. To create a file or replace all of it, use write_file.");
	if (oldString === newString) throw new Error("`oldString` and `newString` are the same, so there is nothing to change.");
	return { oldString, newString, replaceAll: flag(input, "replaceAll"), expectedHash: optionalText(input, "expectedHash") };
}
/** Shapes the full content of a write: an existing file keeps its BOM and line endings. */
function writeContent(relative: string, current: string | undefined, content: string, expected: string | undefined) {
	if (current === undefined) { if (expected && expected !== "new") throw new Error(`No file at \`${relative}\`, so expectedHash can't match. Omit expectedHash to create it.`); return content; }
	if (!expected || expected === "new") throw new Error(`\`${relative}\` already exists. Read it with read_file and pass its hash as expectedHash to replace it, or use edit_file for a smaller change.`);
	if (expected !== contentHash(current)) throw stale(relative);
	const { bom, fit } = lineEndings(current);
	return bom + fit(content.replace(/^\ufeff/, ""));
}

const pathParameter = { type: "string", description: "Project-relative path." };
export function phaseoFileTools(root: string, options: PhaseoFileToolOptions): AgentTool[] {
	const { instructions } = options, extractPdf = options.extractPdf ?? extractPdfText, gate = instructionGate(instructions);
	const read: AgentTool[] = [
		defineTool({
			id: "read_file", description: "Read a text file with line numbers. The header gives the hash to pass to edits. Use offset and limit (in lines) for long files.", parallelSafe: true, onError: "return-to-model",
			parameters: { type: "object", properties: { path: pathParameter, offset: { type: "integer", description: "First line, from 1." }, limit: { type: "integer", description: "Lines to read; default 2000." } }, required: ["path"], additionalProperties: false },
			execute: async (raw: unknown) => readFileTool(root, args(raw), extractPdf, instructions),
		}),
		defineTool({
			id: "list_files", description: "List a folder; folders end in /. Git-ignored files are hidden.", parallelSafe: true, onError: "return-to-model",
			parameters: { type: "object", properties: { path: { type: "string", description: "Folder; default the project root." }, recursive: { type: "boolean" }, limit: { type: "integer", description: "Default 500." } }, additionalProperties: false },
			execute: async (raw: unknown) => listFilesTool(root, args(raw), instructions),
		}),
		defineTool({
			id: "search_files", description: "Search file contents with a regular expression, or literal text. Returns path:line: text. Git-ignored and binary files are skipped.", parallelSafe: true, onError: "return-to-model",
			parameters: { type: "object", properties: {
				pattern: { type: "string" }, path: { type: "string", description: "Folder or file to search; default the whole project." }, glob: { type: "string", description: "Only files matching this glob, such as *.ts." },
				caseSensitive: { type: "boolean", description: "Default true." }, literal: { type: "boolean", description: "Match the pattern as plain text." }, contextLines: { type: "integer", description: "Lines of context around each match, up to 10." }, maxResults: { type: "integer", description: "Default 200." },
			}, required: ["pattern"], additionalProperties: false },
			execute: async (raw: unknown, context) => searchFilesTool(root, args(raw), context.signal, instructions),
		}),
		defineTool({
			id: "find_files", description: "Find files by glob, such as **/*.ts or src/**/test*. A pattern without / matches file names at any depth.", parallelSafe: true, onError: "return-to-model",
			parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"], additionalProperties: false },
			execute: async (raw: unknown) => findFilesTool(root, args(raw)),
		}),
	];
	if (!options.writable) return read;
	const change = async (relative: string, operation: () => Promise<string>) => {
		try { return await operation(); } catch (error) { throw await explain(error, root, relative, "file"); }
	};
	return [...read,
		defineTool({
			id: "edit_file", description: "Replace exact text in a file, after approval. oldString must match the file exactly and be unique unless replaceAll is set. Line endings are kept.", requireApproval: true, onError: "return-to-model",
			parameters: { type: "object", properties: { path: pathParameter, oldString: { type: "string" }, newString: { type: "string" }, replaceAll: { type: "boolean" }, expectedHash: { type: "string", description: "Hash from read_file; optional." } }, required: ["path", "oldString", "newString"], additionalProperties: false },
			async execute(raw: unknown) {
				const input = args(raw), relative = await projectPath(root, input.path), edit = editInput(input);
				const blocked = await gate(relative, "file"); if (blocked) return blocked;
				return change(relative, () => changeProjectFile(root, relative, async current => {
					if (!current) throw await explain(Object.assign(new Error("missing"), { code: "ENOENT" }), root, relative, "file");
					const result = applyEdit(relative, current.text, edit);
					return { text: result.text, result: `Edited ${relative}: replaced ${plural(result.count, "occurrence")} (line${result.count === 1 ? "" : "s"} ${result.lines}). hash: ${contentHash(result.text)}` };
				}));
			},
		}),
		defineTool({
			id: "write_file", description: "Create a file, or replace a whole file, after approval. To replace an existing file pass its hash from read_file as expectedHash; omit it for a new file. Missing folders are created.", requireApproval: true, onError: "return-to-model",
			parameters: { type: "object", properties: { path: pathParameter, content: { type: "string" }, expectedHash: { type: "string", description: "Hash from read_file, or new." } }, required: ["path", "content"], additionalProperties: false },
			async execute(raw: unknown) {
				const input = args(raw), relative = await projectPath(root, input.path), content = text(input, "content"), expected = optionalText(input, "expectedHash");
				if (!relative) throw new Error("Expected a file path, not the project folder.");
				if (Buffer.byteLength(content) > TEXT_FILE_LIMIT) throw new Error(`The content is over the ${formatSize(TEXT_FILE_LIMIT)} limit for one file.`);
				const blocked = await gate(relative, "file"); if (blocked) return blocked;
				const message = await change(relative, () => changeProjectFile(root, relative, current => {
					const next = writeContent(relative, current?.text, content, expected);
					return { text: next, result: `${current ? "Wrote" : "Created"} ${relative} (${plural(splitLines(next).length, "line")}). hash: ${contentHash(next)}` };
				}));
				refreshProjectIndex(root);
				return message;
			},
		}),
		defineTool({
			id: "delete_file", description: "Delete a text file, after approval. Pass its hash from read_file as expectedHash.", requireApproval: true, onError: "return-to-model",
			parameters: { type: "object", properties: { path: pathParameter, expectedHash: { type: "string" } }, required: ["path", "expectedHash"], additionalProperties: false },
			async execute(raw: unknown) {
				const input = args(raw), relative = await projectPath(root, input.path), expected = text(input, "expectedHash");
				const blocked = await gate(relative, "file"); if (blocked) return blocked;
				await change(relative, () => deleteProjectFile(root, relative, current => { if (contentHash(current.text) !== expected) throw stale(relative); }).then(() => ""));
				refreshProjectIndex(root);
				return `Deleted ${relative}.`;
			},
		}),
	];
}

/** Title and details for an approval card: a unified diff for edits and writes, the size for deletes. */
export async function describeFileCall(root: string, name: string, input: unknown): Promise<{ title: string; details: string }> {
	const verb = name === "edit_file" ? "Edit" : name === "write_file" ? "Write" : name === "delete_file" ? "Delete" : name;
	let relative = typeof (input as Input | undefined)?.path === "string" ? (input as Input).path as string : "";
	try {
		const value = args(input); relative = await projectPath(root, value.path);
		const target = await resolveProjectPath(root, relative).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; });
		const current = target ? (await readTextFile(target, relative)).text : undefined;
		if (name === "delete_file") {
			if (current === undefined) return { title: `Delete ${relative}`, details: `This will fail: no file at \`${relative}\`.` };
			return { title: `Delete ${relative}`, details: `${formatSize(Buffer.byteLength(current))} · ${plural(splitLines(current).length, "line")}` };
		}
		const strip = (value: string | undefined) => value?.replace(/^\ufeff/, "");
		if (name === "edit_file") {
			if (current === undefined) return { title: `Edit ${relative}`, details: `This edit will fail: no file at \`${relative}\`.` };
			const result = applyEdit(relative, current, editInput(value));
			return { title: `Edit ${relative}`, details: unifiedDiff(strip(current), strip(result.text), { path: relative }) + (result.count > 1 ? `\n\n${plural(result.count, "occurrence")} replaced.` : "") };
		}
		if (name === "write_file") {
			const next = writeContent(relative, current, text(value, "content"), optionalText(value, "expectedHash"));
			if (current === undefined) return { title: `Create ${relative}`, details: unifiedDiff(undefined, next, { path: relative }) || "(empty file)" };
			return { title: `Edit ${relative}`, details: unifiedDiff(strip(current), strip(next), { path: relative }) || "No changes." };
		}
		return { title: name, details: JSON.stringify(input, null, 2).slice(0, 8000) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { title: `${verb} ${relative}`.trim(), details: `This will fail: ${message}` };
	}
}
