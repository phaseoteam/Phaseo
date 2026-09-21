"use client";

import { useEffect, useReducer } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

function isDateToday(dateStr: string) {
	// Compare dates in UTC because database dates are stored in UTC
	// (often at midnight) and we want calendar-day comparisons.
	const now = new Date();
	const date = new Date(dateStr);
	return (
		now.getUTCFullYear() === date.getUTCFullYear() &&
		now.getUTCMonth() === date.getUTCMonth() &&
		now.getUTCDate() === date.getUTCDate()
	);
}

export default function TimeDisplay({
	dateIso,
	isModelRelease,
}: {
	dateIso: string;
	isModelRelease: boolean;
}) {
	const format = useDisplayFormatters();
	const [_, update] = useReducer(() => ({}), {});
	useEffect(() => {
		const interval = setInterval(update, 60000); // update every minute
		return () => clearInterval(interval);
	}, []);

	if (isModelRelease) {
		const today = isDateToday(dateIso);
		if (today) {
			return (
				<span className="text-[10px] uppercase tracking-wide font-semibold text-amber-800 bg-amber-200 dark:text-amber-200 dark:bg-amber-800 rounded px-2 py-0.5 border border-amber-300 dark:border-amber-700">
					Today
				</span>
			);
		} else {
			return <time dateTime={dateIso}>{format.calendarDate(dateIso)}</time>;
		}
	} else {
		return <span>{format.timestamp(dateIso)}</span>;
	}
}
