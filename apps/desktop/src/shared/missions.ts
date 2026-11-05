/** once: a single run at an exact moment (ISO); the task switches itself off after it. */
export type MissionSchedule = { type: "interval"; minutes: number } | { type: "daily"; time: string; weekdays: number[] } | { type: "once"; at: string };
/** threadTaskId: each run is posted into that chat instead of starting a new one like templateTaskId. */
export type Mission = { id: string; title: string; prompt: string; templateTaskId: string; threadTaskId?: string; schedule: MissionSchedule; enabled: boolean; createdAt: string; updatedAt: string; nextRunAt?: string; lastRunAt?: string; lastTaskId?: string; lastStatus: "never" | "running" | "completed" | "failed" | "interrupted" | "limited"; runCount: number; error?: string };
/** In save, threadTaskId null stops posting runs into a chat; omitted keeps the current choice. */
export type MissionCommand = { type: "save"; id?: string; title: string; prompt: string; templateTaskId: string; threadTaskId?: string | null; schedule: MissionSchedule } | { type: "enable"; id: string; enabled: boolean } | { type: "delete" | "run"; id: string };

export function validateMissionCommand(value: unknown): MissionCommand {
	if (!value || typeof value !== "object") throw new Error("Invalid scheduled task request.");
	const input = value as Record<string, unknown>;
	const text = (key: string, max: number) => { if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > max) throw new Error(`Invalid scheduled task ${key}.`); return input[key] as string; };
	if (input.type === "save") {
		const title = text("title", 200); const prompt = text("prompt", 100000); const templateTaskId = text("templateTaskId", 1000); const schedule = validateSchedule(input.schedule);
		const threadTaskId = input.threadTaskId === undefined || input.threadTaskId === null ? input.threadTaskId : text("threadTaskId", 1000);
		return { type: "save", ...(input.id === undefined ? {} : { id: text("id", 1000) }), title, prompt, templateTaskId, ...(threadTaskId !== undefined ? { threadTaskId } : {}), schedule };
	}
	if (input.type === "enable") { const id = text("id", 1000); if (typeof input.enabled !== "boolean") throw new Error("Invalid scheduled task enabled state."); return { type: "enable", id, enabled: input.enabled }; }
	if (input.type === "delete" || input.type === "run") return { type: input.type, id: text("id", 1000) };
	throw new Error("Unknown scheduled task request.");
}
export function validateSchedule(value: unknown): MissionSchedule {
	if (!value || typeof value !== "object") throw new Error("Choose when the scheduled task runs."); const schedule = value as Record<string, unknown>;
	if (schedule.type === "interval" && Number.isInteger(schedule.minutes) && Number(schedule.minutes) >= 1 && Number(schedule.minutes) <= 10080) return { type: "interval", minutes: schedule.minutes as number };
	if (schedule.type === "daily" && typeof schedule.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) && Array.isArray(schedule.weekdays) && schedule.weekdays.length <= 7 && schedule.weekdays.every(value => Number.isInteger(value) && value >= 0 && value <= 6)) return { type: "daily", time: schedule.time, weekdays: [...new Set(schedule.weekdays as number[])].sort() };
	if (schedule.type === "once" && typeof schedule.at === "string" && schedule.at.length <= 40 && Number.isFinite(Date.parse(schedule.at))) return { type: "once", at: new Date(schedule.at).toISOString() };
	throw new Error("Choose an interval of 1–10080 minutes, a valid local time and weekdays, or a date and time to run once.");
}
/** Undefined once a one-time schedule's moment has passed: it has nothing left to run. */
export function nextMissionRun(schedule: MissionSchedule, after: number): string | undefined {
	if (schedule.type === "interval") return new Date(after + schedule.minutes * 60000).toISOString();
	if (schedule.type === "once") return Date.parse(schedule.at) > after ? schedule.at : undefined;
	const [hour, minute] = schedule.time.split(":").map(Number);
	for (let day = 0; day <= 7; day++) {
		const candidate = new Date(after); candidate.setDate(candidate.getDate() + day); candidate.setHours(hour, minute, 0, 0);
		if (candidate.getTime() > after && (!schedule.weekdays.length || schedule.weekdays.includes(candidate.getDay()))) return candidate.toISOString();
	}
	throw new Error("This schedule has no next run.");
}
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Every 2 hours", "Weekdays at 09:00", "Mon, Thu at 18:30", "Once on Thu 6 Nov 2026 at 09:00" (local time). */
export function scheduleLabel(schedule: MissionSchedule) {
	if (schedule.type === "once") {
		const at = new Date(schedule.at), pad = (value: number) => String(value).padStart(2, "0");
		return `Once on ${weekdayNames[at.getDay()]} ${at.getDate()} ${monthNames[at.getMonth()]} ${at.getFullYear()} at ${pad(at.getHours())}:${pad(at.getMinutes())}`;
	}
	if (schedule.type === "interval") {
		const { minutes } = schedule;
		if (minutes % 60) return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
		return minutes === 60 ? "Every hour" : `Every ${minutes / 60} hours`;
	}
	const days = schedule.weekdays.join();
	const when = !schedule.weekdays.length || schedule.weekdays.length === 7 ? "Every day" : days === "1,2,3,4,5" ? "Weekdays" : days === "0,6" ? "Weekends" : schedule.weekdays.map(day => weekdayNames[day]).join(", ");
	return `${when} at ${schedule.time}`;
}
