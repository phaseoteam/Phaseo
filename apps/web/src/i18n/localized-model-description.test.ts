import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { resolveLocalizedModelDescription } from "./localized-model-description";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
describe("generated model descriptions", () => {
	it.each(locales)("translates generated status, modalities and creator fallback in %s", (locale) => {
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, file + ".json"), "utf8"))]));
		const t = createTranslator({ locale, messages });
		for (const status of ["Rumoured", "Announced", "Preview", "Limited Access", "Withheld", "Deprecated", "Retired", "Available"]) {
			for (const [input_types, output_types] of [["text,image", "audio_music"], ["audio_stt", null], [null, "text"]]) {
				const description = resolveLocalizedModelDescription({ model_id: "acme/model", name: "Acme Model", status, input_types, output_types }, locale, t as never);
				expect(description).toContain("Acme Model");
				expect(description).not.toContain("Common.ui.");
				expect(description).not.toContain("Catalogue.");
				if (locale !== "en-GB") expect(description).not.toMatch(/\b(?:is an|It accepts|It is designed|the model creator)\b/);
			}
		}
		expect(resolveLocalizedModelDescription({ model_id: "acme/model", description: "An authored English description." }, locale, t as never)).toBe("An authored English description.");
	});
});
