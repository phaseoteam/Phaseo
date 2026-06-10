"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { markdownToPlainText } from "@/lib/models/modelDescription";
import { cn } from "@/lib/utils";
import { modelMarkdownComponents } from "./modelMarkdown";

interface ModelDescriptionPanelProps {
	description: string;
}

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
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={modelMarkdownComponents}
				>
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
