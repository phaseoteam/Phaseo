import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function formatShortDate(date: Date) {
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatUtcShortDate(date: Date) {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

export default function RetiresBadge(props: {
	label: string;
	retirementDate: string | null;
	className?: string;
}) {
	const { label, retirementDate, className } = props;
	const parsed = retirementDate ? new Date(retirementDate) : null;
	const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

	const content = (
		<Badge variant="outline" className={className}>
			<span className="font-semibold">{label}</span>
		</Badge>
	);

	if (!valid) return content;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6} className={cn("max-w-xs")}>
				<div className="space-y-1">
					<div className="text-xs font-medium">Retirement date</div>
					<div className="text-xs opacity-90">
						<div>User: {formatShortDate(valid)}</div>
						<div>UTC: {formatUtcShortDate(valid)}</div>
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

