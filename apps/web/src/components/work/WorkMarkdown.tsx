"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Item descriptions and comments as Markdown, with the same react-markdown + remark-gfm setup the
// model pages use. Raw HTML is never rendered: skipHtml drops it and no rehype-raw is loaded.
// react-markdown's default urlTransform already strips javascript: and other unsafe links.

const linkClass = "font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground";

const components: Components = {
	a: ({ node: _node, href, children, ...props }) => {
		// "#42" style links to other items stay in the app.
		if (href && /^\/work(\/|$)/.test(href)) return <Link href={href} className={linkClass}>{children}</Link>;
		return <a {...props} href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>{children}</a>;
	},
	p: ({ node: _node, ...props }) => <p {...props} className="my-2 first:mt-0 last:mb-0" />,
	ul: ({ node: _node, ...props }) => <ul {...props} className="my-2 list-disc space-y-1 pl-5" />,
	ol: ({ node: _node, ...props }) => <ol {...props} className="my-2 list-decimal space-y-1 pl-5" />,
	h1: ({ node: _node, ...props }) => <h3 {...props} className="mt-4 mb-2 text-base font-semibold first:mt-0" />,
	h2: ({ node: _node, ...props }) => <h3 {...props} className="mt-4 mb-2 text-sm font-semibold first:mt-0" />,
	h3: ({ node: _node, ...props }) => <h4 {...props} className="mt-3 mb-1.5 text-sm font-semibold first:mt-0" />,
	h4: ({ node: _node, ...props }) => <h4 {...props} className="mt-3 mb-1.5 text-sm font-medium first:mt-0" />,
	blockquote: ({ node: _node, ...props }) => <blockquote {...props} className="my-2 border-l-2 pl-3 text-muted-foreground" />,
	code: ({ node: _node, className, ...props }) => <code {...props} className={cn("rounded-md bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)} />,
	pre: ({ node: _node, ...props }) => <pre {...props} className="my-2 overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs [&_code]:bg-transparent [&_code]:p-0" />,
	table: ({ node: _node, ...props }) => <div className="my-2 overflow-x-auto"><table {...props} className="w-full text-left text-xs" /></div>,
	th: ({ node: _node, ...props }) => <th {...props} className="border-b px-2 py-1 font-medium" />,
	td: ({ node: _node, ...props }) => <td {...props} className="border-b px-2 py-1" />,
	img: ({ node: _node, alt }) => <span className="text-muted-foreground">{alt ? `[${alt}]` : null}</span>,
	hr: () => <hr className="my-3" />,
};

/** Turns bare "#42" references into links to the item, outside code. */
export function linkItemReferences(text: string): string {
	return text
		.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
		.map((part, index) => (index % 2 === 1 ? part : part.replace(/(^|[\s(])#(\d{1,9})\b/g, (_match, lead: string, number: string) => `${lead}[#${number}](/work/${number})`)))
		.join("");
}

export function WorkMarkdown({ children, className }: { children: string; className?: string }) {
	return (
		<div className={cn("text-sm leading-relaxed break-words", className)}>
			<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml components={components}>
				{linkItemReferences(children)}
			</ReactMarkdown>
		</div>
	);
}
