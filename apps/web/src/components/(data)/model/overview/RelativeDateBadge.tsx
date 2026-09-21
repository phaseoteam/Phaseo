"use client";

import { useEffect, useState } from "react";
import {
	describeDetailedRelativeCalendarDate,
	type RelativeCalendarTone,
} from "@/lib/dates/modelLifecycleDates";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { DisplayNumber } from "@/components/display/DisplayValue";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const toneClassNames: Record<RelativeCalendarTone, string> = {
	// Relative dates are inline metadata, not status controls. Keep the tone
	// hook available without adding a surface behind the text.
	past: "text-muted-foreground",
	today: "text-foreground",
	future: "text-muted-foreground",
};

type RelativeDateBadgeProps = {
	date: string;
	className?: string;
};

export default function RelativeDateBadge({
	date,
	className,
}: RelativeDateBadgeProps) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(new Date());
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, []);

	const relativeDate = describeDetailedRelativeCalendarDate(date, now);
	if (!relativeDate) return null;

	return (
		<HoverCard openDelay={140} closeDelay={80}>
			<HoverCardTrigger asChild>
				<span
					suppressHydrationWarning
					tabIndex={0}
					className={cn(
						"inline-flex cursor-help items-center text-[11px] font-medium leading-4",
						toneClassNames[relativeDate.tone],
						className,
					)}
				>
					{relativeDate.label}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="end" className="w-72 p-3">
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground">
						Relative Time
					</p>
					<p className="text-sm font-semibold">{relativeDate.detailedLabel}</p>
					<p className="text-xs text-muted-foreground">
						<DisplayNumber value={relativeDate.totalDays} /> total day
						{relativeDate.totalDays === 1 ? "" : "s"}
						{relativeDate.dayDifference < 0
							? " elapsed"
							: relativeDate.dayDifference > 0
								? " remaining"
								: ""}
					</p>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
