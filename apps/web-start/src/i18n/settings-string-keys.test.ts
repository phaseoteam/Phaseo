import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { localizedSettingsError } from "./error-messages";
import { settingsStringKey } from "./settings-string-keys";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;

describe("stable settings phrase IDs", () => {
	it("maps canonical phrases and preserves existing stable IDs", () => {
		expect(settingsStringKey("Please try again.")).toBe("strings.phrasePleaseTryAgain");
		expect(settingsStringKey("Invalid code. Please try again.")).toBe("strings.phraseInvalidCodePleaseTryAgain");
		expect(settingsStringKey("Action failed")).toBe("strings.Action failed");
		expect(settingsStringKey("phrasePleaseTryAgain")).toBe("strings.phrasePleaseTryAgain");
		expect(settingsStringKey("constructor")).toBe("strings.constructor");
	});

	it.each(locales)("resolves canonical backend errors without fallback paths in %s", (locale) => {
		const messages = JSON.parse(fs.readFileSync(path.join(__dirname, "../../messages", locale, "settings-ui.json"), "utf8"));
		const t = createTranslator({ locale, messages, onError: (error) => { throw error; } });
		for (const key of Object.keys(messages.strings)) expect(key).not.toContain(".");
		for (const phrase of ["Please try again.", "Invalid code. Please try again.", "Failed to save guardrail.", "Workspace ID cannot be empty.", "Enter a valid two-letter country code.", "Display name must be 60 characters or fewer.", "Name is required.", "Limits must be zero or a positive number.", "No webhook attempts recorded yet.", "Create a preset to reuse model, provider, and prompt configuration."]) {
			const key = settingsStringKey(phrase);
			const expected = messages.strings[key.slice("strings.".length)];
			expect(expected).toEqual(expect.any(String));
			expect(t.has(key)).toBe(true);
			expect(localizedSettingsError(new Error(phrase), t as never, "Action failed")).toBe(expected);
			expect(localizedSettingsError({ message: phrase }, t as never, "Action failed")).toBe(expected);
			expect(localizedSettingsError("unknown upstream message", t as never, phrase)).toBe(expected);
			if (locale !== "en-GB") expect(expected).not.toBe(phrase);
		}
		expect(localizedSettingsError("unknown upstream message", t as never, "Action failed", "localized custom fallback")).toBe("localized custom fallback");
	});
});
