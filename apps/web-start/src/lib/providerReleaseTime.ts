/** Return a UTC instant only for a valid, unambiguous local wall-clock minute. */
export function providerReleaseInstant(value: string, timeZone: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
	const wallClock = Date.parse(`${value}:00Z`);
	if (!Number.isFinite(wallClock) || new Date(wallClock).toISOString().slice(0, 16) !== value) return null;
	try {
		const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
		const local = (instant: number) => {
			const p = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
			return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
		};
		// Sample both sides of a possible offset transition, then round-trip each
		// candidate. Gaps and repeated wall times must never silently shift a launch.
		const offsets = new Set([-36, 0, 36].map((hours) => {
			const sample = wallClock + hours * 3_600_000;
			return Date.parse(`${local(sample)}:00Z`) - sample;
		}));
		const matches = [...offsets].map((offset) => wallClock - offset).filter((instant) => local(instant) === value);
		return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
	} catch { return null; }
}
