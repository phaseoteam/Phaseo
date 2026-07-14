import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

function formatShortDate(date: Date) {
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatUtcShortDate(date: Date) {
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function daysUntilRetirement(date: Date) {
	const dayMs = 24 * 60 * 60 * 1000;
	return Math.ceil((date.getTime() - Date.now()) / dayMs);
}

function retirementToneClassName(daysUntil: number) {
	if (daysUntil < 0) {
		return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
	}
	if (daysUntil <= 7) {
		return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
	}
	if (daysUntil <= 14) {
		return "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300";
	}
	if (daysUntil <= 30) {
		return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
	}
	if (daysUntil <= 60) {
		return "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300";
	}
	return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300";
}

export default function RetiresBadge(props: {
	label: string;
	retirementDate: string | null;
	className?: string;
}) {
	const { label, retirementDate, className } = props;
	const parsed = retirementDate ? new Date(retirementDate) : null;
	const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

	if (!valid) {
		return (
			<Badge variant="outline" className={className}>
				<span className="font-semibold">{label}</span>
			</Badge>
		);
	}

	const daysUntil = daysUntilRetirement(valid);
	const content = (
		<Badge
			variant="outline"
			className={cn("cursor-help", className, retirementToneClassName(daysUntil))}
			render={<button type="button" />}
		>
			<span className="font-semibold">{label}</span>
		</Badge>
	);

	return (
		<HoverCard openDelay={150} closeDelay={100}>
			<HoverCardTrigger asChild>{content}</HoverCardTrigger>
			<HoverCardContent align="start" side="bottom" sideOffset={8} className="w-auto">
				<div className="grid gap-2 text-xs">
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Your timezone</div>
						<div className="font-mono">{formatShortDate(valid)}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">UTC</div>
						<div className="font-mono">{formatUtcShortDate(valid)}</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

