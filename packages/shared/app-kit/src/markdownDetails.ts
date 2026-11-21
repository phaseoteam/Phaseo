/**
 * Splits Markdown at `<details>` blocks, for renderers that never render raw HTML (such as @pierre/words). Each
 * block becomes a part holding its `<summary>` text and its body, split the same way, so a renderer can draw a
 * real `<details>` element around separately rendered Markdown. Only the shape GitHub and chat models write is
 * recognised: `<details>` (or `<details open>`) starting a line outside code, an optional `<summary>…</summary>`,
 * and `</details>` starting a later line. A block still streaming (no `</details>` yet) runs to the end.
 */
export type MarkdownPart =
	| { kind: "markdown"; text: string }
	| { kind: "details"; summary: string; open: boolean; complete: boolean; parts: MarkdownPart[] };

const OPEN = /^ {0,3}<details(\s[^>]*)?>[ \t]*(.*)$/i;
const CLOSE = /^ {0,3}<\/details\s*>(.*)$/i;
const FENCE = /^ {0,3}(?:>[ \t]?)*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})/;
/** A tag still arriving at the end of a stream (`<det`, `</deta`), hidden until it is whole. */
const PARTIAL_TAG = /^ {0,3}<\/?(?:d(?:e(?:t(?:a(?:i(?:l(?:s(?:\s[^>]*)?)?)?)?)?)?)?)?$/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function plainText(html: string) {
	return html.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
		if (name[0] === "#") {
			const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
			return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
		}
		return ENTITIES[name.toLowerCase()] ?? entity;
	}).replace(/\s+/g, " ").trim();
}

/** True when `markdown` may hold a `<details>` block; the common case skips the split entirely. */
export function hasDetails(markdown: string) {
	return /<details[\s>]/i.test(markdown);
}

const partialTag = (line: string) => PARTIAL_TAG.test(line) && /<(?:\/|d)/i.test(line);

export function splitDetails(markdown: string): MarkdownPart[] {
	if (!hasDetails(markdown)) {
		const last = markdown.lastIndexOf("\n");
		if (partialTag(markdown.slice(last + 1))) markdown = markdown.slice(0, Math.max(last, 0));
		return markdown ? [{ kind: "markdown", text: markdown }] : [];
	}
	const lines = markdown.split("\n");
	if (partialTag(lines.at(-1) ?? "")) lines.pop();
	type Open = { parts: MarkdownPart[]; text: string[]; block?: Extract<MarkdownPart, { kind: "details" }>; summary?: string[] };
	const root: Open = { parts: [], text: [] };
	const stack: Open[] = [root];
	let fence: string | undefined;
	const flush = (level: Open) => {
		const text = level.text.join("\n");
		if (text.trim()) level.parts.push({ kind: "markdown", text });
		level.text = [];
	};
	const finishSummary = (level: Open, rest: string) => {
		if (!level.block || !level.summary) return rest;
		const joined = level.summary.join("\n") + (rest ? `\n${rest}` : "");
		const close = /<\/summary\s*>/i.exec(joined);
		if (!close) { level.summary.push(rest); return undefined; }
		level.block.summary = plainText(joined.slice(0, close.index));
		level.summary = undefined;
		return joined.slice(close.index + close[0].length);
	};
	for (const line of lines) {
		const top = stack.at(-1)!;
		if (top.summary) {
			const rest = finishSummary(top, line);
			if (rest !== undefined && rest.trim()) top.text.push(rest);
			continue;
		}
		const marker = FENCE.exec(line)?.[1];
		if (fence) {
			if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
			top.text.push(line);
			continue;
		}
		if (marker) { fence = marker; top.text.push(line); continue; }
		const open = OPEN.exec(line);
		if (open) {
			flush(top);
			const block: Extract<MarkdownPart, { kind: "details" }> = { kind: "details", summary: "", open: /\bopen\b/i.test(open[1] ?? ""), complete: false, parts: [] };
			top.parts.push(block);
			const level: Open = { parts: block.parts, text: [], block };
			stack.push(level);
			let rest = open[2] ?? "";
			const summary = /^\s*<summary(\s[^>]*)?>/i.exec(rest);
			if (summary) {
				level.summary = [];
				rest = finishSummary(level, rest.slice(summary[0].length)) ?? "";
			}
			if (rest.trim()) level.text.push(rest);
			continue;
		}
		const close = stack.length > 1 ? CLOSE.exec(line) : null;
		if (close) {
			flush(top);
			top.block!.complete = true;
			stack.pop();
			if (close[1]?.trim()) stack.at(-1)!.text.push(close[1]);
			continue;
		}
		// A `<summary>` on the line after `<details>`, before any body.
		if (top.block && !top.parts.length && !top.text.some(text => text.trim()) && !top.block.summary) {
			const summary = /^ {0,3}<summary(\s[^>]*)?>/i.exec(line);
			if (summary) {
				top.summary = [];
				const rest = finishSummary(top, line.slice(summary[0].length));
				if (rest?.trim()) top.text.push(rest);
				continue;
			}
		}
		top.text.push(line);
	}
	for (let index = stack.length - 1; index >= 0; index--) {
		const level = stack[index]!;
		// A summary still streaming shows what has arrived.
		if (level.summary && level.block) level.block.summary = plainText(level.summary.join("\n"));
		flush(level);
	}
	return root.parts;
}
