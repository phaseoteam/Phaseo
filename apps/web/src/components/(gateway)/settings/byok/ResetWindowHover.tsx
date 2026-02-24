"use client";

import { useEffect, useMemo, useState } from "react";

import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";

function formatDateTime(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(date);
}

function formatRelativeFromNow(date: Date, nowMs: number): string {
	const diffInSeconds = Math.floor((date.getTime() - nowMs) / 1000);
	const absDiffInSeconds = Math.abs(diffInSeconds);

	if (absDiffInSeconds < 300) return "just now";

	let value: number;
	let unit: "minute" | "hour" | "day" | "week" | "month" | "year";

	if (absDiffInSeconds < 3600) {
		value = Math.floor(absDiffInSeconds / 60);
		unit = "minute";
	} else if (absDiffInSeconds < 86400) {
		value = Math.floor(absDiffInSeconds / 3600);
		unit = "hour";
	} else if (absDiffInSeconds < 604800) {
		value = Math.floor(absDiffInSeconds / 86400);
		unit = "day";
	} else if (absDiffInSeconds < 2419200) {
		value = Math.floor(absDiffInSeconds / 604800);
		unit = "week";
	} else if (absDiffInSeconds < 31536000) {
		value = Math.floor(absDiffInSeconds / 2628000);
		unit = "month";
	} else {
		value = Math.floor(absDiffInSeconds / 31536000);
		unit = "year";
	}

	const unitLabel = value === 1 ? unit : `${unit}s`;
	return diffInSeconds >= 0 ? `in ${value} ${unitLabel}` : `${value} ${unitLabel} ago`;
}

type ResetWindowHoverProps = {
	iso: string;
	triggerText: string;
};

export default function ResetWindowHover({ iso, triggerText }: ResetWindowHoverProps) {
	const [relativeNowMs, setRelativeNowMs] = useState<number | null>(null);
	const userTimeZone = useMemo(
		() =>
			typeof Intl !== "undefined"
				? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
				: "UTC",
		[],
	);

	const date = useMemo(() => new Date(iso), [iso]);

	useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span className="cursor-help underline underline-offset-2 decoration-dotted">
					{triggerText}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto">
				<div className="grid gap-2 text-xs">
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">{userTimeZone}</div>
						<div className="font-mono">{formatDateTime(date, userTimeZone)}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">UTC</div>
						<div className="font-mono">{formatDateTime(date, "UTC")}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Relative</div>
						<div className="font-mono">
							{relativeNowMs ? formatRelativeFromNow(date, relativeNowMs) : "-"}
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
