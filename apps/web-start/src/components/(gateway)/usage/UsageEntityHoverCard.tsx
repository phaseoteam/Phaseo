"use client";

import React from "react";
import Link from "next/link";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

type HoverCardRow = {
	label: string;
	value: React.ReactNode;
};

export default function UsageEntityHoverCard({
	children,
	title,
	subtitle,
	href,
	rows,
	visual,
	actionLabel,
	disabled = false,
}: {
	children: React.ReactElement<{ className?: string }>;
	title: string;
	subtitle?: React.ReactNode;
	href?: string | null;
	rows: HoverCardRow[];
	visual?: React.ReactNode;
	actionLabel?: string;
	disabled?: boolean;
}) {
	if (disabled) return children;
	const resolvedActionLabel = actionLabel
		?? (href?.startsWith("/models/")
			? "View model"
			: href?.startsWith("/api-providers/")
				? "View provider"
				: href?.startsWith("/settings/keys")
					? "View key"
					: href?.startsWith("/apps/")
						? "View app"
						: "View details");
	const trigger = React.cloneElement(children, {
		className: cn(
			children.props.className,
			"cursor-help text-foreground no-underline decoration-1 decoration-foreground underline-offset-2 hover:underline hover:decoration-foreground",
		),
	} as React.HTMLAttributes<HTMLElement>);

	return (
		<HoverCard openDelay={140} closeDelay={100}>
			<HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
			<HoverCardContent align="start" className="w-[min(86vw,288px)] rounded-lg p-4">
				<div className="space-y-3">
					<div className="flex items-start gap-3">
						{visual ? <div className="mt-0.5 shrink-0 rounded-md">{visual}</div> : null}
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold text-foreground">{title}</div>
							{subtitle ? (
								<div className="mt-0.5 text-xs leading-5 text-muted-foreground">
									{subtitle}
								</div>
							) : null}
						</div>
					</div>

					{rows.length ? <div className="grid gap-2 border-t border-border/60 pt-3 text-xs">
						{rows.map((row) => (
							<div
								key={row.label}
								className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-2"
							>
								<div className="text-muted-foreground">{row.label}</div>
								<div className="min-w-0 break-words text-foreground">
									{row.value}
								</div>
							</div>
						))}
					</div> : null}

					{href ? (
						<Button asChild variant="outline" size="sm" className="h-8 w-full rounded-md">
							<Link href={href} className="gap-1.5">
								{resolvedActionLabel}
								<ArrowUpRight className="size-3.5" />
							</Link>
						</Button>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
