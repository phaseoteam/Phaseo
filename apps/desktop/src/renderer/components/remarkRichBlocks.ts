/**
 * GitHub's alerts (`> [!NOTE]`) and `<details>` blocks, without rendering raw HTML: only the `<details>`, `<summary>`
 * and `</details>` tags become elements, and everything between them stays Markdown. Single-dollar maths follows
 * Pandoc's rule so prices ("$5 and $10") stay text.
 */
import { removeAll } from "../../shared/removeAll";
type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; data?: Record<string, unknown>; position?: { start: { offset?: number }; end: { offset?: number } } };

export const alertKinds = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertKind = typeof alertKinds[number];
const alertMarker = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

function alert(node: MarkdownNode) {
	const paragraph = node.children?.[0], first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
	const match = first?.type === "text" ? alertMarker.exec(first.value ?? "") : null;
	if (!paragraph || !first || !match) return;
	first.value = first.value!.slice(match[0].length);
	if (!first.value) paragraph.children!.shift();
	// A marker alone on its line leaves the paragraph empty.
	if (!paragraph.children!.length || (paragraph.children!.length === 1 && paragraph.children![0].type === "break")) node.children!.shift();
	node.data = { ...node.data, hProperties: { ...(node.data?.hProperties as object), dataAlert: match[1].toLowerCase() } };
}

const detailsOpen = /^<details(\s+open(?:=(?:""|''|"open"|'open'|open))?)?\s*>/i;
const summaryTag = /^\s*<summary>([\s\S]*?)<\/summary>\s*/i;
const detailsClose = /^\s*<\/details>\s*$/i;

/** `<details>` with its `<summary>` in the same HTML block, as GitHub writes them; the closing tag ends it. */
function details(children: MarkdownNode[]) {
	const result: MarkdownNode[] = [];
	for (let index = 0; index < children.length; index++) {
		const node = children[index];
		const open = node.type === "html" ? detailsOpen.exec(node.value ?? "") : null;
		if (!open) { result.push(node); continue; }
		let rest = node.value!.slice(open[0].length);
		const summary = summaryTag.exec(rest);
		if (summary) rest = rest.slice(summary[0].length);
		// The closing tag can share the opening block (`<details><summary>a</summary>text</details>`) or follow later.
		const inlineEnd = rest.search(/<\/details>\s*$/i);
		let body: MarkdownNode[] = [], end = index;
		if (inlineEnd >= 0) body = rest.slice(0, inlineEnd).trim() ? [{ type: "paragraph", children: [{ type: "text", value: rest.slice(0, inlineEnd).trim() }] }] : [];
		else {
			let depth = 1;
			for (end = index + 1; end < children.length; end++) {
				const value = children[end].type === "html" ? children[end].value ?? "" : "";
				if (detailsOpen.test(value) && !/<\/details>\s*$/i.test(value)) depth++;
				if (detailsClose.test(value) && !--depth) break;
			}
			if (end >= children.length) { result.push(node); continue; } // Unclosed (still streaming): leave it as it was.
			if (rest.trim()) body.push({ type: "paragraph", children: [{ type: "text", value: rest.trim() }] });
			body.push(...children.slice(index + 1, end));
		}
		result.push({
			type: "details", data: { hName: "details", hProperties: open[1] ? { open: true } : {} },
			children: [{ type: "detailsSummary", data: { hName: "summary" }, children: [{ type: "text", value: (summary ? removeAll(summary[1], /<[^>]*>/g) : "").trim() || "Details" }] }, ...details(body)],
		});
		index = end;
	}
	return result;
}

function walk(node: MarkdownNode) {
	if (!node.children) return;
	node.children = details(node.children);
	for (const child of node.children) { if (child.type === "blockquote") alert(child); walk(child); }
}

export function remarkRichBlocks() { return (tree: unknown) => walk(tree as MarkdownNode); }

/**
 * Pandoc's rule for `$…$`: no space just inside either dollar and no digit just after the closing one. Anything else
 * goes back to the text it was written as. Runs after remark-math.
 */
export function remarkMathGuard() {
	return (tree: unknown, file: { value?: unknown }) => {
		const source = String(file.value ?? "");
		const visit = (node: MarkdownNode) => {
			if (!node.children) return;
			node.children = node.children.map(child => {
				if (child.type !== "inlineMath") { visit(child); return child; }
				const start = child.position?.start.offset, end = child.position?.end.offset;
				if (start === undefined || end === undefined) return child;
				const raw = source.slice(start, end);
				if (raw.startsWith("$$")) return child;
				const value = child.value ?? "";
				return /^\s|\s$/.test(value) || /^\d/.test(source.charAt(end)) ? { type: "text", value: raw } : child;
			});
			// Neighbouring text nodes join again, so later plugins see one run of text.
			node.children = node.children.reduce<MarkdownNode[]>((joined, child) => { const last = joined.at(-1); if (last?.type === "text" && child.type === "text") last.value = `${last.value ?? ""}${child.value ?? ""}`; else joined.push(child); return joined; }, []);
		};
		visit(tree as MarkdownNode);
	};
}
