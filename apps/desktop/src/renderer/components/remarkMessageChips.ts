import { filePath, textChips, type Chip } from "../lib/messageChips";

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[]; data?: unknown };
const literal = new Set(["link", "linkReference", "code", "inlineCode", "html", "definition", "image", "imageReference"]);
const text = (node: MarkdownNode): string => node.value ?? node.children?.map(text).join("") ?? "";

/** Rendered as `<span data-chip>`; MessageContent swaps it for the chip. */
export function chipNode(chip: Chip, source: string): MarkdownNode {
	return { type: "messageChip", data: { hName: "span", hProperties: { dataChip: JSON.stringify(chip) }, hChildren: [{ type: "text", value: source }] } };
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
		if (child.type === "text" && child.value) { for (const segment of textChips(child.value)) children.push(typeof segment === "string" ? { type: "text", value: segment } : chipNode(segment, segment.kind === "link" ? segment.href : segment.kind === "chat" ? segment.label : segment.path)); continue; }
		// Inline code that is just a path reads as a file.
		const file = child.type === "inlineCode" && child.value ? filePath(child.value) : undefined;
		if (file) { children.push(chipNode(file, child.value!)); continue; }
		if (!literal.has(child.type)) transform(child);
		children.push(child);
	}
	node.children = children;
}

/** Chips bare file paths, `@path` mentions, inline-code paths and chat tokens; code and links stay as they are. */
export function remarkMessageChips() { return (tree: MarkdownNode) => { transform(tree); }; }
