import { describe, expect, it } from "vitest";

import {
	DEFAULT_DISPLAY_PREFERENCES,
	displayPreferencesFromRow,
	displayPreferencesToRow,
	parseDisplayPreferences,
} from "./displayPreferences";

describe("display preferences contract", () => {
	it("uses defaults for missing or invalid stored values", () => {
		expect(displayPreferencesFromRow({
			display_locale: "invalid",
			display_time_zone: "Mars/Olympus_Mons",
		})).toEqual(DEFAULT_DISPLAY_PREFERENCES);
	});

	it("accepts a complete valid preference set", () => {
		const preferences = {
			locale: "en-GB" as const,
			dateStyle: "iso" as const,
			timeZone: "Europe/London",
			hourCycle: "24h" as const,
			relativeTime: "absolute" as const,
			numberNotation: "compact" as const,
			lightPalette: "warm" as const,
			darkPalette: "midnight" as const,
			lightAccent: "#7c3aed",
			darkAccent: "#a78bfa",
			density: "compact" as const,
			codeLanguage: "python" as const,
			landingPage: "models" as const,
			maskSensitiveData: true,
		};
		expect(parseDisplayPreferences(preferences)).toEqual(preferences);
		expect(displayPreferencesToRow(preferences)).toEqual({
			display_locale: "en-GB",
			display_date_style: "iso",
			display_time_zone: "Europe/London",
			display_hour_cycle: "24h",
			display_relative_time: "absolute",
			display_number_notation: "compact",
			display_light_palette: "warm",
			display_dark_palette: "midnight",
			display_light_accent: "#7c3aed",
			display_dark_accent: "#a78bfa",
			display_density: "compact",
			display_code_language: "python",
			display_landing_page: "models",
			obfuscate_info: true,
		});
	});

	it("rejects incomplete and invalid update payloads", () => {
		expect(parseDisplayPreferences({ locale: "en-GB" })).toBeNull();
		expect(parseDisplayPreferences({
			...DEFAULT_DISPLAY_PREFERENCES,
			timeZone: "not a time zone",
		})).toBeNull();
		expect(parseDisplayPreferences({
			...DEFAULT_DISPLAY_PREFERENCES,
			lightAccent: "blue",
		})).toBeNull();
	});
});
