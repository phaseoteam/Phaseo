"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { markdownToPlainText } from "@/lib/models/modelDescription";
import { cn } from "@/lib/utils";

interface ModelDescriptionPanelProps {
	description: string;
}

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

function normalizeDescriptionHref(href: string | undefined): string | undefined {
	if (!href) return href;
	if (href.startsWith("#") || href.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
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

const markdownComponents: Components = {
	p: ({ node: _node, ...props }) => <span {...props} />,
	a: ({ node: _node, href, children, ...props }) => {
		const normalizedHref = normalizeDescriptionHref(href);
		const className =
			"font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary";
		const isExternal =
			typeof normalizedHref === "string" &&
			(/^[a-z][a-z0-9+.-]*:/i.test(normalizedHref) || normalizedHref.startsWith("//"));

		if (typeof normalizedHref === "string" && normalizedHref.startsWith("/")) {
			return (
				<Link href={normalizedHref} className={className}>
					{children}
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

export default function ModelDescriptionPanel({
	description,
}: ModelDescriptionPanelProps) {
	const [expanded, setExpanded] = useState(false);
	const plainTextDescription = useMemo(
		() => markdownToPlainText(description) ?? description,
		[description],
	);
	const canExpand = useMemo(() => {
		const wordCount = plainTextDescription.trim().split(/\s+/).filter(Boolean).length;
		return plainTextDescription.length > 260 || wordCount > 42;
	}, [plainTextDescription]);

	return (
		<div>
			<div
				className={cn(
					"text-[13px] leading-5 text-muted-foreground md:text-sm",
					canExpand && !expanded ? "line-clamp-4" : null,
				)}
			>
				<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
					{description}
				</ReactMarkdown>
			</div>
			{canExpand ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="mt-2 h-7 px-1 text-xs text-muted-foreground"
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? "Show less" : "Show full"}
				</Button>
			) : null}
		</div>
	);
}
