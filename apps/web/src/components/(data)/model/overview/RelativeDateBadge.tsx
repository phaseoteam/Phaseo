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

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const toneClassNames: Record<RelativeCalendarTone, string> = {
	past: "border-current/10 bg-white/70 dark:bg-black/10",
	today: "border-current/20 bg-white/90 shadow-sm dark:bg-black/20",
	future: "border-current/15 bg-white/85 dark:bg-black/15",
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
						"inline-flex cursor-help items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
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
						{relativeDate.totalDays.toLocaleString()} total day
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
