// Converts a rendered page to Markdown for AI agents. Only the page's <main>
// content is kept (the whole <body> when a page has no <main>); navigation,
// scripts, forms, icons and hidden elements are dropped. The page title,
// description and canonical URL go into YAML front matter.
import { Parser } from "htmlparser2";

type ElementNode = { kind: "element"; name: string; attribs: Record<string, string>; children: Node[]; parent: ElementNode | null };
type TextNode = { kind: "text"; text: string; parent: ElementNode };
type CommentNode = { kind: "comment"; text: string; parent: ElementNode };
type Node = ElementNode | TextNode | CommentNode;

export type PageMarkdown = { markdown: string; title: string | null };

// Elements whose whole subtree is left out.
const SKIPPED = new Set([
	"script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "video", "audio", "picture", "source",
	"nav", "footer", "aside", "form", "input", "select", "textarea", "option", "dialog", "menu", "head", "link", "meta",
]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK = new Set([
	"address", "article", "blockquote", "body", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
	"header", "hgroup", "hr", "li", "main", "ol", "p", "pre", "section", "summary", "table", "ul",
]);
// Inline wrappers that never split a word, so no space is added around them.
const TIGHT_INLINE = new Set(["abbr", "b", "code", "em", "i", "kbd", "mark", "s", "small", "strong", "sub", "sup", "u", "time", "data"]);

// Tailwind display utilities, read for a desktop-width viewport in light mode,
// so responsive and dark-mode duplicates (logos, mobile headers) appear once.
const BREAKPOINTS = ["", "sm:", "md:", "lg:"];
const SHOWN = /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-row|table-cell|contents|flow-root|list-item)$/;

function hiddenByClass(className: string | undefined): boolean {
	if (!className) return false;
	let hidden = false;
	const tokens = className.split(/\s+/);
	for (const prefix of BREAKPOINTS) {
		for (const token of tokens) {
			if (!token.startsWith(prefix)) continue;
			const utility = token.slice(prefix.length);
			if (utility.includes(":")) continue;
			if (utility === "hidden") hidden = true;
			else if (SHOWN.test(utility)) hidden = false;
		}
	}
	return hidden;
}

function isHidden(element: ElementNode): boolean {
	const { attribs } = element;
	if ("hidden" in attribs || attribs["aria-hidden"] === "true" || attribs.role === "navigation" || attribs.role === "dialog") return true;
	if ("data-markdown-skip" in attribs || attribs["data-slot"] === "skeleton") return true;
	if (/(?:^|;)\s*display\s*:\s*none/i.test(attribs.style ?? "")) return true;
	return hiddenByClass(attribs.class);
}

function parse(html: string): { root: ElementNode; title: string | null; description: string | null; canonical: string | null } {
	const root: ElementNode = { kind: "element", name: "#root", attribs: {}, children: [], parent: null };	let current = root;
	let title: string | null = null;
	let inTitle = false;
	// Only the first <title> counts; SVGs carry their own <title> elements.
	let titleDone = false;
	let description: string | null = null;
	let canonical: string | null = null;
	const parser = new Parser(
		{
			onopentag(name, attribs) {
				if (name === "title" && !titleDone) inTitle = true;
				if (name === "meta" && (attribs.name === "description" || (attribs.property === "og:description" && description === null))) description = attribs.content ?? description;
				if (name === "link" && attribs.rel === "canonical" && attribs.href) canonical = attribs.href;
				const element: ElementNode = { kind: "element", name, attribs, children: [], parent: current };
				current.children.push(element);
				if (!VOID.has(name)) current = element;
			},
			ontext(text) {
				if (inTitle) {
					title = (title ?? "") + text;
					return;
				}
				current.children.push({ kind: "text", text, parent: current });
			},
			oncomment(text) {
				current.children.push({ kind: "comment", text, parent: current });
			},
			onclosetag(name, isImplied) {
				if (name === "title" && inTitle) {
					inTitle = false;
					titleDone = true;
				}
				if (VOID.has(name)) return;
				// Walk up to the matching element; stray closing tags are ignored.
				let node: ElementNode | null = current;
				while (node && node.name !== name) node = node.parent;
				if (node?.parent) current = node.parent;
				else if (!isImplied && node === root) current = root;
			},
		},
		{ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
	);
	parser.write(html);
	parser.end();
	applyStreamedContent(root, html);
	return { root, title: title ? collapse(title).trim() : null, description: description ? collapse(description).trim() : null, canonical };
}

/**
 * Applies React's streamed Suspense content the way its inline scripts do in a
 * browser. A suspended boundary is first sent as `<!--$?--><template
 * id="B:n">` plus fallback (skeletons) up to `<!--/$-->`; its content follows
 * later in `<div hidden id="S:n">`, and `$RC("B:n","S:n")` swaps it in.
 * `$RS("S:n","P:n")` replaces a `<template id="P:n">` placeholder.
 */
function applyStreamedContent(root: ElementNode, html: string) {
	const byId = new Map<string, ElementNode>();
	const index = (node: ElementNode) => {
		for (const child of node.children) {
			if (child.kind !== "element") continue;
			const id = child.attribs.id;
			if (id && /^[BPS]:/.test(id)) byId.set(id, child);
			index(child);
		}
	};
	index(root);
	if (!byId.size) return;

	const moveChildren = (segment: ElementNode, into: ElementNode): Node[] => {
		const moved = segment.children;
		segment.children = [];
		for (const node of moved) node.parent = into;
		return moved;
	};

	for (const [, kind, first, second] of html.matchAll(/\$R([CS])\("([^"]+)","([^"]+)"\)/g)) {
		const [targetId, segmentId] = kind === "C" ? [first, second] : [second, first];
		const target = byId.get(targetId);
		const segment = byId.get(segmentId);
		const parent = target?.parent;
		if (!target || !segment || !parent) continue;
		const start = parent.children.indexOf(target);
		if (start < 0) continue;
		let end = start + 1;
		if (kind === "C") {
			// The fallback runs to the boundary's closing `<!--/$-->`, skipping
			// nested boundaries inside it.
			let depth = 0;
			for (; end < parent.children.length; end++) {
				const node = parent.children[end];
				if (node.kind !== "comment") continue;
				if (node.text === "/$") {
					if (depth === 0) break;
					depth -= 1;
				} else if (node.text === "$" || node.text === "$?" || node.text === "$!") {
					depth += 1;
				}
			}
		}
		parent.children.splice(start, end - start, ...moveChildren(segment, parent));
	}
}

function find(node: ElementNode, name: string): ElementNode | null {
	for (const child of node.children) {
		if (child.kind !== "element") continue;
		if (child.name === name) return child;
		const found = find(child, name);
		if (found) return found;
	}
	return null;
}

function collapse(text: string): string {
	return text.replace(/[\s ]+/g, " ");
}

/** Escapes Markdown characters in text; inside a table, pipes as well. */
function escapeInline(text: string, inTable = false): string {
	return text.replace(inTable ? /([\\`*_[\]<>|])/g : /([\\`*_[\]<>])/g, "\\$1");
}

const URL_ESCAPES: Record<string, string> = { "(": "%28", ")": "%29", "|": "%7C", " ": "%20" };

/** Percent-encodes characters that would end a link URL or a table cell. */
function encodeUrl(url: string): string {
	return url.replace(/[()| ]/g, (char) => URL_ESCAPES[char]);
}

function hasText(markdown: string): boolean {
	return /[^\s*_\u0001\u0002]/.test(markdown);
}

function textContent(node: Node): string {
	if (node.kind === "comment") return "";
	if (node.kind === "text") return node.text;
	if (node.name === "br") return "\n";
	return node.children.map(textContent).join("");
}

type Context = { base: URL; listDepth: number; inTable: boolean };

function resolveHref(href: string, base: URL): string | null {
	const trimmed = href.trim();
	if (!trimmed || trimmed.startsWith("#") || /^(?:javascript|data|blob):/i.test(trimmed)) return null;
	try {
		return new URL(trimmed, base).toString();
	} catch {
		return null;
	}
}

// Renders children, putting a space between neighbouring inline elements that
// would otherwise run together ("Input" + "$2.50" -> "Input $2.50").
function renderChildren(element: ElementNode, ctx: Context): string {
	let out = "";
	let previous: Node | null = null;
	for (const child of element.children) {
		const rendered = renderNode(child, ctx);
		if (!rendered) continue;
		const looseBoundary =
			previous?.kind === "element" && child.kind === "element" && !TIGHT_INLINE.has(previous.name) && !TIGHT_INLINE.has(child.name);
		if (looseBoundary && out && !/\s$/.test(out) && !/^\s/.test(rendered)) out += " ";
		out += rendered;
		previous = child;
	}
	return out;
}

function block(content: string): string {
	const trimmed = content.trim();
	return trimmed ? `\n\n${trimmed}\n\n` : "";
}

function renderList(element: ElementNode, ctx: Context): string {
	const ordered = element.name === "ol";
	const start = Number(element.attribs.start ?? "1") || 1;
	const items = element.children.filter((child): child is ElementNode => child.kind === "element" && child.name === "li" && !isHidden(child));
	const lines = items.map((item, index) => {
		const marker = ordered ? `${start + index}. ` : "- ";
		// Items stay tight: paragraphs and nested lists inside an item are not
		// separated by blank lines.
		const body = tidy(renderChildren(item, { ...ctx, listDepth: ctx.listDepth + 1 })).replace(/\n\n+/g, "\n");
		if (!body) return "";
		const indent = INDENT.repeat(marker.length);
		return marker + body.split("\n").map((line, i) => (i === 0 || !line ? line : indent + line)).join("\n");
	});
	return block(lines.filter(Boolean).join("\n"));
}

function renderTable(element: ElementNode, ctx: Context): string {
	const rows: string[][] = [];
	let headerRows = 0;
	const visit = (node: ElementNode, inHead: boolean) => {
		for (const child of node.children) {
			if (child.kind !== "element" || isHidden(child)) continue;
			if (child.name === "tr") {
				const cells: string[] = [];
				for (const cell of child.children) {
					if (cell.kind !== "element" || (cell.name !== "td" && cell.name !== "th") || isHidden(cell)) continue;
					// Pipes are escaped where each piece of the cell is rendered (text, code, URLs).
					cells.push(tidy(renderChildren(cell, { ...ctx, inTable: true })).replace(/\n+/g, " "));
					// A cell spanning several columns keeps the cells after it under the right headers.
					const span = Math.min(Math.max(Number.parseInt(cell.attribs.colspan ?? "1", 10) || 1, 1), 50);
					for (let i = 1; i < span; i++) cells.push("");
				}
				if (!cells.some(Boolean)) continue;
				const isHeader = inHead || child.children.every((cell) => cell.kind !== "element" || cell.name === "th");
				if (isHeader && rows.length === headerRows) headerRows += 1;
				rows.push(cells);
			} else if (child.name === "thead" || child.name === "tbody" || child.name === "tfoot") {
				visit(child, child.name === "thead");
			}
		}
	};
	visit(element, false);
	if (!rows.length) return "";
	const width = Math.max(...rows.map((row) => row.length));
	const pad = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
	const header = headerRows > 0 ? rows[0] : Array.from({ length: width }, () => "");
	const body = headerRows > 0 ? rows.slice(1) : rows;
	return block([pad(header), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...body.map(pad)].join("\n"));
}

function renderNode(node: Node, ctx: Context): string {
	if (node.kind === "comment") return "";
	if (node.kind === "text") return escapeInline(collapse(node.text), ctx.inTable);
	if (SKIPPED.has(node.name) || isHidden(node)) return "";
	const { name } = node;

	switch (name) {
		case "br":
			return ctx.inTable ? " " : HARD_BREAK;
		case "hr":
			return "\n\n---\n\n";
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6": {
			const text = tidy(renderChildren(node, ctx)).replace(/\n+/g, " ");
			return text ? block(`${"#".repeat(Number(name[1]))} ${text}`) : "";
		}
		case "p":
			return block(renderChildren(node, ctx));
		case "ul":
		case "ol":
			return renderList(node, ctx);
		case "table":
			return renderTable(node, ctx);
		case "pre": {
			const code = textContent(node).replace(/^\n+|\s+$/g, "");
			const language = /language-([\w-]+)/.exec(find(node, "code")?.attribs.class ?? "")?.[1] ?? "";
			const fence = code.includes("```") ? "~~~~" : "```";
			return code ? block(`${fence}${language}\n${code}\n${fence}`) : "";
		}
		case "blockquote": {
			const inner = tidy(renderChildren(node, ctx));
			return inner ? block(inner.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")) : "";
		}
		case "code": {
			const text = collapse(textContent(node));
			if (!text.trim()) return "";
			// Code is literal, so backslashes stay; in a table GFM still needs `\|`
			// for a pipe, and unescapes it inside the code span.
			const code = ctx.inTable ? text.split("|").join("\\|") : text;
			const fence = code.includes("`") ? "``" : "`";
			return `${fence}${code}${fence}`;
		}
		case "strong":
		case "b": {
			const inner = renderChildren(node, ctx).trim();
			return hasText(inner) ? `**${inner}**` : "";
		}
		case "em":
		case "i": {
			const inner = renderChildren(node, ctx).trim();
			return hasText(inner) ? `_${inner}_` : "";
		}
		case "a": {
			const inner = tidy(renderChildren(node, ctx)).replace(/\n+/g, " ");
			const href = resolveHref(node.attribs.href ?? "", ctx.base);
			if (!inner) return "";
			return href ? `[${inner}](${encodeUrl(href)})` : inner;
		}
		case "img": {
			const alt = collapse(node.attribs.alt ?? "").trim();
			const src = resolveHref(node.attribs.src ?? "", ctx.base);
			// SVGs are logos and icons; images without alt text are decorative.
			if (!alt || !src || /\.svg(?:$|[?#])/i.test(src)) return "";
			return `![${escapeInline(alt, ctx.inTable)}](${encodeUrl(src)})`;
		}
		case "dt":
			return block(`**${renderChildren(node, ctx).trim()}**`);
		default:
			return BLOCK.has(name) ? block(renderChildren(node, ctx)) : renderChildren(node, ctx);
	}
}

/**
 * Trims every line and collapses runs of blank lines. List indentation and
 * hard breaks are written as sentinels (INDENT, HARD_BREAK) so that trimming
 * at outer levels keeps them; `finish` turns them into spaces.
 */
function tidy(markdown: string): string {
	const out: string[] = [];
	let fence: string | null = null;
	for (const raw of markdown.split("\n")) {
		const fenceMatch = /^[ \u0001]*(```|~~~~)/.exec(raw);
		if (fence) {
			out.push(raw);
			if (fenceMatch && fenceMatch[1] === fence) fence = null;
			continue;
		}
		if (fenceMatch) fence = fenceMatch[1];
		const line = raw.replace(/^ +/, "").replace(/ +$/, "").replace(/ {2,}/g, " ");
		if (!line.replace(/\u0001/g, "")) {
			if (out.length && out[out.length - 1] !== "") out.push("");
			continue;
		}
		out.push(line);
	}
	while (out.length && out[out.length - 1] === "") out.pop();
	while (out.length && out[0] === "") out.shift();
	return out.join("\n");
}

const INDENT = "\u0001";
const HARD_BREAK = "\u0002";

function finish(markdown: string): string {
	return markdown.replace(/\u0001/g, " ").replace(/ *\u0002 */g, "  \n").replace(/\n{3,}/g, "\n\n");
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

/** Converts a full HTML document to Markdown with YAML front matter. */
export function htmlToMarkdown(html: string, pageUrl: string): PageMarkdown {
	const { root, title, description, canonical } = parse(html);
	const base = new URL(pageUrl);
	const content = find(root, "main") ?? find(root, "body") ?? root;
	const body = finish(tidy(renderChildren(content, { base, listDepth: 0, inTable: false })));
	const url = canonical ? (resolveHref(canonical, base) ?? pageUrl) : pageUrl;
	const front = ["---", ...(title ? [`title: ${yamlString(title)}`] : []), ...(description ? [`description: ${yamlString(description)}`] : []), `url: ${url}`, "---"];
	return { markdown: `${front.join("\n")}\n\n${body}\n`, title };
}
