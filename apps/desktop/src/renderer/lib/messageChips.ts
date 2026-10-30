import { parseMentions } from "./mentions";

/**
 * Finds what messages show as chips: chat tokens, `@path` mentions, http(s) links and text that is clearly a
 * file path. Only unambiguous paths count, so versions (1.2.3), emails, fractions (a/b) and code stay text.
 */
export type FileChip = { kind: "file" | "folder"; path: string; line?: number; column?: number };
export type Chip = FileChip | { kind: "link"; href: string } | { kind: "chat"; id: string; label: string };
export type ChipSegment = string | Chip;

const segmentPattern = /^[\p{L}\p{N}_.~+@%$[\]()-]+$/u;
const extension = /\.[a-z][a-z\d]{0,9}$/i;
const positionPattern = /(?::(\d+)(?::(\d+))?|#L(\d+)(?:C(\d+)|-L\d+)?)$/i;
const domainLike = /^[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/i;
const posixRoots = /^\/(?:Users|home|tmp|var|etc|opt|usr|mnt|private|Volumes|srv|workspaces?)\//;
// A candidate starts the text or follows whitespace or an opening bracket or quote.
const candidates = /(?<=^|[\s([{<"'])[^\s<>"'`]+/gu;
const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };

function trim(word: string) {
	let start = 0, end = word.length;
	while (start < end && "([{<*".includes(word[start])) start++;
	for (;;) {
		const last = word[end - 1];
		if (end <= start) break;
		if (".,;:!?*'\"".includes(last)) { end--; continue; }
		const open = closers[last];
		if (open) { const body = word.slice(start, end); if (body.split(open).length < body.split(last).length) { end--; continue; } }
		break;
	}
	return { start, end };
}

const number = (value?: string) => value === undefined ? undefined : Number(value);
function withPosition(value: string) {
	const match = positionPattern.exec(value);
	if (!match) return { path: value };
	const line = number(match[1] ?? match[3]), column = number(match[2] ?? match[4]);
	return { path: value.slice(0, match.index), line: line && line <= 10_000_000 ? line : undefined, column: column && column <= 10_000_000 ? column : undefined };
}

function validSegments(segments: string[]) { return segments.every(segment => segment && segmentPattern.test(segment) && (segment === "." || segment === ".." || !segment.endsWith("."))); }

/** A whole string that is clearly a file or folder path, with an optional `:line[:col]` or `#L12`. */
export function filePath(value: string): FileChip | undefined {
	if (!value || value.length > 1024 || /\s/.test(value)) return;
	const { path, line, column } = withPosition(value);
	const folder = /[\\/]$/.test(path), body = path.replace(/[\\/]+$/, "");
	const chip = (): FileChip => ({ kind: folder ? "folder" : "file", path, ...(line ? { line } : {}), ...(column && line ? { column } : {}) });
	// Windows drive paths are unambiguous.
	if (/^[a-z]:[\\/]/i.test(body)) return body.length > 3 && validSegments(body.slice(3).split(/[\\/]/)) ? chip() : undefined;
	// Home and explicitly relative paths.
	const relative = /^(?:~|\.{1,2})[\\/](.+)$/.exec(body);
	if (relative) return validSegments(relative[1].split(/[\\/]/)) ? chip() : undefined;
	const segments = body.replace(/^\//, "").split(/[\\/]/);
	if (segments.length < 2 || !validSegments(segments)) return;
	const named = !folder && extension.test(segments.at(-1)!);
	// Absolute paths need a file extension or a well-known root, so `/api/v1/users` stays text.
	if (body.startsWith("/")) return named || posixRoots.test(`${body}/`) ? chip() : undefined;
	// Other relative paths need a file extension and must not start with a domain (`example.com/a.html`) or read as prose (`React/Next.js`).
	if (!named || domainLike.test(segments[0]) || (segments.length === 2 && /^[A-Z]/.test(segments[0]) && /^[A-Z]\w*\.js$/.test(segments[1]))) return;
	return chip();
}

/** `@path`, as the composer sends file mentions; `@dir/` is a folder. Scoped packages (`@types/node`) have neither an extension nor a trailing slash. */
function mentionPath(value: string): FileChip | undefined {
	const { path, line, column } = withPosition(value);
	if (!/[\\/]$/.test(path) && !extension.test(path)) return;
	if (!validSegments(path.replace(/^(?:[a-z]:)?[\\/]|[\\/]+$/gi, "").split(/[\\/]/))) return;
	return { kind: /[\\/]$/.test(path) ? "folder" : "file", path, ...(line ? { line } : {}), ...(column && line ? { column } : {}) };
}

/** Links, `@path` mentions and clear file paths in plain text. */
export function textChips(text: string): ChipSegment[] {
	const segments: ChipSegment[] = [];
	let last = 0;
	const push = (value: string) => { if (!value) return; if (typeof segments.at(-1) === "string") segments[segments.length - 1] += value; else segments.push(value); };
	for (const match of text.matchAll(candidates)) {
		const word = match[0], { start, end } = trim(word);
		const value = word.slice(start, end);
		let chip: Chip | undefined;
		if (/^https?:\/\/[^/\s]/i.test(value)) { try { new URL(value); chip = { kind: "link", href: value }; } catch { /* Not a link. */ } }
		else if (value.startsWith("@")) chip = mentionPath(value.slice(1));
		else chip = filePath(value);
		if (!chip) continue;
		push(text.slice(last, match.index + start));
		segments.push(chip);
		last = match.index + end;
	}
	push(text.slice(last));
	return segments;
}

/** A user message: chat tokens and chips, leaving code in backticks untouched. */
export function messageChips(text: string): ChipSegment[] {
	const segments: ChipSegment[] = [];
	const push = (value: ChipSegment) => { if (typeof value === "string" && typeof segments.at(-1) === "string") segments[segments.length - 1] += value; else if (value) segments.push(value); };
	let last = 0;
	const plain = (value: string) => {
		for (const segment of parseMentions(value)) {
			if (typeof segment !== "string") push(segment.kind === "chat" ? { kind: "chat", id: segment.ref, label: segment.label } : segment.kind === "file" || segment.kind === "folder" ? { kind: segment.kind, path: segment.ref } : segment.label);
			else textChips(segment).forEach(push);
		}
	};
	for (const match of text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)) { plain(text.slice(last, match.index)); push(match[0]); last = match.index + match[0].length; }
	plain(text.slice(last));
	return segments;
}

export function chipLabel(chip: FileChip) {
	const name = chip.path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || chip.path;
	return `${name}${chip.line ? `:${chip.line}` : ""}`;
}
