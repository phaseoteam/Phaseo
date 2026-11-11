/** Terminal links: web addresses and file paths in terminal output, with `file:line:col`. */
export type TerminalLink = { kind: "url" | "path"; text: string; start: number; end: number };

const urlPattern = /https?:\/\/[^\s"'`<>]+/giu;
// Bare paths start only at a segment boundary, so separator-free output is not rescanned at every suffix.
const pathPattern = /(?:~[\\/]|\.{1,2}[\\/]|\/|[A-Za-z]:[\\/]|\\\\)[^\s"'`<>]+|(?<![\p{L}\p{M}\p{N}._-])[\p{L}\p{M}\p{N}._-]+(?:[\\/][\p{L}\p{M}\p{N}._-]+)+(?::\d+){0,2}(?:\(\d+(?:,\d+)?\))?|(?<![\p{L}\p{M}\p{N}._/\\-])[\p{L}\p{M}\p{N}_-][\p{L}\p{M}\p{N}._-]*\.[A-Za-z][A-Za-z0-9]{0,9}(?::\d+){1,2}/gu;
// A question mark is legal in file names; only request targets with a query are left alone.
const requestRoutePattern = /(?:^|[\s"'`])(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|CONNECT|TRACE|proxying)\s+["'`]?(?:\/|[A-Za-z0-9_-]+\/)[^\s?]*\?\S*/g;

function trimClosing(value: string, kind: TerminalLink["kind"]) {
	// Paths also drop a trailing colon: compilers end `file:line:col:` with one.
	let output = value.replace(kind === "path" ? /[.,;:!?]+$/ : /[.,;!?]+$/, "");
	for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) while (output.endsWith(close) && output.split(open).length - 1 < output.split(close).length - 1) output = output.slice(0, -1);
	return output;
}
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export function extractTerminalLinks(line: string): TerminalLink[] {
	const routes = [...line.matchAll(requestRoutePattern)].map(match => ({ start: match.index, end: match.index + match[0].length }));
	const found: TerminalLink[] = [];
	for (const [kind, pattern] of [["url", urlPattern], ["path", pathPattern]] as const) for (const match of line.matchAll(pattern)) {
		const text = trimClosing(match[0], kind);
		if (!text || (kind === "path" && /^https?:\/\//i.test(text))) continue;
		const candidate = { kind, text, start: match.index, end: match.index + text.length };
		if (found.some(other => overlaps(other, candidate)) || (kind === "path" && routes.some(route => overlaps(route, candidate)))) continue;
		found.push(candidate);
	}
	return found.sort((a, b) => a.start - b.start);
}

/** A path with its position split off: `src/a.ts:12:5`, `src/a.ts(12,5)` or `src/a.ts`. */
export function splitPosition(text: string): { path: string; line?: number; column?: number } {
	const match = /^(.*?)(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\))$/.exec(text);
	if (!match || !match[1]) return { path: text };
	const line = Number(match[2] ?? match[4]), column = Number(match[3] ?? match[5]);
	return { path: match[1], ...line > 0 ? { line } : {}, ...column > 0 ? { column } : {} };
}

/** Folds `.` and `..` and uses forward slashes; keeps a drive letter or leading slash. */
function normalise(value: string) {
	const slashed = value.replace(/\\/g, "/"), root = /^[A-Za-z]:\//.exec(slashed)?.[0] ?? (slashed.startsWith("/") ? "/" : "");
	const parts: string[] = [];
	for (const part of slashed.slice(root.length).split("/")) { if (!part || part === ".") continue; if (part === "..") { if (!parts.length) return undefined; parts.pop(); } else parts.push(part); }
	return root + parts.join("/");
}

/**
 * The project-relative path a terminal path names, resolved against the terminal's folder, or undefined when it is
 * outside the project (the Files pane shows only the project's files). Windows compares without case.
 */
export function projectPath(text: string, cwd: string, projectDirectory: string, windows: boolean) {
	if (text.startsWith("~")) return undefined;
	const absolute = /^(?:[A-Za-z]:[\\/]|[\\/])/.test(text) ? text : `${cwd.replace(/[\\/]+$/, "")}/${text}`;
	const target = normalise(absolute), root = normalise(projectDirectory);
	if (!target || !root) return undefined;
	const same = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
	const prefix = root.endsWith("/") ? root : `${root}/`;
	if (!same(target.slice(0, prefix.length), prefix) || target.length === prefix.length) return undefined;
	return target.slice(prefix.length);
}

/** Terminal output handed to the composer as a fenced block. */
export function terminalContext(title: string, selection: string) {
	const text = selection.replace(/\s+$/g, "").replace(/^\n+/, "");
	const fence = text.includes("```") ? "````" : "```";
	return `Output from ${title}:\n${fence}text\n${text}\n${fence}`;
}
