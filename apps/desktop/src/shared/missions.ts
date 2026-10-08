export type MissionSchedule = { type: "interval"; minutes: number } | { type: "daily"; time: string; weekdays: number[] };
export type Mission = { id: string; title: string; prompt: string; templateTaskId: string; schedule: MissionSchedule; enabled: boolean; createdAt: string; updatedAt: string; nextRunAt?: string; lastRunAt?: string; lastTaskId?: string; lastStatus: "never" | "running" | "completed" | "failed" | "interrupted" | "limited"; runCount: number; error?: string };
export type MissionCommand = { type: "save"; id?: string; title: string; prompt: string; templateTaskId: string; schedule: MissionSchedule } | { type: "enable"; id: string; enabled: boolean } | { type: "delete" | "run"; id: string };

export function validateMissionCommand(value: unknown): MissionCommand {
	if (!value || typeof value !== "object") throw new Error("Invalid mission request.");
	const input = value as Record<string, unknown>;
	const text = (key: string, max: number) => { if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > max) throw new Error(`Invalid mission ${key}.`); return input[key] as string; };
	if (input.type === "save") {
		const title = text("title", 200); const prompt = text("prompt", 100000); const templateTaskId = text("templateTaskId", 1000); const schedule = validateSchedule(input.schedule);
		return { type: "save", ...(input.id === undefined ? {} : { id: text("id", 1000) }), title, prompt, templateTaskId, schedule };
	}
	if (input.type === "enable") { const id = text("id", 1000); if (typeof input.enabled !== "boolean") throw new Error("Invalid mission enabled state."); return { type: "enable", id, enabled: input.enabled }; }
	if (input.type === "delete" || input.type === "run") return { type: input.type, id: text("id", 1000) };
	throw new Error("Unknown mission request.");
}
export function validateSchedule(value: unknown): MissionSchedule {
	if (!value || typeof value !== "object") throw new Error("Choose a mission schedule."); const schedule = value as Record<string, unknown>;
	if (schedule.type === "interval" && Number.isInteger(schedule.minutes) && Number(schedule.minutes) >= 1 && Number(schedule.minutes) <= 10080) return { type: "interval", minutes: schedule.minutes as number };
	if (schedule.type === "daily" && typeof schedule.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) && Array.isArray(schedule.weekdays) && schedule.weekdays.length <= 7 && schedule.weekdays.every(value => Number.isInteger(value) && value >= 0 && value <= 6)) return { type: "daily", time: schedule.time, weekdays: [...new Set(schedule.weekdays as number[])].sort() };
	throw new Error("Choose an interval of 1–10080 minutes or a valid local time and weekdays.");
}
export function nextMissionRun(schedule: MissionSchedule, after: number): string {
	if (schedule.type === "interval") return new Date(after + schedule.minutes * 60000).toISOString();
	const [hour, minute] = schedule.time.split(":").map(Number);
	for (let day = 0; day <= 7; day++) {
		const candidate = new Date(after); candidate.setDate(candidate.getDate() + day); candidate.setHours(hour, minute, 0, 0);
		if (candidate.getTime() > after && (!schedule.weekdays.length || schedule.weekdays.includes(candidate.getDay()))) return candidate.toISOString();
	}
	throw new Error("No next mission run is available.");
}
export function missionScheduleLabel(schedule: MissionSchedule) { return schedule.type === "interval" ? `Every ${schedule.minutes} minute${schedule.minutes === 1 ? "" : "s"}` : `${schedule.time} · ${schedule.weekdays.length ? schedule.weekdays.map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") : "Daily"}`; }
