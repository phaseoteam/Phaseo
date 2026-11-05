import { defaultTraceExport, validateTraceExport, type TraceExport } from "./traceExport";
/**
 * Workspace preferences for usage limit resumes and snoozes, snooze times, restarts, idle compaction, response streaming, provider checks and storage retention (Settings → Threads, Maintenance and Agents). Saved with the rest in WorkspacePreferences.threads.
 * autoResumeLimited resumes a chat on its own agent and plan when its usage limit resets; snoozeLimited snoozes it until then. continueAfterRestart resumes chats a quit or crash interrupted, instead of offering to.
 * idleCompaction compacts large idle chats: when you come back to one, or just before its prompt cache expires. responseStreaming is how a running answer appears. providerHealthMinutes is how often agent CLIs are re-checked (null never);
 * providerUpdateChecks looks for newer agent CLI versions. recordingsAfterDays and logsAfterDays remove browser recordings and old log files after that many days (null keeps them).
 */
export type SnoozePresetDay = "today" | "tomorrow" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
/** `after` wakes a fixed time from now; `at` wakes at a local time, a weekday being its next occurrence after today. */
export type SnoozePreset = { kind: "after"; minutes: number } | { kind: "at"; day: SnoozePresetDay; time: string };
export type IdleCompactionMode = "off" | "onReturn" | "beforeCacheExpires";
export type ResponseStreamingMode = "live" | "paragraph" | "turn";
export type ThreadPreferences = { autoResumeLimited: boolean; /** Continue a limited chat at once on another signed-in login of its agent that has not hit its limit. */ switchLoginOnLimit: boolean; snoozeLimited: boolean; snoozePresets: SnoozePreset[]; continueAfterRestart: boolean; idleCompaction: IdleCompactionMode; responseStreaming: ResponseStreamingMode; providerHealthMinutes: number | null; providerUpdateChecks: boolean; recordingsAfterDays: number | null; logsAfterDays: number | null; /** Settings → Diagnostics → Export traces (shared/traceExport.ts). */ traceExport: TraceExport };

export const snoozePresetDays: SnoozePresetDay[] = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const snoozePresetLimits = { maximum: 8, maximumMinutes: 30 * 24 * 60 };
/** The menu as it always was: an hour, three hours, this evening, tomorrow morning and next Monday morning. */
export const defaultSnoozePresets: SnoozePreset[] = [{ kind: "after", minutes: 60 }, { kind: "after", minutes: 180 }, { kind: "at", day: "today", time: "18:00" }, { kind: "at", day: "tomorrow", time: "09:00" }, { kind: "at", day: "monday", time: "09:00" }];
export const idleCompactionModes: IdleCompactionMode[] = ["off", "onReturn", "beforeCacheExpires"];
export const responseStreamingModes: ResponseStreamingMode[] = ["live", "paragraph", "turn"];
/** Minutes between agent CLI checks. Ten is how often the app has always checked. */
export const providerHealthOptions = [1, 5, 10, 30, 60];
export const retentionDays = { minimum: 1, maximum: 3650 };
export const defaultThreadPreferences: ThreadPreferences = { autoResumeLimited: false, switchLoginOnLimit: false, snoozeLimited: false, snoozePresets: defaultSnoozePresets, continueAfterRestart: true, idleCompaction: "onReturn", responseStreaming: "live", providerHealthMinutes: 10, providerUpdateChecks: true, recordingsAfterDays: null, logsAfterDays: null, traceExport: defaultTraceExport };

/** "after:60" or "at:monday:09:00": two presets with the same id are the same menu choice. */
export const snoozePresetId = (preset: SnoozePreset) => preset.kind === "after" ? `after:${preset.minutes}` : `at:${preset.day}:${preset.time}`;

/** One saved snooze preset, or a readable error. */
export function validateSnoozePreset(value: unknown): SnoozePreset {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	if (input?.kind === "after" && typeof input.minutes === "number" && Number.isInteger(input.minutes) && input.minutes >= 1 && input.minutes <= snoozePresetLimits.maximumMinutes) return { kind: "after", minutes: input.minutes };
	if (input?.kind === "at" && snoozePresetDays.includes(input.day as SnoozePresetDay) && typeof input.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return { kind: "at", day: input.day as SnoozePresetDay, time: input.time };
	throw new Error("Each snooze option needs a duration of 1 minute to 30 days, or a day and a time such as 09:00.");
}

/** Preferences saved before a field existed omit it, so missing fields take their defaults; a present but invalid value throws. */
export function validateThreadPreferences(value: unknown): ThreadPreferences {
	if (value === undefined) return { ...defaultThreadPreferences };
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid threads preferences.");
	const input = value as Record<string, unknown>;
	const read = <T,>(key: keyof ThreadPreferences, valid: (entry: unknown) => boolean, message: string) => { if (input[key] === undefined) return defaultThreadPreferences[key] as T; if (!valid(input[key])) throw new Error(message); return input[key] as T; };
	const flag = (key: keyof ThreadPreferences) => read<boolean>(key, entry => typeof entry === "boolean", "Invalid threads setting.");
	const days = (entry: unknown) => entry === null || (typeof entry === "number" && Number.isInteger(entry) && entry >= retentionDays.minimum && entry <= retentionDays.maximum);
	const presets = input.snoozePresets === undefined ? defaultSnoozePresets : input.snoozePresets;
	if (!Array.isArray(presets) || presets.length > snoozePresetLimits.maximum) throw new Error(`Keep up to ${snoozePresetLimits.maximum} snooze options.`);
	return {
		autoResumeLimited: flag("autoResumeLimited"), switchLoginOnLimit: flag("switchLoginOnLimit"), snoozeLimited: flag("snoozeLimited"), snoozePresets: presets.map(validateSnoozePreset), continueAfterRestart: flag("continueAfterRestart"),
		idleCompaction: read("idleCompaction", entry => idleCompactionModes.includes(entry as IdleCompactionMode), "Choose when to compact idle chats."),
		responseStreaming: read("responseStreaming", entry => responseStreamingModes.includes(entry as ResponseStreamingMode), "Choose how responses stream."),
		providerHealthMinutes: read("providerHealthMinutes", entry => entry === null || (typeof entry === "number" && Number.isInteger(entry) && entry >= 1 && entry <= 1440), "Agent checks must run every 1 to 1,440 minutes, or never."),
		providerUpdateChecks: flag("providerUpdateChecks"),
		recordingsAfterDays: read("recordingsAfterDays", days, `Keep browser recordings for ${retentionDays.minimum} to ${retentionDays.maximum} days, or forever.`),
		logsAfterDays: read("logsAfterDays", days, `Keep logs for ${retentionDays.minimum} to ${retentionDays.maximum} days, or forever.`),
		traceExport: validateTraceExport(input.traceExport),
	};
}
