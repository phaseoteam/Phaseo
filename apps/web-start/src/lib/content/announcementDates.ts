// Browser-safe blog date helpers. announcements.ts reads the content folder at
// module load, so components import these from here instead.

export function dateToSortValue(value: string): number {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function isAnnouncementPublished(value: string, now = new Date()): boolean {
	return dateToSortValue(value) <= now.getTime();
}

export function formatAnnouncementDate(value: string, locale: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	return parsed.toLocaleDateString(locale, {
		timeZone: "UTC",
		year: "numeric",
		month: "long",
		day: "2-digit",
	});
}
