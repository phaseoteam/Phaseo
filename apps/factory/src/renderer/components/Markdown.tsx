import { ImageIcon } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { githubImageSource, isGithubImage as isGithubImageUrl } from "../../shared/githubImages";
import { factory, href } from "../lib/useFactory";
import { cn } from "../lib/utils";

/**
 * GitHub-flavoured Markdown, the way GitHub shows it: tables, task lists, strikethrough, autolinks,
 * footnotes, and the HTML people and bots write in issues (<details>, <sub>, <kbd>, <br>). HTML goes
 * through GitHub's own sanitising rules first, so nothing can run scripts, style the page or load frames.
 */

/** GitHub's allow-list, plus the tags it keeps that the default leaves out. Hidden HTML comments (bots keep state in them) are dropped. */
const SCHEMA: SanitizeSchema = {
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "kbd", "sub", "sup", "ins", "mark", "picture", "source", "relative-time"],
	attributes: {
		...defaultSchema.attributes,
		details: ["open"],
		img: [...(defaultSchema.attributes?.img ?? []), "width", "height"],
		code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/]],
		"*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
	},
};

/** "#12" becomes a link to that issue or pull request in Factory, as GitHub links it on github.com. */
interface MdNode { type: string; value?: string; url?: string; children?: MdNode[] }
function remarkIssueRefs(options: { repo?: string }) {
	return (tree: MdNode) => {
		if (!options.repo) return;
		const walk = (node: MdNode) => {
			if (!node.children || node.type === "link" || node.type === "inlineCode" || node.type === "code") return;
			node.children = node.children.flatMap((child): MdNode[] => {
				if (child.type !== "text" || !child.value?.includes("#")) {
					walk(child);
					return [child];
				}
				const parts: MdNode[] = [];
				let last = 0;
				for (const match of child.value.matchAll(/(^|[\s(])#(\d+)\b/g)) {
					const start = match.index + match[1]!.length;
					if (start > last) parts.push({ type: "text", value: child.value.slice(last, start) });
					parts.push({ type: "link", url: href({ page: "work", item: `${options.repo}#${match[2]}` }), children: [{ type: "text", value: `#${match[2]}` }] });
					last = start + match[2]!.length + 1;
				}
				if (last < child.value.length) parts.push({ type: "text", value: child.value.slice(last) });
				return parts;
			});
		};
		walk(tree);
	};
}

/** A GitHub image, shown in place. Clicking opens it on GitHub; one that won't load becomes a link. */
function GithubImage({ url, label }: { url: string; label: string }) {
	const [failed, setFailed] = useState(false);
	if (failed) return <button type="button" className="inline-flex items-center gap-1 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" onClick={() => void factory().openExternal(url)}><ImageIcon className="size-3.5" />{label}</button>;
	return <img src={githubImageSource(url)} alt={label} title={label} loading="lazy" draggable={false} onError={() => setFailed(true)} onClick={() => void factory().openExternal(url)} className="my-1 inline-block max-h-[480px] max-w-full cursor-zoom-in rounded-md border bg-muted/30" />;
}

function links(): Components {
	return {
		// The window never navigates away: GitHub and web links open in the browser, issue numbers open here.
		a: ({ href: url, children }) => {
			if (url?.startsWith("#/")) return <a href={url}>{children}</a>;
			if (!url || !/^https?:\/\//.test(url)) return <span>{children}</span>;
			return <a href={url} title={url} onClick={(event) => {
				event.preventDefault();
				void factory().openExternal(url);
			}}>{children}</a>;
		},
		// GitHub's own images show here, read with gh's sign-in so private repositories' ones load too. Images
		// anywhere else stay links: loading them would tell that site the item was opened.
		img: ({ src, alt }) => {
			const url = typeof src === "string" ? src : undefined;
			const label = alt || "Image";
			if (!url || !/^https?:\/\//.test(url)) return <span className="text-muted-foreground">{label}</span>;
			if (isGithubImageUrl(url)) return <GithubImage url={url} label={label} />;
			return <button type="button" className="inline-flex items-center gap-1 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" onClick={() => void factory().openExternal(url)}><ImageIcon className="size-3.5" />{label}</button>;
		},
		input: ({ checked, type }) => (type === "checkbox" ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-1.5 align-middle accent-[var(--primary)]" /> : null),
		table: ({ children }) => <div className="item-markdown-table"><table>{children}</table></div>,
	};
}

/** Block Markdown: issue and pull request descriptions, comments, reports. `repo` turns #12 into links. */
export const Markdown = memo(function Markdown({ source, repo, className }: { source: string; repo?: string; className?: string }) {
	return <div data-selectable className={cn("item-markdown text-sm", className)}>
		<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, [remarkIssueRefs, { repo }]]} rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]} components={links()}>{source}</ReactMarkdown>
	</div>;
});

/**
 * One line of Markdown, for summaries and proof lines that agents write with `code` and **bold** in them.
 * Blocks are flattened into the line, and HTML is dropped.
 */
export const InlineMarkdown = memo(function InlineMarkdown({ source, repo, className }: { source: string; repo?: string; className?: string }): ReactNode {
	return <span className={cn("inline-markdown", className)}>
		<ReactMarkdown remarkPlugins={[remarkGfm, [remarkIssueRefs, { repo }]]} allowedElements={["p", "code", "strong", "em", "del", "a", "br"]} unwrapDisallowed components={{ ...links(), p: ({ children }) => <>{children} </> }}>{source}</ReactMarkdown>
	</span>;
});
