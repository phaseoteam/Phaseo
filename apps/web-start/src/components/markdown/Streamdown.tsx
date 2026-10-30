"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";

export type StreamdownProps = {
	children?: string;
	className?: string;
	components?: ComponentProps<typeof ReactMarkdown>["components"];
	remarkPlugins?: ComponentProps<typeof ReactMarkdown>["remarkPlugins"];
	rehypePlugins?: ComponentProps<typeof ReactMarkdown>["rehypePlugins"];
};

export function Streamdown({
	children,
	className,
	components,
	remarkPlugins,
	rehypePlugins,
}: StreamdownProps) {
	return (
		<div className={className}>
			<ReactMarkdown
				components={components}
				remarkPlugins={remarkPlugins}
				rehypePlugins={rehypePlugins}
			>
				{children ?? ""}
			</ReactMarkdown>
		</div>
	);
}
