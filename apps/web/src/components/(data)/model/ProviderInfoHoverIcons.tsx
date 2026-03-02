"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Layers3, Tag } from "lucide-react";

const QUANTIZATION_DOCS_URL =
	"https://docs.ai-stats.phaseo.app/v1/guides/model-quantization";

function uniqueDefined(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(
			values
				.map((value) => (typeof value === "string" ? value.trim() : ""))
				.filter(Boolean)
		)
	).sort((a, b) => a.localeCompare(b));
}

function IconHover({
	ariaLabel,
	children,
	content,
}: {
	ariaLabel: string;
	children: ReactNode;
	content: ReactNode;
}) {
	return (
		<HoverCard openDelay={150} closeDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700"
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72 p-3 text-xs">
				{content}
			</HoverCardContent>
		</HoverCard>
	);
}

export default function ProviderInfoHoverIcons({
	providerId,
	providerModelSlugs = [],
	quantizationSchemes = [],
	className,
}: {
	providerId: string;
	providerModelSlugs?: Array<string | null | undefined>;
	quantizationSchemes?: Array<string | null | undefined>;
	className?: string;
}) {
	const slugs = uniqueDefined(providerModelSlugs);
	const quantizations = uniqueDefined(quantizationSchemes);
	const hasQuantization = quantizations.length > 0;
	const hasSlug = slugs.length > 0;

	if (!hasQuantization && !hasSlug) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasQuantization ? (
				<IconHover
					ariaLabel="Quantization details"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider serves this model using{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-foreground">
									{quantizations.join(", ")}
								</code>{" "}
								quantization.
							</p>
							<Link
								href={QUANTIZATION_DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								Read quantization docs
							</Link>
						</div>
					}
				>
					<Layers3 className="h-3.5 w-3.5" />
				</IconHover>
			) : null}

			{hasSlug ? (
				<IconHover
					ariaLabel="Provider label"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider labels this model as:
							</p>
							<div className="flex flex-col items-start gap-1">
								{slugs.map((slug) => (
									<code
										key={slug}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-foreground"
									>
										{slug}
									</code>
								))}
							</div>
							<Link
								href={`/api-providers/${providerId}`}
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								View provider page
							</Link>
						</div>
					}
				>
					<Tag className="h-3.5 w-3.5" />
				</IconHover>
			) : null}
		</div>
	);
}
