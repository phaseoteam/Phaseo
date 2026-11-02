import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_SETTINGS, formatWorkSettings, parseWorkSettingsInput } from "./settings";
import { slaDueAt, slaStatus } from "./sla";

const FROM = "2026-11-02T12:00:00.000Z";

describe("slaDueAt", () => {
	it("uses the default hours per priority", () => {
		expect(slaDueAt(null, 1, FROM)).toBe("2026-11-02T16:00:00.000Z");
		expect(slaDueAt(undefined, 4, FROM)).toBe("2026-11-09T12:00:00.000Z");
	});

	it("uses the workspace's hours in either shape", () => {
		expect(slaDueAt({ slaHours: { "1": 1, "2": 2, "3": 3, "4": 4 } }, 2, FROM)).toBe("2026-11-02T14:00:00.000Z");
		expect(slaDueAt({ sla_hours: { "3": 10 } }, 3, FROM)).toBe("2026-11-02T22:00:00.000Z");
	});

	it("has no SLA for priority 0 or invalid input", () => {
		expect(slaDueAt(null, 0, FROM)).toBeNull();
		expect(slaDueAt(null, 5, FROM)).toBeNull();
		expect(slaDueAt(null, 1, "not a date")).toBeNull();
	});
});

describe("slaStatus", () => {
	const created = "2026-11-02T00:00:00.000Z";
	const due = "2026-11-02T10:00:00.000Z";

	it("is breached when open past the due time or closed after it", () => {
		expect(slaStatus({ sla_due_at: due, closed_at: null, created_at: created }, "2026-11-02T11:00:00.000Z")).toEqual({ breached: true, atRisk: false });
		expect(slaStatus({ sla_due_at: due, closed_at: "2026-11-02T10:30:00.000Z", created_at: created }, "2026-11-03T00:00:00.000Z")).toEqual({ breached: true, atRisk: false });
	});

	it("is not breached when closed in time, even after the due time has passed", () => {
		expect(slaStatus({ sla_due_at: due, closed_at: "2026-11-02T09:00:00.000Z", created_at: created }, "2026-11-05T00:00:00.000Z")).toEqual({ breached: false, atRisk: false });
	});

	it("is at risk with under 25% of the window left", () => {
		expect(slaStatus({ sla_due_at: due, closed_at: null, created_at: created }, "2026-11-02T08:00:00.000Z")).toEqual({ breached: false, atRisk: true });
		expect(slaStatus({ sla_due_at: due, closed_at: null, created_at: created }, "2026-11-02T07:00:00.000Z")).toEqual({ breached: false, atRisk: false });
	});

	it("is neither without an SLA", () => {
		expect(slaStatus({ sla_due_at: null, closed_at: null, created_at: created })).toEqual({ breached: false, atRisk: false });
	});
});

describe("work settings", () => {
	it("defaults a missing row", () => {
		expect(formatWorkSettings(null)).toEqual(DEFAULT_WORK_SETTINGS);
	});

	it("validates SLA hours and stall days", () => {
		expect(parseWorkSettingsInput({ slaHours: { "1": 2, "4": 2160 }, stallDays: 14, ambientEnabled: true })).toEqual({
			ok: true, value: { slaHours: { "1": 2, "4": 2160 }, stallDays: 14, ambientEnabled: true },
		});
		expect(parseWorkSettingsInput({ slaHours: { "1": 0 } }).ok).toBe(false);
		expect(parseWorkSettingsInput({ slaHours: { "1": 2161 } }).ok).toBe(false);
		expect(parseWorkSettingsInput({ slaHours: { "5": 10 } }).ok).toBe(false);
		expect(parseWorkSettingsInput({ stallDays: 0 }).ok).toBe(false);
		expect(parseWorkSettingsInput({ stallDays: 91 }).ok).toBe(false);
		expect(parseWorkSettingsInput({ stallDays: 1.5 }).ok).toBe(false);
		expect(parseWorkSettingsInput({ supportDraftsEnabled: "yes" }).ok).toBe(false);
	});
});
