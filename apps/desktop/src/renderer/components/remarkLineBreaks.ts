type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };

function transform(node: MarkdownNode) {
	if (!node.children) return;
	node.children = node.children.flatMap(child => {
		if (child.type !== "text" || !child.value?.includes("\n")) { transform(child); return [child]; }
		return child.value.split("\n").flatMap((line, index): MarkdownNode[] => [...index ? [{ type: "break" }] : [], ...line ? [{ type: "text", value: line }] : []]);
	});
}

/** A single newline is a line break, as people type it in a message box; code keeps its own lines. */
export function remarkLineBreaks() { return (tree: MarkdownNode) => { transform(tree); }; }
