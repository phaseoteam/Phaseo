"use client";

import React from "react";
import Link from "next/link";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
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
	disabled = false,
}: {
	children: React.ReactElement;
	title: string;
	subtitle?: React.ReactNode;
	href?: string | null;
	rows: HoverCardRow[];
	visual?: React.ReactNode;
	disabled?: boolean;
}) {
	if (disabled) return children;

	return (
		<HoverCard openDelay={140} closeDelay={100}>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent align="start" className="w-[min(86vw,340px)] p-3">
				<div className="space-y-3">
					<div className="flex items-start gap-3">
						{visual ? <div className="mt-0.5 shrink-0">{visual}</div> : null}
						<div className="min-w-0">
							{href ? (
								<Link
									href={href}
									className="inline-flex min-w-0 items-center gap-1 font-medium underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
								>
									<span className="truncate">{title}</span>
									<ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
								</Link>
							) : (
								<div className="truncate font-medium">{title}</div>
							)}
							{subtitle ? (
								<div className="mt-1 text-xs text-muted-foreground">
									{subtitle}
								</div>
							) : null}
						</div>
					</div>

					<div className="grid gap-2 text-xs">
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
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
