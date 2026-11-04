import { describe, expect, it } from "vitest";
import { defaultPreferences, validatePreferences } from "./preferences";
import { defaultSnoozePresets, defaultThreadPreferences, validateSnoozePreset, validateThreadPreferences } from "./threadPreferences";

describe("threads preferences", () => {
	it("gives older saved preferences today's behaviour", () => {
		expect(validateThreadPreferences(undefined)).toEqual(defaultThreadPreferences);
		expect(validateThreadPreferences({})).toEqual(defaultThreadPreferences);
		expect(defaultThreadPreferences).toMatchObject({ autoResumeLimited: false, snoozeLimited: false, continueAfterRestart: true, idleCompaction: "onReturn", responseStreaming: "live", providerHealthMinutes: 10, providerUpdateChecks: true, recordingsAfterDays: null, logsAfterDays: null });
		expect(defaultThreadPreferences.snoozePresets).toEqual(defaultSnoozePresets);
		const { threads, ...older } = defaultPreferences;
		expect(validatePreferences(older).threads).toEqual(threads);
	});

	it("keeps valid values and fills in the rest", () => {
		const value = validateThreadPreferences({ autoResumeLimited: true, idleCompaction: "beforeCacheExpires", responseStreaming: "paragraph", providerHealthMinutes: null, recordingsAfterDays: 30, snoozePresets: [{ kind: "after", minutes: 30 }, { kind: "at", day: "friday", time: "17:30" }] });
		expect(value).toEqual({ ...defaultThreadPreferences, autoResumeLimited: true, idleCompaction: "beforeCacheExpires", responseStreaming: "paragraph", providerHealthMinutes: null, recordingsAfterDays: 30, snoozePresets: [{ kind: "after", minutes: 30 }, { kind: "at", day: "friday", time: "17:30" }] });
	});

	it("rejects values that are present but invalid, with a readable reason", () => {
		expect(() => validateThreadPreferences([])).toThrow("Invalid threads preferences.");
		expect(() => validateThreadPreferences({ autoResumeLimited: "yes" })).toThrow("Invalid threads setting.");
		expect(() => validateThreadPreferences({ idleCompaction: "always" })).toThrow("Choose when to compact idle chats.");
		expect(() => validateThreadPreferences({ responseStreaming: "word" })).toThrow("Choose how responses stream.");
		expect(() => validateThreadPreferences({ providerHealthMinutes: 0 })).toThrow("Agent checks");
		expect(() => validateThreadPreferences({ logsAfterDays: 0 })).toThrow("Keep logs for 1 to 3650 days, or forever.");
		expect(() => validateThreadPreferences({ recordingsAfterDays: 1.5 })).toThrow("Keep browser recordings");
		expect(() => validateThreadPreferences({ snoozePresets: Array.from({ length: 9 }, () => ({ kind: "after", minutes: 60 })) })).toThrow("Keep up to 8 snooze options.");
		expect(() => validatePreferences({ ...defaultPreferences, threads: { continueAfterRestart: 1 } })).toThrow("Invalid threads setting.");
	});

	it("parses snooze options: a duration of 1 minute to 30 days, or a day and a 24-hour time", () => {
		expect(validateSnoozePreset({ kind: "after", minutes: 90, extra: true })).toEqual({ kind: "after", minutes: 90 });
		expect(validateSnoozePreset({ kind: "at", day: "today", time: "23:59" })).toEqual({ kind: "at", day: "today", time: "23:59" });
		for (const invalid of [{ kind: "after", minutes: 0 }, { kind: "after", minutes: 30 * 24 * 60 + 1 }, { kind: "after", minutes: 1.5 }, { kind: "at", day: "someday", time: "09:00" }, { kind: "at", day: "monday", time: "24:00" }, { kind: "at", day: "monday", time: "9:00" }, null, "after:60"])
			expect(() => validateSnoozePreset(invalid)).toThrow("Each snooze option");
	});
});
