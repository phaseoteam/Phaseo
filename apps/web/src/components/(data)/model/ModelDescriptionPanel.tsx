"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { modelMarkdownComponents } from "./modelMarkdown";

interface ModelDescriptionPanelProps {
	description: string;
}

export default function ModelDescriptionPanel({
	description,
}: ModelDescriptionPanelProps) {
	const t = useTranslations("Catalogue.models.detail.actions");
	const [expandedDescription, setExpandedDescription] = useState<string | null>(null);
	const expanded = expandedDescription === description;
	const descriptionRef = useRef<HTMLDivElement>(null);
	const [canExpand, setCanExpand] = useState(false);
	const descriptionId = useId();

	useEffect(() => {
		const element = descriptionRef.current;
		if (!element || expanded) return;

		const updateOverflow = () => {
			setCanExpand(element.scrollHeight > element.clientHeight + 1);
		};
		updateOverflow();
		const observer = new ResizeObserver(updateOverflow);
		observer.observe(element);
		return () => observer.disconnect();
	}, [description, expanded]);

	return (
		<div className="relative max-w-4xl">
			<div className="relative">
				<div
					id={descriptionId}
					ref={descriptionRef}
					className={cn(
						"scroll-mt-36 text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]",
						"[&_p]:mb-4 [&_p:last-child]:mb-0 [&_h1]:mt-8 [&_h2]:mt-8 [&_h3]:mt-7 [&_h4]:mt-6",
						"[&_h1]:mb-3 [&_h2]:mb-3 [&_h3]:mb-3 [&_h4]:mb-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm",
						"[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&>:first-child]:mt-0",
						"[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_li::marker]:text-muted-foreground/50 [&_li_p]:mb-1",
						"[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:block [&_table]:overflow-x-auto",
						!expanded ? "max-h-28 overflow-hidden" : null,
					)}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={{
							...modelMarkdownComponents,
							p: ({ node: _node, ...props }) => <p {...props} />,
							a: expanded ? modelMarkdownComponents.a : ({ children }) => <span>{children}</span>,
						}}
					>
						{description}
					</ReactMarkdown>
				</div>
				{canExpand && !expanded ? (
					<div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
				) : null}
			</div>
			{canExpand ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						"h-7 gap-1.5 rounded-md bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
						expanded ? "mt-2 ml-auto flex" : "absolute right-0 bottom-2",
					)}
					aria-expanded={expanded}
					aria-controls={descriptionId}
					onClick={() => {
						if (expanded && descriptionRef.current && descriptionRef.current.getBoundingClientRect().top < 0) {
							descriptionRef.current.scrollIntoView({ block: "start", behavior: "instant" });
						}
						setExpandedDescription(expanded ? null : description);
					}}
				>
					{expanded ? t("showLessDescription") : t("showFullDescription")}
					<ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
				</Button>
			) : null}
		</div>
	);
}
