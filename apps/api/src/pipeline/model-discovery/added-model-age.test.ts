import { describe, expect, it } from "vitest";
import {
	addedModelMaxAgeMs,
	DEFAULT_ADDED_MODEL_MAX_AGE_DAYS,
	providerModelCreatedAtMs,
	splitAddedModelsByAge,
} from "./helpers";

describe("added model age cap", () => {
	const nowMs = Date.UTC(2026, 10, 13);
	const day = 24 * 60 * 60_000;

	it("reads Unix seconds, milliseconds and ISO dates from the provider row", () => {
		// Inception's /models entry for mercury-2, which re-listed on 2026-11-12.
		expect(providerModelCreatedAtMs({ id: "mercury-2", created: 1743465660 }, nowMs)).toBe(1743465660_000);
		expect(providerModelCreatedAtMs({ created: 1743465660_000 }, nowMs)).toBe(1743465660_000);
		expect(providerModelCreatedAtMs({ created_at: "2026-11-01T00:00:00Z" }, nowMs)).toBe(Date.UTC(2026, 10, 1));
		expect(providerModelCreatedAtMs({ createdAt: "1743465660" }, nowMs)).toBe(1743465660_000);
	});

	it("treats missing, placeholder and future dates as unknown", () => {
		expect(providerModelCreatedAtMs({ id: "x" }, nowMs)).toBeNull();
		expect(providerModelCreatedAtMs({ created: 0 }, nowMs)).toBeNull();
		expect(providerModelCreatedAtMs({ created: "not a date" }, nowMs)).toBeNull();
		// Date.parse would roll these over to real days (2 March, 1 May) and could make them look old.
		expect(providerModelCreatedAtMs({ created: "2025-02-30T00:00:00Z" }, nowMs)).toBeNull();
		expect(providerModelCreatedAtMs({ created_at: "2025-04-31" }, nowMs)).toBeNull();
		expect(providerModelCreatedAtMs({ created_at: "2024-02-29T12:00:00Z" }, nowMs)).toBe(Date.UTC(2024, 1, 29, 12));
		expect(providerModelCreatedAtMs({ created: (nowMs + 7 * day) / 1000 }, nowMs)).toBeNull();
		expect(providerModelCreatedAtMs(null, nowMs)).toBeNull();
	});

	it("ignores only additions the provider dates outside the window", () => {
		const created: Record<string, number | null> = {
			"mercury-2": Date.UTC(2025, 3, 1),
			"brand-new": nowMs - 2 * day,
			undated: null,
		};
		expect(splitAddedModelsByAge(["mercury-2", "brand-new", "undated"], (id) => created[id] ?? null, { nowMs, maxAgeMs: 30 * day }))
			.toEqual({ reported: ["brand-new", "undated"], ignoredOld: ["mercury-2"] });
		expect(splitAddedModelsByAge(["mercury-2"], (id) => created[id] ?? null, { nowMs, maxAgeMs: 0 }))
			.toEqual({ reported: ["mercury-2"], ignoredOld: [] });
	});

	it("defaults to 30 days and allows 0 to turn it off", () => {
		expect(DEFAULT_ADDED_MODEL_MAX_AGE_DAYS).toBe(30);
		expect(addedModelMaxAgeMs(undefined)).toBe(30 * day);
		expect(addedModelMaxAgeMs("bogus")).toBe(30 * day);
		expect(addedModelMaxAgeMs("7")).toBe(7 * day);
		expect(addedModelMaxAgeMs("0")).toBe(0);
	});
});
