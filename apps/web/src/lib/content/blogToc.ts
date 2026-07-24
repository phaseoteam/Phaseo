export type BlogTocItem = {
	id: string;
	label: string;
	level: 2 | 3;
};

type BlogMdastNode = {
	children?: BlogMdastNode[];
	data?: {
		hProperties?: Record<string, unknown>;
	};
	depth?: number;
	type?: string;
	value?: string;
};

function getHeadingText(node: BlogMdastNode): string {
	if (node.type === "text" || node.type === "inlineCode") {
		return node.value ?? "";
	}

	return node.children?.map(getHeadingText).join("") ?? "";
}

function slugifyHeading(label: string, counts: Map<string, number>): string {
	const base =
		label
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "section";
	const count = (counts.get(base) ?? 0) + 1;
	counts.set(base, count);

	return count === 1 ? base : `${base}-${count}`;
}

export function createBlogHeadingsPlugin(tocItems: BlogTocItem[]) {
	return function blogHeadingsRemarkPlugin() {
		return (tree: BlogMdastNode) => {
			const counts = new Map<string, number>();

			const visit = (node: BlogMdastNode) => {
				if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
					const label = getHeadingText(node).replace(/\s+/g, " ").trim();

					if (label) {
						const id = slugifyHeading(label, counts);
						node.data = {
							...node.data,
							hProperties: {
								...node.data?.hProperties,
								id,
							},
						};
						tocItems.push({ id, label, level: node.depth });
					}
				}

				node.children?.forEach(visit);
			};

			visit(tree);
		};
	};
}
