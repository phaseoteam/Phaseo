/** Match PostgreSQL date_trunc('week', ... AT TIME ZONE 'UTC'). */
export function startOfUTCWeek(date: Date) {
	const start = new Date(date);
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
	return start;
}
