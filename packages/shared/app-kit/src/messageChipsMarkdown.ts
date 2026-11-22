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

/** Plain links found in prose before chips are, such as `#123` in a pull request comment. */
export type ProseLinks = (text: string) => Array<string | { label: string; url: string }>;

const chipped = (value: string) => textChips(value).map(segment => typeof segment === "string" ? segment : link(segment)).join("");
const plainLink = (label: string, url: string) => `[${escapeLabel(label)}](${url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, encodeURIComponent)})`;

function line(text: string, links?: ProseLinks) {
	let out = "", last = 0;
	const prose = (value: string) => links ? links(value).map(piece => typeof piece === "string" ? chipped(piece) : plainLink(piece.label, piece.url)).join("") : chipped(value);
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

/** The line after its blockquote markers and list bullets, so fences nested in either are found, and how many quote levels it had. */
function withoutContainers(text: string) {
	let rest = text, quotes = 0;
	for (;;) {
		const marker = /^[ \t]{0,3}(?:>[ \t]?|(?:[-*+]|\d{1,9}[.)])[ \t]+)/.exec(rest);
		if (!marker) return { inner: rest, quotes };
		if (marker[0].includes(">")) quotes++;
		rest = rest.slice(marker[0].length);
	}
}

/** Inside a fence, the line after exactly the opener's quote levels; a `>` beyond those is the code's own text. */
function insideFence(text: string, quotes: number) {
	let rest = text;
	for (let level = 0; level < quotes; level++) {
		const marker = /^[ \t]{0,3}>[ \t]?/.exec(rest);
		if (!marker) return undefined;
		rest = rest.slice(marker[0].length);
	}
	return rest;
}

const indented = (text: string) => /^(?: {4}|\t)/.test(text);
const blank = (text: string) => !text.trim();

/**
 * Markdown with chips written as `phaseo-chip:` links, for a renderer that styles links by URL. Fenced and indented
 * code (also inside lists and quotes), display math, reference definitions, existing links, images, HTML and inline
 * math stay as they are. `links` turns parts of the remaining prose into plain links first.
 */
export function chipMarkdown(markdown: string, links?: ProseLinks): string {
	const lines = markdown.split("\n");
	let fence: { marker: string; quotes: number } | undefined, math = false, code = false;
	return lines.map((text, index) => {
		if (fence) {
			const rest = insideFence(text, fence.quotes);
			const closer = rest === undefined ? undefined : /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(rest)?.[1];
			if (closer && closer[0] === fence.marker[0] && closer.length >= fence.marker.length) fence = undefined;
			return text;
		}
		const { inner, quotes } = withoutContainers(text);
		const opener = /^ {0,3}(`{3,}|~{3,})/.exec(inner)?.[1];
		if (opener) { fence = { marker: opener, quotes }; return text; }
		// Display math: `normalizeChatMarkdown` puts each `$$` on its own line.
		if (inner.trim() === "$$") { math = !math; return text; }
		if (math) return text;
		// Indented code runs from an indented line after a blank one until a line that is neither indented nor blank.
		if (code && (indented(text) || blank(text))) return text;
		code = false;
		if (indented(text) && (index === 0 || blank(lines[index - 1] ?? ""))) { code = true; return text; }
		// Reference definitions (`[docs]: https://…`) keep their destination.
		if (/^ {0,3}\[[^\]\n]{1,999}\]:/.test(text)) return text;
		return line(text, links);
	}).join("\n");
}
