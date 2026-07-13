"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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
	const [expanded, setExpanded] = useState(false);
	const descriptionRef = useRef<HTMLDivElement>(null);
	const [canExpand, setCanExpand] = useState(false);

	useEffect(() => {
		setExpanded(false);
	}, [description]);

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
		<div>
			<div
				ref={descriptionRef}
				className={cn(
					"text-[13px] leading-5 text-muted-foreground md:text-sm",
					!expanded ? "line-clamp-4" : null,
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
