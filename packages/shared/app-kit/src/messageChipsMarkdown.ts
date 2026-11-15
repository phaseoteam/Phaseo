import { chipLabel, codeChip, textChips, type Chip } from "./messageChips";

/** Chips written back as Markdown links, for renderers that can only style links (React Native's native Markdown). */
export const CHIP_LINK_SCHEME = "phaseo-chip:";

/** A chip as a link URL: the scheme, its kind and the chip as encoded JSON. */
// Brackets are encoded too, so an unmatched one in a path cannot end the Markdown link early.
export function chipLinkUrl(chip: Chip) { return `${CHIP_LINK_SCHEME}${chip.kind}:${encodeURIComponent(JSON.stringify(chip)).replace(/\(/g, "%28").replace(/\)/g, "%29")}`; }

/** The chip in a link written by `chipMarkdown`, or nothing for other links. */
export function chipFromLinkUrl(url: string): Chip | undefined {
	if (!url.startsWith(CHIP_LINK_SCHEME)) return;
	const rest = url.slice(CHIP_LINK_SCHEME.length), colon = rest.indexOf(":");
	try { const chip = JSON.parse(decodeURIComponent(rest.slice(colon + 1))) as Chip; return chip && typeof chip.kind === "string" ? chip : undefined; } catch { return; }
}

const escapeLabel = (value: string) => value.replace(/[\\[\]*_`~|<>]/g, "\\$&");
const link = (chip: Chip, label = chipLabel(chip)) => `[${escapeLabel(label)}](${chipLinkUrl(chip)})`;

// Spans of a line that stay as they are, or (inline code, chat tokens) become a chip whole.
const protectedSpans = /(@\[[^\]\n]*\]\(chat:[^)\s]+\))|(`+)([^`\n]+?)\2|!?\[[^\]\n]*\]\([^)\n]*\)|!?\[[^\]\n]*\]\[[^\]\n]*\]|<https?:\/\/[^>\s]+>|<\/?[a-z][^>\n]*>|\$\$[^$\n]+\$\$|\$[^$\n]+\$/gi;

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

/**
 * Markdown with chips written as `phaseo-chip:` links, for a renderer that styles links by URL. Fenced and indented
 * code, existing links, images, HTML and math stay as they are.
 */
export function chipMarkdown(markdown: string): string {
	const lines = markdown.split("\n");
	let fence: string | undefined;
	return lines.map((text, index) => {
		const opener = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
		if (fence) { if (opener && opener[0] === fence[0] && opener.length >= fence.length && !text.trim().slice(opener.length).trim()) fence = undefined; return text; }
		if (opener) { fence = opener; return text; }
		// Indented code: four spaces after a blank line.
		if (/^(?: {4}|\t)/.test(text) && (index === 0 || !lines[index - 1]?.trim())) return text;
		return line(text);
	}).join("\n");
}
