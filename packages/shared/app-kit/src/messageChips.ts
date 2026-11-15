import { parseMentions } from "./mentions";

/**
 * What messages show as chips, in every app: chats, files and folders, links, commits, branches and local servers.
 * Only unambiguous text counts, so versions (1.2.3), emails, fractions (a/b), issue numbers (#3733) and code stay as
 * they are.
 */
export type FileChip = { kind: "file" | "folder"; path: string; line?: number; column?: number };
export type Chip =
	| FileChip
	| { kind: "link"; href: string }
	| { kind: "chat"; id: string; label: string }
	| { kind: "commit"; sha: string }
	| { kind: "branch"; name: string }
	| { kind: "local"; href: string };
export type ChipKind = Chip["kind"];
export type ChipSegment = string | Chip;

const segmentPattern = /^[\p{L}\p{N}_.~+@%$[\]()-]+$/u;
const extension = /\.[a-z][a-z\d]{0,9}$/i;
const positionPattern = /(?::(\d+)(?::(\d+))?|#L(\d+)(?:C(\d+)|-L\d+)?)$/i;
const domainLike = /^[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/i;
const posixRoots = /^\/(?:Users|home|tmp|var|etc|opt|usr|mnt|private|Volumes|srv|workspaces?)\//;
// A candidate starts the text or follows whitespace or an opening bracket or quote.
const candidates = /(?<=^|[\s([{<"'])[^\s<>"'`]+/gu;
const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };

// Local servers only as full URLs, so they read as links everywhere else too.
const localServer = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?(?:[/?#]\S*)?$/i;
const commitSha = /^[0-9a-f]{7,40}$/;
// Branches only by the prefixes people and agents use, so `docs/guide` or `a/b` stay text.
const branchName = /^(?:feat|feature|fix|bugfix|hotfix|chore|refactor|perf|release|revert|codex|claude|cursor|copilot|agent|backup|afk)\/[A-Za-z0-9._\-/]+$/;

function trim(word: string) {
	let start = 0, end = word.length;
	while (start < end && "([{<*".includes(word.charAt(start))) start++;
	for (;;) {
		if (end <= start) break;
		const last = word.charAt(end - 1);
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

/** The value without trailing slashes, in one pass (a `[\\/]+$` regex is quadratic on many slashes). */
export function trimTrailingSlashes(value: string) {
	let end = value.length;
	while (end > 0 && (value[end - 1] === "/" || value[end - 1] === "\\")) end--;
	return value.slice(0, end);
}

function validSegments(segments: string[]) { return segments.every(segment => segment && segmentPattern.test(segment) && (segment === "." || segment === ".." || !segment.endsWith("."))); }

/** A whole string that is clearly a file or folder path, with an optional `:line[:col]` or `#L12`. */
export function filePath(value: string): FileChip | undefined {
	if (!value || value.length > 1024 || /\s/.test(value)) return;
	const { path, line, column } = withPosition(value);
	const folder = /[\\/]$/.test(path), body = trimTrailingSlashes(path);
	const chip = (): FileChip => ({ kind: folder ? "folder" : "file", path, ...(line ? { line } : {}), ...(column && line ? { column } : {}) });
	// Windows drive paths are unambiguous.
	if (/^[a-z]:[\\/]/i.test(body)) return body.length > 3 && validSegments(body.slice(3).split(/[\\/]/)) ? chip() : undefined;
	// Home and explicitly relative paths.
	const relative = /^(?:~|\.{1,2})[\\/](.+)$/.exec(body);
	if (relative) return validSegments((relative[1] ?? "").split(/[\\/]/)) ? chip() : undefined;
	const segments = body.replace(/^\//, "").split(/[\\/]/);
	if (segments.length < 2 || !validSegments(segments)) return;
	const named = !folder && extension.test(segments.at(-1) ?? "");
	// Absolute paths need a file extension or a well-known root, so `/api/v1/users` stays text.
	if (body.startsWith("/")) return named || posixRoots.test(`${body}/`) ? chip() : undefined;
	// Other relative paths need a file extension and must not start with a domain (`example.com/a.html`) or read as prose (`React/Next.js`).
	const [first = "", second = ""] = segments;
	if (!named || domainLike.test(first) || (segments.length === 2 && /^[A-Z]/.test(first) && /^[A-Z]\w*\.js$/.test(second))) return;
	return chip();
}

/** `@path`, as composers send file mentions; `@dir/` is a folder. Scoped packages (`@types/node`) have neither an extension nor a trailing slash. */
function mentionPath(value: string): FileChip | undefined {
	const { path, line, column } = withPosition(value);
	if (!/[\\/]$/.test(path) && !extension.test(path)) return;
	if (!validSegments(trimTrailingSlashes(path).replace(/^(?:[a-z]:)?[\\/]/i, "").split(/[\\/]/))) return;
	return { kind: /[\\/]$/.test(path) ? "folder" : "file", path, ...(line ? { line } : {}), ...(column && line ? { column } : {}) };
}

// app-kit builds without DOM types; every app it runs in has WHATWG URL.
const URL = (globalThis as unknown as { URL: new (value: string) => { hostname: string; pathname: string } }).URL;

/** A branch or commit; a commit needs a digit and a letter, so words like `deadbeef` and numbers stay text. */
function gitChip(value: string): Chip | undefined {
	if (branchName.test(value) && !extension.test(value)) return { kind: "branch", name: value };
	if (commitSha.test(value) && /\d/.test(value) && /[a-f]/.test(value)) return { kind: "commit", sha: value };
}

/** One word of prose: a link, local server, branch, commit or path. */
function wordChip(value: string): Chip | undefined {
	if (localServer.test(value)) return { kind: "local", href: value };
	if (/^https?:\/\/[^/\s]/i.test(value)) { try { new URL(value); return { kind: "link", href: value }; } catch { return; } }
	const git = gitChip(value);
	if (git) return git;
	if (value.startsWith("@")) return mentionPath(value.slice(1));
	return filePath(value);
}

/** Text that is all inline code: a path, branch, commit or local server, or nothing. */
export function codeChip(value: string): Chip | undefined {
	const code = value.trim();
	if (!code || code.length > 1024) return;
	if (localServer.test(code)) return { kind: "local", href: code };
	return gitChip(code) ?? filePath(code);
}

const push = (segments: ChipSegment[], value: ChipSegment) => {
	if (typeof value === "string") { if (!value) return; if (typeof segments.at(-1) === "string") segments[segments.length - 1] += value; else segments.push(value); }
	else segments.push(value);
};

/** Links, `@path` mentions, paths, branches, commits and local servers in plain text. */
export function textChips(text: string): ChipSegment[] {
	const segments: ChipSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(candidates)) {
		const word = match[0], { start, end } = trim(word), index = match.index ?? 0;
		const chip = wordChip(word.slice(start, end));
		if (!chip) continue;
		push(segments, text.slice(last, index + start));
		segments.push(chip);
		last = index + end;
	}
	push(segments, text.slice(last));
	return segments;
}

/** A message as people write it: chat tokens and chips, leaving code in backticks untouched. */
export function messageChips(text: string): ChipSegment[] {
	const segments: ChipSegment[] = [];
	let last = 0;
	const plain = (value: string) => {
		for (const segment of parseMentions(value)) {
			if (typeof segment !== "string") push(segments, segment.kind === "chat" ? { kind: "chat", id: segment.ref, label: segment.label } : segment.kind === "file" || segment.kind === "folder" ? { kind: segment.kind, path: segment.ref } : segment.label);
			else for (const chip of textChips(segment)) push(segments, chip);
		}
	};
	for (const match of text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)) { plain(text.slice(last, match.index)); push(segments, match[0]); last = (match.index ?? 0) + match[0].length; }
	plain(text.slice(last));
	return segments;
}

/** A file or folder's name, with its line. */
export function fileChipLabel(chip: FileChip) {
	const name = trimTrailingSlashes(chip.path).split(/[\\/]/).at(-1) || chip.path;
	return `${name}${chip.line ? `:${chip.line}` : ""}`;
}

/** A link's short label: GitHub pull requests and issues as `PR #12` and `Issue #12`, other pages by host. */
export function linkLabel(href: string) {
	try {
		const url = new URL(href);
		const github = url.hostname === "github.com" ? /^\/[^/]+\/[^/]+\/(pull|issues)\/(\d+)(?:\/|$)/.exec(url.pathname) : null;
		if (github) return `${github[1] === "pull" ? "PR" : "Issue"} #${github[2]}`;
		return url.hostname.replace(/^www\./, "");
	} catch { return href; }
}

/** What a chip shows when nothing better (a page or chat title) is known. */
export function chipLabel(chip: Chip): string {
	switch (chip.kind) {
		case "file": case "folder": return fileChipLabel(chip);
		case "link": return linkLabel(chip.href);
		case "chat": return chip.label || "Chat";
		case "commit": return chip.sha.slice(0, 7);
		case "branch": return chip.name;
		case "local": return chip.href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
	}
}

/** Where a chip opens on the web, when it opens anywhere: `repository` is an `owner/name` on GitHub. */
export function chipHref(chip: Chip, { repository }: { repository?: string } = {}): string | undefined {
	switch (chip.kind) {
		case "link": case "local": return chip.href;
		case "commit": return repository ? `https://github.com/${repository}/commit/${chip.sha}` : undefined;
		case "branch": return repository ? `https://github.com/${repository}/tree/${chip.name.split("/").map(encodeURIComponent).join("/")}` : undefined;
		default: return undefined;
	}
}

/** What copying a chip copies: the full path, URL, SHA or name. */
export function chipCopyText(chip: Chip): string {
	switch (chip.kind) {
		case "file": case "folder": return `${chip.path}${chip.line ? `:${chip.line}${chip.column ? `:${chip.column}` : ""}` : ""}`;
		case "link": case "local": return chip.href;
		case "chat": return chip.label;
		case "commit": return chip.sha;
		case "branch": return chip.name;
	}
}

const chipText = (value: unknown, max = 2048): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const chipLine = (value: unknown) => value === undefined || (Number.isInteger(value) && (value as number) > 0);

/**
 * Whether a value read back from Markdown or a link (where anyone can write it) is a chip with every field it needs.
 * Links and local servers must be http(s), so a chip never opens another scheme.
 */
export function isChip(value: unknown): value is Chip {
	if (!value || typeof value !== "object") return false;
	const chip = value as Record<string, unknown>;
	switch (chip.kind) {
		case "file": case "folder": return chipText(chip.path) && chipLine(chip.line) && chipLine(chip.column);
		case "link": case "local": return chipText(chip.href) && /^https?:\/\//i.test(chip.href);
		case "chat": return chipText(chip.id) && typeof chip.label === "string" && chip.label.length <= 2048;
		case "commit": return chipText(chip.sha, 64) && commitSha.test(chip.sha);
		case "branch": return chipText(chip.name, 256);
		default: return false;
	}
}

/** What a screen reader hears after the label. */
export const CHIP_KIND_NAMES: Record<ChipKind, string> = {
	file: "file", folder: "folder", link: "link", chat: "chat", commit: "commit", branch: "branch", local: "local server",
};
