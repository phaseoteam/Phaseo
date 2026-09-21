"use client";

import { useEffect, useMemo, useState } from "react";

import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	useDisplayFormatters,
	useDisplayPreferences,
} from "@/components/providers/DisplayPreferencesProvider";
import { formatDisplayTimestamp } from "@/lib/displayPreferences";

type ResetWindowHoverProps = {
	iso: string;
	triggerText: string;
};

export default function ResetWindowHover({ iso, triggerText }: ResetWindowHoverProps) {
	const format = useDisplayFormatters();
	const { preferences } = useDisplayPreferences();
	const [relativeNowMs, setRelativeNowMs] = useState<number | null>(null);
	const userTimeZone = useMemo(
		() =>
			preferences.timeZone !== "system"
				? preferences.timeZone
				: typeof Intl !== "undefined"
				? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
				: "UTC",
		[preferences.timeZone],
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
						<div className="font-mono">
							{format.dateTime(date, { includeSeconds: true })}
						</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">UTC</div>
						<div className="font-mono">
							{format.dateParts(date, {
								dateStyle: preferences.dateStyle === "iso" ? "short" : preferences.dateStyle,
								timeStyle: "medium",
								timeZone: "UTC",
							})}
						</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Relative</div>
						<div className="font-mono">
							{relativeNowMs
								? formatDisplayTimestamp(
										date,
										{ ...preferences, relativeTime: "relative" },
										new Date(relativeNowMs),
									)
								: "-"}
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
