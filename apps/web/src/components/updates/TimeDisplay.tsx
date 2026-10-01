"use client";

import { useEffect, useReducer } from "react";
import { useLocale, useTranslations } from "next-intl";

function relTime(iso: string, locale: string, now = new Date()) {
	const date = new Date(iso);
	const diffMs = +now - Date.parse(iso);
	const sec = Math.round(diffMs / 1000);
	const abs = Math.abs(sec);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	if (abs < 60) return rtf.format(-sec, "second");
	const min = Math.round(sec / 60);
	if (Math.abs(min) < 60) return rtf.format(-min, "minute");
	const hrs = Math.round(min / 60);
	if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");

	// For day-and-above granularity, compute using date-only (UTC) difference
	// so midnight-UTC values from the database don't round up to 2 days.
	const dayMs = 24 * 60 * 60 * 1000;
	const utcDateOnly = (d: Date) =>
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	const days = Math.round((utcDateOnly(now) - utcDateOnly(date)) / dayMs);
	if (Math.abs(days) < 30) return rtf.format(-days, "day");

	const months = Math.round(days / 30);
	if (Math.abs(months) < 12) return rtf.format(-months, "month");
	const years = Math.round(months / 12);
	return rtf.format(-years, "year");
}

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

function formatDate(dateStr: string, locale: string) {
	const date = new Date(dateStr);
	// Show the canonical calendar date from the DB (UTC) so releases
	// stored at midnight UTC appear on the intended day.
	return date.toLocaleDateString(locale, {
		timeZone: "UTC",
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export default function TimeDisplay({
	dateIso,
	isModelRelease,
}: {
	dateIso: string;
	isModelRelease: boolean;
}) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.updates.models");
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
					{t("today")}
				</span>
			);
		} else {
			return <time dateTime={dateIso}>{formatDate(dateIso, locale)}</time>;
		}
	} else {
		return <span>{relTime(dateIso, locale)}</span>;
	}
}
