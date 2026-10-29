// Times since something and token counts come from @phaseo/app-kit/format, in the website's style.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function duration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function clock(at: number): string {
	return new Date(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function until(at: number, now = Date.now()): string {
	const delta = Math.max(0, at - now);
	if (delta < HOUR) return `${Math.ceil(delta / MINUTE)}m`;
	if (delta < DAY) return `${Math.floor(delta / HOUR)}h ${Math.floor((delta % HOUR) / MINUTE)}m`;
	return `${Math.round(delta / DAY)}d`;
}
