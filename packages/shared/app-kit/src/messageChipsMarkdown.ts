import { chipLabel, codeChip, isChip, textChips, type Chip } from "./messageChips";

/** Chips written back as Markdown links, for renderers that can only style links (React Native's native Markdown). */
export const CHIP_LINK_SCHEME = "phaseo-chip:";

/** A chip as a link URL: the scheme, its kind and the chip as encoded JSON. */
// Brackets are encoded too, so an unmatched one in a path cannot end the Markdown link early.
export function chipLinkUrl(chip: Chip) { return `${CHIP_LINK_SCHEME}${chip.kind}:${encodeURIComponent(JSON.stringify(chip)).replace(/\(/g, "%28").replace(/\)/g, "%29")}`; }

/** The chip in a link written by `chipMarkdown`, or nothing for other links and for chips missing a field (anyone can write such a link). */
export function chipFromLinkUrl(url: string): Chip | undefined {
	if (!url.startsWith(CHIP_LINK_SCHEME) || url.length > 16_384) return;
	const rest = url.slice(CHIP_LINK_SCHEME.length), colon = rest.indexOf(":");
	try { const chip: unknown = JSON.parse(decodeURIComponent(rest.slice(colon + 1))); return isChip(chip) ? chip : undefined; } catch { return; }
}

const escapeLabel = (value: string) => value.replace(/[\\[\]*_`~|<>]/g, "\\$&");
const link = (chip: Chip, label = chipLabel(chip)) => `[${escapeLabel(label)}](${chipLinkUrl(chip)})`;

// Spans of a line that stay as they are, or (inline code, chat tokens) become a chip whole. Every repeat is bounded,
// so a long run of `@[`, backticks, `![` or `</a` cannot make matching slow.
const protectedSpans = /(@\[[^\]\n]{0,500}\]\(chat:[^)\s]{1,500}\))|(`{1,8})([^`\n]{1,2000}?)\2|!?\[[^\]\n]{0,500}\]\([^)\n]{0,2000}\)|!?\[[^\]\n]{0,500}\]\[[^\]\n]{0,500}\]|<https?:\/\/[^>\s]{1,2000}>|<\/?[a-z][^>\n]{0,500}>|\$\$[^$\n]{1,2000}\$\$|\$[^$\n]{1,2000}\$/gi;

function line(text: string) {
	let out = "", last = 0;
	const prose = (value: string) => textChips(value).map(segment => typeof segment === "string" ? segment : link(segment)).join("");
	for (const match of text.matchAll(protectedSpans)) {
		const index = match.index ?? 0;
		out += prose(text.slice(last, index));
		const [whole, chat, , code] = match;
		if (chat) {
			const token = /^@\[([^\]]*)\]\(chat:([^)]+)\)$/.exec(chat);
			let id: string | undefined;
			try { id = token?.[2] ? decodeURIComponent(token[2]) : undefined; } catch { /* Leave malformed tokens. */ }
			out += id ? link({ kind: "chat", id, label: token?.[1] ?? "" }) : whole;
		} else if (code !== undefined) {
			const chip = codeChip(code);
			out += chip ? link(chip) : whole;
		} else out += whole;
		last = index + whole.length;
	}
	return out + prose(text.slice(last));
}

/** The line after its blockquote markers and list bullets, so fences nested in either are found. */
function withoutContainers(text: string) {
	let rest = text;
	for (;;) {
		const marker = /^[ \t]{0,3}(?:>[ \t]?|(?:[-*+]|\d{1,9}[.)])[ \t]+)/.exec(rest);
		if (!marker) return rest;
		rest = rest.slice(marker[0].length);
	}
}

const indented = (text: string) => /^(?: {4}|\t)/.test(text);
const blank = (text: string) => !text.trim();

/**
 * Markdown with chips written as `phaseo-chip:` links, for a renderer that styles links by URL. Fenced and indented
 * code (also inside lists and quotes), display math, reference definitions, existing links, images, HTML and inline
 * math stay as they are.
 */
export function chipMarkdown(markdown: string): string {
	const lines = markdown.split("\n");
	let fence: string | undefined, math = false, code = false;
	return lines.map((text, index) => {
		const inner = withoutContainers(text);
		const opener = /^ {0,3}(`{3,}|~{3,})/.exec(inner)?.[1];
		if (fence) { if (opener && opener[0] === fence[0] && opener.length >= fence.length && !inner.trim().slice(opener.length).trim()) fence = undefined; return text; }
		if (opener) { fence = opener; return text; }
		// Display math: `normalizeChatMarkdown` puts each `$$` on its own line.
		if (inner.trim() === "$$") { math = !math; return text; }
		if (math) return text;
		// Indented code runs from an indented line after a blank one until a line that is neither indented nor blank.
		if (code && (indented(text) || blank(text))) return text;
		code = false;
		if (indented(text) && (index === 0 || blank(lines[index - 1] ?? ""))) { code = true; return text; }
		// Reference definitions (`[docs]: https://…`) keep their destination.
		if (/^ {0,3}\[[^\]\n]{1,999}\]:/.test(text)) return text;
		return line(text);
	}).join("\n");
}
