import { appleAppStoreLocales } from "./apple-locales";
import {
	catalogLocales,
	defaultLocale,
	getLocaleDefinition,
	isCatalogLocale,
	isPublicLocale,
	previewLocales,
	publicLocales,
	translationLocales,
	variantLocales,
} from "./routing";

describe("localisation registry policy", () => {
	it("publishes the ten reviewed auth locales", () => {
		expect(defaultLocale).toBe("en-GB");
		expect(publicLocales).toEqual([
			"en-GB",
			"en-US",
			"zh-Hans",
			"hi",
			"es-ES",
			"fr-FR",
			"de-DE",
			"pt-BR",
			"ja",
			"ar-SA",
		]);

		for (const locale of publicLocales) {
			expect(isPublicLocale(locale)).toBe(true);
		}
		expect(isPublicLocale("en-XA")).toBe(false);
	});

	it("registers a ten-locale Apple-compatible auth cohort", () => {
		expect(variantLocales).toEqual(["en-US"]);
		expect(translationLocales).toEqual([
			"zh-Hans",
			"hi",
			"es-ES",
			"fr-FR",
			"de-DE",
			"pt-BR",
			"ja",
			"ar-SA",
		]);
		expect(previewLocales).toEqual(["en-XA"]);
		expect(catalogLocales).toHaveLength(11);

		for (const locale of catalogLocales) {
			expect(isCatalogLocale(locale)).toBe(true);
			if (getLocaleDefinition(locale).role !== "pseudo") {
				expect(appleAppStoreLocales).toContain(locale);
			}
		}
	});

	it("records fallback, direction, and review invariants", () => {
		expect(getLocaleDefinition("en-US").fallback).toBe("en-GB");
		expect(getLocaleDefinition("en-US").role).toBe("overlay");
		expect(getLocaleDefinition("ar-SA").dir).toBe("rtl");
		expect(getLocaleDefinition("ar-SA").font).toBe("arabic");

		for (const locale of [...translationLocales, ...variantLocales]) {
			expect(getLocaleDefinition(locale).reviewState).toBe("approved");
		}
	});

	it("tracks Apple's complete fifty-locale metadata matrix", () => {
		expect(appleAppStoreLocales).toHaveLength(50);
		expect(new Set(appleAppStoreLocales).size).toBe(50);
	});
});
