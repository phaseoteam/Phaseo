type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[]; data?: unknown };

const CANDIDATE = /#[1-9]\d{0,9}|\b[0-9a-f]{40}\b/giu;
const WORD = /[A-Za-z0-9_]/u;
const COMMIT_PREFIX = /[\s([{]/u;
const SKIPPED = new Set(["link", "linkReference", "code", "inlineCode", "html", "definition", "image", "imageReference"]);
/** GitHub's own upload links for a video dropped into a comment: on a line of their own they play inline. */
const VIDEO = /^https:\/\/github\.com\/(?:user-attachments\/assets\/[0-9a-f-]{36}|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/assets\/\d+\/[0-9a-f-]{36})$/iu;
export const isGitHubVideoUpload = (url: string) => VIDEO.test(url);

/** `#123` and full commit SHAs in plain text become links into the repository, the way GitHub renders them. */
export function autolinkText(value: string, repositoryUrl: string): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	let last = 0;
	for (const match of value.matchAll(CANDIDATE)) {
		const matched = match[0], index = match.index ?? 0, reference = matched.startsWith("#");
		const before = value[index - 1], after = value[index + matched.length];
		if ((before !== undefined && (reference ? WORD.test(before) : !COMMIT_PREFIX.test(before))) || (after !== undefined && WORD.test(after))) continue;
		if (index > last) nodes.push({ type: "text", value: value.slice(last, index) });
		nodes.push({ type: "link", url: reference ? `${repositoryUrl}/issues/${matched.slice(1)}` : `${repositoryUrl}/commit/${matched.toLowerCase()}`, children: [{ type: "text", value: reference ? matched : matched.slice(0, 7) }] });
		last = index + matched.length;
	}
	if (!nodes.length) return [{ type: "text", value }];
	if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });
	return nodes;
}

function videoUrl(paragraph: MarkdownNode) {
	const only = paragraph.children?.filter(child => !(child.type === "text" && !child.value?.trim()));
	if (only?.length !== 1) return;
	const node = only[0], url = node.type === "link" ? node.url : node.type === "text" ? node.value?.trim() : undefined;
	return url && isGitHubVideoUpload(url) ? url : undefined;
}

function transform(node: MarkdownNode, repositoryUrl: string) {
	if (!node.children) return;
	const children: MarkdownNode[] = [];
	for (const child of node.children) {
		const video = child.type === "paragraph" ? videoUrl(child) : undefined;
		if (video) { children.push({ type: "pullRequestVideo", data: { hName: "video", hProperties: { src: video, controls: true, preload: "metadata", className: ["pr-comment-video"] }, hChildren: [] } }); continue; }
		if (child.type === "text" && child.value) { children.push(...autolinkText(child.value, repositoryUrl)); continue; }
		if (!SKIPPED.has(child.type)) transform(child, repositoryUrl);
		children.push(child);
	}
	node.children = children;
}

export function remarkPullRequestLinks(options: { repository: string }) {
	const repositoryUrl = `https://github.com/${options.repository}`;
	return () => (tree: MarkdownNode) => { transform(tree, repositoryUrl); };
}
