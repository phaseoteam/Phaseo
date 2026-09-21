"use client";

import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { DisplayDateValue } from "@/lib/displayPreferences";

type DateValueProps = {
	value: DisplayDateValue;
	fallback?: string;
};

export function DisplayDate({ value, fallback }: DateValueProps) {
	const format = useDisplayFormatters();
	return <>{format.date(value, fallback)}</>;
}

export function DisplayCalendarDate({ value, fallback }: DateValueProps) {
	const format = useDisplayFormatters();
	return <>{format.calendarDate(value, fallback)}</>;
}

export function DisplayDateParts({
	value,
	options,
	fallback,
}: DateValueProps & { options: Intl.DateTimeFormatOptions }) {
	const format = useDisplayFormatters();
	return <>{format.dateParts(value, options, fallback)}</>;
}

export function DisplayDateTime({ value }: DateValueProps) {
	const format = useDisplayFormatters();
	return <>{format.dateTime(value)}</>;
}

export function DisplayTimestamp({ value, fallback }: DateValueProps) {
	const format = useDisplayFormatters();
	return <>{value == null || value === "" ? fallback ?? "-" : format.timestamp(value)}</>;
}

export function DisplayNumber({
	value,
	options,
}: {
	value: number;
	options?: Intl.NumberFormatOptions;
}) {
	const format = useDisplayFormatters();
	return <>{format.number(value, options)}</>;
}
