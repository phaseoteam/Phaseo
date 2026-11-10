import * as React from "react";

import { cn } from "@/lib/utils";

// The layout every hover card shares: a title row, one muted meta line, an
// optional headline figure, label/value rows, then badges. No boxes, rules or
// footers inside a card; the trigger is the link.

export type HoverCardFact = {
	/** Defaults to the label when the label is a string. */
	key?: string;
	label: React.ReactNode;
	value: React.ReactNode;
};

/** Title row with an optional icon or logo, then the meta line ("a · b"). */
export function HoverCardTitle({
	icon,
	title,
	meta,
	className,
}: {
	icon?: React.ReactNode;
	title: React.ReactNode;
	meta?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0", className)}>
			<div className="flex min-w-0 items-center gap-2 font-medium text-foreground">
				{icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
				<span className="min-w-0 truncate">{title}</span>
			</div>
			{meta ? <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
		</div>
	);
}

/** Joins the parts that are present with " · ". */
export function joinMeta(parts: ReadonlyArray<React.ReactNode>): React.ReactNode {
	const present = parts.filter(
		(part) => part !== null && part !== undefined && part !== false && part !== "",
	);
	if (present.length === 0) return null;
	return present.map((part, index) => (
		<React.Fragment key={index}>
			{index > 0 ? " · " : null}
			{part}
		</React.Fragment>
	));
}

/** One big figure, such as a balance or a duration, with optional muted words before or after it. */
export function HoverCardHeadline({
	children,
	prefix,
	label,
	className,
}: {
	children: React.ReactNode;
	prefix?: React.ReactNode;
	label?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex min-w-0 items-baseline gap-2", className)}>
			{prefix ? <span className="shrink-0 text-xs text-muted-foreground">{prefix}</span> : null}
			<span className="text-lg font-semibold tabular-nums text-foreground">{children}</span>
			{label ? <span className="truncate text-xs text-muted-foreground">{label}</span> : null}
		</div>
	);
}

/** Label/value rows; values are left-aligned and wrap rather than overflow. */
export function HoverCardFacts({
	rows,
	className,
}: {
	rows: ReadonlyArray<HoverCardFact | null | false | undefined>;
	className?: string;
}) {
	const present = rows.filter((row): row is HoverCardFact => Boolean(row));
	if (present.length === 0) return null;
	return (
		<dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs", className)}>
			{present.map((row, index) => (
				<React.Fragment key={row.key ?? (typeof row.label === "string" ? row.label : index)}>
					<dt className="text-muted-foreground">{row.label}</dt>
					<dd className="min-w-0 break-words text-foreground">{row.value}</dd>
				</React.Fragment>
			))}
		</dl>
	);
}

/** A wrapping row of badges at the foot of a card. */
export function HoverCardBadgeRow({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>;
}

/** The card body: stacks the parts above with even spacing. */
export function HoverCardBody({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <div className={cn("grid min-w-0 gap-2.5 text-sm", className)}>{children}</div>;
}
