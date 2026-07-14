import Link from "next/link";
import type { ComponentProps } from "react";
import type { Components } from "react-markdown";

const KNOWN_INTERNAL_ROOTS = new Set([
	"about",
	"announcements",
	"api-providers",
	"benchmarks",
	"chat",
	"compare",
	"contact",
	"docs",
	"families",
	"gateway",
	"help",
	"models",
	"organisations",
	"pricing",
	"providers",
	"subscription-plans",
]);

export function normalizeModelMarkdownHref(
	href: string | undefined,
): string | undefined {
	if (!href) return href;
	if (
		href.startsWith("#") ||
		href.startsWith("//") ||
		/^[a-z][a-z0-9+.-]*:/i.test(href)
	) {
		return href;
	}
	if (!href.startsWith("/")) {
		return href;
	}

	const segments = href.split("/").filter(Boolean);
	if (segments.length >= 2 && !KNOWN_INTERNAL_ROOTS.has(segments[0]!)) {
		return `/models${href}`;
	}

	return href;
}

export const modelMarkdownComponents: Components = {
	p: ({ node: _node, ...props }) => <span {...props} />,
	a: ({ node: _node, href, children, ...props }) => {
		const normalizedHref = normalizeModelMarkdownHref(href);
		const className =
			"font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary";
		const isExternal =
			typeof normalizedHref === "string" &&
			(/^[a-z][a-z0-9+.-]*:/i.test(normalizedHref) ||
				normalizedHref.startsWith("//"));

		if (typeof normalizedHref === "string" && normalizedHref.startsWith("/")) {
			return (
				<Link href={normalizedHref} className={className}>
					{children as ComponentProps<typeof Link>["children"]}
				</Link>
			);
		}

		return (
			<a
				{...props}
				href={normalizedHref}
				className={className}
				target={isExternal ? "_blank" : undefined}
				rel={isExternal ? "noreferrer noopener" : undefined}
			>
				{children}
			</a>
		);
	},
	code: ({ node: _node, ...props }) => (
		<code
			{...props}
			className="rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground"
		/>
	),
	strong: ({ node: _node, ...props }) => (
		<strong {...props} className="font-semibold text-foreground" />
	),
	em: ({ node: _node, ...props }) => <em {...props} className="italic" />,
};
