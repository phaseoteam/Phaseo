import { ImageIcon } from "lucide-react";
import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isGithubImage as isGithubImageUrl } from "../../../shared/factory/githubImages";
import { mapHtmlTags } from "../../../shared/htmlText";
import { factory, openExternal, useDataUrl } from "../lib/useFactory";
import { cn } from "../../lib/utils";
import { FactoryLink } from "./FactoryLink";

/**
 * GitHub-flavoured Markdown, the way GitHub shows it: tables, task lists, strikethrough and autolinks. The HTML people
 * and bots write in issues is never rendered: hidden comments (bots keep state in them) go, images and line breaks
 * become their Markdown, and every other tag is dropped with its text kept.
 */

/** Issue references link to the item in Factory. Relative, so react-markdown keeps them. */
const ITEM_LINK = "#factory-item=";

/** Tags dropped with their text kept. */
const DROPPED = new Set(["details", "sub", "sup", "kbd", "ins", "mark", "picture", "source", "relative-time", "p", "div", "span", "b", "i", "em", "strong", "a", "code", "pre", "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "blockquote", "del", "s", "u", "small", "center", "font", "script", "style"]);

/** HTML in issue text, turned into the Markdown it stands for, or dropped. */
export function plainHtml(source: string): string {
	return mapHtmlTags(source, (tag, name, closing) => {
		if (name === "img") {
			const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
			const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "Image";
			return src ? `![${alt.replace(/[[\]]/g, "")}](${src})` : "";
		}
		if (name === "br") return "  \n";
		if (name === "summary") return closing ? "**\n\n" : "**";
		return DROPPED.has(name) ? "" : tag;
	});
}

/** Single line breaks become breaks, as GitHub shows them in issues and comments. */
interface MdNode { type: string; value?: string; url?: string; children?: MdNode[] }
function remarkBreaks() {
	return (tree: MdNode) => {
		const walk = (node: MdNode) => {
			if (!node.children || node.type === "code" || node.type === "inlineCode") return;
			node.children = node.children.flatMap((child): MdNode[] => {
				if (child.type !== "text" || !child.value?.includes("\n")) {
					walk(child);
					return [child];
				}
				return child.value.split("\n").flatMap((part, index) => (index ? [{ type: "break" }, { type: "text", value: part }] : [{ type: "text", value: part }]));
			});
		};
		walk(tree);
	};
}

/** "#12" becomes a link to that issue or pull request in Factory, as GitHub links it on github.com. */
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
					parts.push({ type: "link", url: `${ITEM_LINK}${encodeURIComponent(`${options.repo}#${match[2]}`)}`, children: [{ type: "text", value: `#${match[2]}` }] });
					last = start + match[2]!.length + 1;
				}
				if (last < child.value.length) parts.push({ type: "text", value: child.value.slice(last) });
				return parts;
			});
		};
		walk(tree);
	};
}

const imageLink = "inline-flex items-center gap-1 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground";

/** A GitHub image, read with gh's sign-in so private repositories' ones show. Clicking opens it on GitHub; one that won't load becomes a link. */
function GithubImage({ url, label }: { url: string; label: string }) {
	const source = useDataUrl(() => factory().githubImage(url), url);
	if (source === null) return <button type="button" className={imageLink} onClick={() => openExternal(url)}><ImageIcon className="size-3.5" />{label}</button>;
	if (source === undefined) return <span className="my-1 inline-block h-24 w-40 animate-pulse rounded-md border bg-muted/40" aria-label={`Loading ${label}`} />;
	return <img src={source} alt={label} title={label} draggable={false} onClick={() => openExternal(url)} className="my-1 inline-block max-h-[480px] max-w-full cursor-zoom-in rounded-md border bg-muted/30" />;
}

function links(): Components {
	return {
		// The window never navigates away: GitHub and web links open in the browser, issue numbers open here.
		a: ({ href: url, children }) => {
			if (url?.startsWith(ITEM_LINK)) return <FactoryLink to={{ item: decodeURIComponent(url.slice(ITEM_LINK.length)) }}>{children}</FactoryLink>;
			if (!url || !/^https?:\/\//.test(url)) return <span>{children}</span>;
			return <a href={url} title={url} onClick={(event) => {
				event.preventDefault();
				openExternal(url);
			}}>{children}</a>;
		},
		// GitHub's own images show here. Images anywhere else stay links: loading them would tell that site the item was opened.
		img: ({ src, alt }) => {
			const url = typeof src === "string" ? src : undefined;
			const label = alt || "Image";
			if (!url || !/^https?:\/\//.test(url)) return <span className="text-muted-foreground">{label}</span>;
			if (isGithubImageUrl(url)) return <GithubImage url={url} label={label} />;
			return <button type="button" className={imageLink} onClick={() => openExternal(url)}><ImageIcon className="size-3.5" />{label}</button>;
		},
		input: ({ checked, type }) => (type === "checkbox" ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-1.5 align-middle accent-[var(--primary)]" /> : null),
		table: ({ children }) => <div className="item-markdown-table"><table>{children}</table></div>,
	};
}

/** Block Markdown: issue and pull request descriptions, comments, reports. `repo` turns #12 into links. */
export const Markdown = memo(function Markdown({ source, repo, className }: { source: string; repo?: string; className?: string }) {
	return <div data-selectable className={cn("item-markdown text-sm select-text", className)}>
		<ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkBreaks, [remarkIssueRefs, { repo }]]} components={links()}>{plainHtml(source)}</ReactMarkdown>
	</div>;
});

/**
 * One line of Markdown, for summaries and proof lines that agents write with `code` and **bold** in them.
 * Blocks are flattened into the line, and HTML is dropped.
 */
export const InlineMarkdown = memo(function InlineMarkdown({ source, repo, className }: { source: string; repo?: string; className?: string }): ReactNode {
	return <span className={cn("inline-markdown", className)}>
		<ReactMarkdown skipHtml remarkPlugins={[remarkGfm, [remarkIssueRefs, { repo }]]} allowedElements={["p", "code", "strong", "em", "del", "a", "br"]} unwrapDisallowed components={{ ...links(), p: ({ children }) => <>{children} </> }}>{source}</ReactMarkdown>
	</span>;
});
