import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Live Markdown in the composer: bold, italic, strikethrough, code, links, headings,
 * quotes, lists and code fences are styled as they are typed, with their markers kept and faded. It is decoration only, so
 * the draft and the sent message stay exactly the text that was typed. A `/command` or `/skill:name` the composer knows
 * at the start of the message shows as a chip the same way.
 */
export type MarkdownRange = { line: number; from: number; to: number; className: string };
export type KnownCommand = { name: string; kind: "skill" | "command" };

/** Chips are one character in a line (U+FFFC), so they can sit inside formatting without breaking it. */
const inlineRules: { pattern: RegExp; marker: number; className: string }[] = [
	{ pattern: /(?<![\w*])\*\*(?=\S)(.*?\S)\*\*(?![\w*])/g, marker: 2, className: "composer-md-bold" },
	{ pattern: /(?<![\w_])__(?=\S)(.*?\S)__(?![\w_])/g, marker: 2, className: "composer-md-bold" },
	{ pattern: /(?<!~)~~(?=\S)(.*?\S)~~(?!~)/g, marker: 2, className: "composer-md-strike" },
	{ pattern: /(?<![\w*])\*(?![\s*])(.*?[^\s*])\*(?![\w*])/g, marker: 1, className: "composer-md-italic" },
	{ pattern: /(?<![\w_])_(?![\s_])(.*?[^\s_])_(?![\w_])/g, marker: 1, className: "composer-md-italic" },
];

/** A backslash before punctuation keeps that character literal, as in Markdown: \\* is a star, \\@ an at sign. */
const escaped = /\\[!-/:-@[-`{-~]/g;

/** Inline formatting in one line's text from start: code spans and links first, as nothing inside them is formatting. */
function inlineRanges(raw: string, start: number, line: number, out: MarkdownRange[]) {
	const taken: [number, number][] = [];
	// Escaped characters are hidden from the rules (same length, so offsets hold); their backslashes are faded.
	const escapes = [...raw.matchAll(escaped)].map(match => match.index);
	const text = escapes.length ? raw.replace(escaped, "\u0001\u0001") : raw;
	const free = (from: number, to: number) => taken.every(([a, b]) => to <= a || from >= b);
	const add = (from: number, to: number, className: string) => { if (to > from) out.push({ line, from: start + from, to: start + to, className }); };
	for (const match of text.matchAll(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g)) {
		const at = match.index, fence = match[1]!.length, end = at + match[0].length;
		add(at, at + fence, "composer-md-marker"); add(at + fence, end - fence, "composer-md-code"); add(end - fence, end, "composer-md-marker");
		taken.push([at, end]);
	}
	for (const match of text.matchAll(/\[([^\]\n]+)\]\((\S+?)\)/g)) {
		const at = match.index, end = at + match[0].length;
		if (!free(at, end)) continue;
		add(at, at + 1, "composer-md-marker"); add(at + 1, at + 1 + match[1]!.length, "composer-md-link"); add(at + 1 + match[1]!.length, end, "composer-md-marker");
		taken.push([at, end]);
	}
	for (const at of escapes) if (free(at, at + 1)) out.push({ line, from: start + at, to: start + at + 1, className: "composer-md-escape" });
	const markers: [number, number][] = [];
	for (const rule of inlineRules) {
		for (const match of text.matchAll(rule.pattern)) {
			const at = match.index, end = at + match[0].length, inner: [number, number] = [at + rule.marker, end - rule.marker];
			// Its markers must be free text: not inside code or a link, and not another rule's markers.
			if (!free(at, inner[0]) || !free(inner[1], end) || markers.some(([a, b]) => (at < b && inner[0] > a) || (inner[1] < b && end > a))) continue;
			add(at, inner[0], "composer-md-marker"); add(inner[0], inner[1], rule.className); add(inner[1], end, "composer-md-marker");
			markers.push([at, inner[0]], [inner[1], end]);
		}
	}
}

/** Styles for each line of a draft. known: the commands and skills a leading `/name` may be. */
export function markdownRanges(lines: string[], known: readonly KnownCommand[] = []): MarkdownRange[] {
	const out: MarkdownRange[] = [];
	let fence: { char: string; length: number } | undefined;
	lines.forEach((text, line) => {
		const add = (from: number, to: number, className: string) => { if (to > from) out.push({ line, from, to, className }); };
		const opening = /^ {0,3}(`{3,}|~{3,})/.exec(text);
		if (fence) {
			if (opening && opening[1]![0] === fence.char && opening[1]!.length >= fence.length && !text.slice(opening[0].length).trim()) { add(0, text.length, "composer-md-fence"); fence = undefined; }
			else add(0, text.length, "composer-md-code-block");
			return;
		}
		if (opening && !(opening[1]![0] === "`" && text.slice(opening[0].length).includes("`"))) { fence = { char: opening[1]![0]!, length: opening[1]!.length }; add(0, text.length, "composer-md-fence"); return; }
		if (/^ {0,3}([-*_])( *\1){2,} *$/.test(text)) { add(0, text.length, "composer-md-rule"); return; }
		// A command at the very start of the message, while the composer knows it.
		if (line === 0) {
			const command = /^\/([\w:.-]+)(?=\s|$)/.exec(text), entry = command && known.find(value => value.name === command[1]);
			if (entry) { add(0, command![0].length, entry.kind === "skill" ? "composer-md-skill" : "composer-md-command"); inlineRanges(text.slice(command![0].length), command![0].length, line, out); return; }
		}
		const heading = /^( {0,3})(#{1,6})( +)/.exec(text);
		if (heading) {
			add(0, heading[0].length, "composer-md-marker");
			add(heading[0].length, text.length, `composer-md-h${Math.min(heading[2]!.length, 3)}`);
			inlineRanges(text.slice(heading[0].length), heading[0].length, line, out);
			return;
		}
		let start = 0;
		const quote = /^ {0,3}> ?/.exec(text);
		if (quote) { add(0, quote[0].length, "composer-md-marker"); add(quote[0].length, text.length, "composer-md-quote"); start = quote[0].length; }
		const list = /^(\s*)([-*+]|\d{1,9}[.)])( +)(\[[ xX]\] )?/.exec(text.slice(start));
		if (list) {
			const bullet = start + list[1]!.length;
			add(bullet, bullet + list[2]!.length, "composer-md-list");
			if (list[4]) add(start + list[0].length - list[4].length, start + list[0].length - 1, /x/i.test(list[4]) ? "composer-md-task-done" : "composer-md-task");
			start += list[0].length;
		}
		inlineRanges(text.slice(start), start, line, out);
	});
	return out;
}

/** The draft's lines with the document position of each character; a hard break or a new paragraph starts a line. */
function documentLines(state: EditorState) {
	const lines: { text: string; positions: number[] }[] = [];
	state.doc.forEach((paragraph, offset) => {
		let current = { text: "", positions: [] as number[] };
		paragraph.forEach((node, childOffset) => {
			const at = offset + 1 + childOffset;
			if (node.isText) { const text = node.text ?? ""; current.text += text; for (let index = 0; index < text.length; index++) current.positions.push(at + index); }
			else if (node.type.name === "hardBreak") { lines.push(current); current = { text: "", positions: [] }; }
			else { current.text += "￼"; current.positions.push(at); }
		});
		lines.push(current);
	});
	return lines;
}

export const composerMarkdownKey = new PluginKey<DecorationSet>("composerMarkdown");
/** Asks the composer to style its draft again, as when the commands it knows change. */
export const refreshComposerMarkdown = "composerMarkdownRefresh";

function decorations(state: EditorState, known: readonly KnownCommand[], enabled: boolean) {
	if (!enabled) return DecorationSet.empty;
	const lines = documentLines(state);
	return DecorationSet.create(state.doc, markdownRanges(lines.map(line => line.text), known).map(range => {
		const positions = lines[range.line]!.positions;
		return Decoration.inline(positions[range.from]!, positions[range.to - 1]! + 1, { class: range.className });
	}));
}

/**
 * The decoration plugin; known() and enabled() are read again whenever the draft changes or a refresh is asked for.
 * enabled() is Settings → Chat → Rich text in the message box; when off, the draft is plain text.
 */
export const ComposerMarkdown = Extension.create<{ known: () => readonly KnownCommand[]; enabled: () => boolean }>({
	name: "composerMarkdown",
	addOptions: () => ({ known: () => [], enabled: () => true }),
	addProseMirrorPlugins() {
		const known = () => this.options.known(), enabled = () => this.options.enabled();
		return [new Plugin<DecorationSet>({
			key: composerMarkdownKey,
			state: {
				init: (_config, state) => decorations(state, known(), enabled()),
				apply: (tr, value, _old, state) => tr.docChanged || tr.getMeta(refreshComposerMarkdown) ? decorations(state, known(), enabled()) : value,
			},
			props: { decorations: state => composerMarkdownKey.getState(state) },
		})];
	},
});
