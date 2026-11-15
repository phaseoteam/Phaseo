import { chipCopyText, codeChip, isChip, textChips, type Chip } from "./messageChips";

/** The few mdast fields this plugin reads, so it needs no Markdown types. */
type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[]; data?: unknown };
const literal = new Set(["link", "linkReference", "code", "inlineCode", "html", "definition", "image", "imageReference", "inlineMath", "math"]);
const text = (node: MarkdownNode): string => node.value ?? node.children?.map(text).join("") ?? "";

/** Rendered as `<span data-chip="…">`; each app's Markdown components swap the span for its chip. */
export function chipNode(chip: Chip, source: string): MarkdownNode {
	return { type: "messageChip", data: { hName: "span", hProperties: { dataChip: JSON.stringify(chip) }, hChildren: [{ type: "text", value: source }] } };
}

/** Reads a chip back from the span's `data-chip`. Raw HTML in a reply can write the same attribute, so every field is checked. */
export function parseChipAttribute(value: unknown): Chip | undefined {
	if (typeof value !== "string" || value.length > 16_384) return;
	try { const chip: unknown = JSON.parse(value); return isChip(chip) ? chip : undefined; } catch { return; }
}

function transform(node: MarkdownNode) {
	if (!node.children) return;
	const children: MarkdownNode[] = [];
	for (const child of node.children) {
		const previous = children.at(-1);
		// `@[title](chat:id)` parses as `@` followed by a link.
		if (child.type === "link" && child.url?.startsWith("chat:") && previous?.type === "text" && previous.value?.endsWith("@")) {
			let id: string | undefined;
			try { id = decodeURIComponent(child.url.slice(5)); } catch { /* Leave malformed tokens as links. */ }
			if (id) {
				previous.value = previous.value.slice(0, -1);
				if (!previous.value) children.pop();
				children.push(chipNode({ kind: "chat", id, label: text(child) }, text(child)));
				continue;
			}
		}
		if (child.type === "text" && child.value) {
			for (const segment of textChips(child.value)) children.push(typeof segment === "string" ? { type: "text", value: segment } : chipNode(segment, chipCopyText(segment)));
			continue;
		}
		// Inline code that is just a path, branch, commit or local server reads as that thing.
		const chip = child.type === "inlineCode" && child.value ? codeChip(child.value) : undefined;
		if (chip) { children.push(chipNode(chip, child.value ?? "")); continue; }
		if (!literal.has(child.type)) transform(child);
		children.push(child);
	}
	node.children = children;
}

/** A remark plugin: chips in prose and in inline code; code blocks, links and math stay as they are. */
export function remarkMessageChips() { return (tree: MarkdownNode) => { transform(tree); }; }
