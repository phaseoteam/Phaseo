import { unified } from "unified";
import remarkParse from "remark-parse";
import { parseFileReference } from "../../shared/editors";

const markdown = unified().use(remarkParse).freeze();
type MarkdownNode = { type: string; children?: MarkdownNode[]; position?: { start: { offset?: number }; end: { offset?: number } } };
const literalNodes = new Set(["code", "inlineCode", "html", "link", "image", "linkReference", "imageReference", "definition"]);
function escaped(text: string, index: number) {
	let count = 0;
	while (index > 0 && text[--index] === "\\") count++;
	return count % 2 === 1;
}

/** Render-only correction of a complete local destination missing its final `>`. */
export function repairFileLinks(text: string): string {
	if (!text.includes("](")) return text;
	const matches = [...text.matchAll(/\[([^[\]\r\n]*)\]\([ \t]*<([^<>()\r\n]+)\)/g)].filter(match => {
		const start = match.index, end = start + match[0].length;
		const reference = parseFileReference(match[2]);
		return reference && /[\\/.]/.test(reference.filename) && !Array.from(match[2]).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
			&& !escaped(text, start) && !(text[start - 1] === "!" && !escaped(text, start - 1))
			&& !escaped(text, end - 1) && (end === text.length || /[\s.,;:!?}\]*_~]/.test(text[end]));
	});
	if (!matches.length) return text;
	const protectedRanges: { start: number; end: number }[] = [];
	function protect(node: MarkdownNode) {
		const start = node.position?.start.offset, end = node.position?.end.offset;
		if (start !== undefined && end !== undefined) protectedRanges.push({ start, end });
	}
	function visit(node: MarkdownNode, paragraph?: MarkdownNode) {
		const container = node.type === "paragraph" ? node : paragraph;
		if (literalNodes.has(node.type)) { protect(node.type === "html" ? container ?? node : node); return; }
		// Product directives are data, including partially streamed attributes.
		if (node.type === "paragraph" && /::[\w-]+[^\n]*\{/.test(text.slice(node.position?.start.offset, node.position?.end.offset))) { protect(node); return; }
		node.children?.forEach(child => visit(child, container));
	}
	visit(markdown.parse(text));
	let repaired = text;
	for (const match of matches.reverse()) {
		const start = match.index, end = start + match[0].length;
		if (!protectedRanges.some(range => start < range.end && end > range.start)) repaired = repaired.slice(0, end - 1) + ">" + repaired.slice(end - 1);
	}
	return repaired;
}
