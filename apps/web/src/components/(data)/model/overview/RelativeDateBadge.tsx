import { useEffect, useState } from "react";
import {
	describeDetailedRelativeCalendarDate,
	type RelativeCalendarTone,
} from "@/lib/dates/modelLifecycleDates";
import {
	HoverCard,
	HoverCardContent,
	HoverCardHeader,
	HoverCardRows,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "@/i18n/react";
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
	const locale = useLocale();
	const t = useTranslations("Catalogue.modelDetail.metadata");
	const format = useDisplayFormatters();
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(new Date());
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, []);

	const relativeDate = describeDetailedRelativeCalendarDate(date, now);
	if (!relativeDate) return null;
	const absoluteDays = Math.abs(relativeDate.dayDifference);
	const relativeUnit: Intl.RelativeTimeFormatUnit =
		absoluteDays < 14
			? "day"
			: absoluteDays < 28
				? "week"
				: absoluteDays < 730
					? "month"
					: "year";
	const relativeValue =
		relativeUnit === "day"
			? absoluteDays
			: relativeUnit === "week"
				? Math.round(absoluteDays / 7)
				: relativeUnit === "month"
					? Math.round(absoluteDays / 30.4375)
					: Math.round(absoluteDays / 365.25);
	const relativeLabel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
		Math.sign(relativeDate.dayDifference) * relativeValue,
		relativeUnit,
	);
	const detailedLabel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
		relativeDate.dayDifference,
		"day",
	);

	return (
		<HoverCard>
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
					{relativeLabel}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="end" className="w-64 space-y-2.5">
				<HoverCardHeader title={detailedLabel} meta={[format.calendarDate(date)]} />
				<HoverCardRows
					rows={[
						{
							key: "days",
							label: t("relativeTime"),
							value: `${t("totalDays", { count: relativeDate.totalDays })}${
								relativeDate.dayDifference < 0
									? ` ${t("elapsed")}`
									: relativeDate.dayDifference > 0
										? ` ${t("remaining")}`
										: ""
							}`,
						},
					]}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
