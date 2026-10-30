import { getLocalizedDocsHref } from "./docs";

describe("getLocalizedDocsHref", () => {
	it.each([
		["en-GB", "https://phaseo.app/docs/v1/quickstart"],
		["en-US", "https://phaseo.app/docs/v1/quickstart"],
		["es-ES", "https://phaseo.app/docs/es/v1/quickstart"],
		["fr-FR", "https://phaseo.app/docs/fr/v1/quickstart"],
		["de-DE", "https://phaseo.app/docs/de/v1/quickstart"],
		["pt-BR", "https://phaseo.app/docs/pt-BR/v1/quickstart"],
		["hi", "https://phaseo.app/docs/hi/v1/quickstart"],
		["ja", "https://phaseo.app/docs/ja/v1/quickstart"],
		["zh-Hans", "https://phaseo.app/docs/zh-Hans/v1/quickstart"],
		["ar-SA", "https://phaseo.app/docs/ar/v1/quickstart"],
	] as const)("builds the %s docs URL", (locale, expected) => {
		expect(getLocalizedDocsHref(locale, "/v1/quickstart")).toBe(expected);
	});

	it("keeps query strings and fragments in the localized path", () => {
		expect(
			getLocalizedDocsHref("es-ES", "/v1/guides/routing-and-fallbacks?source=settings#byok"),
		).toBe(
			"https://phaseo.app/docs/es/v1/guides/routing-and-fallbacks?source=settings#byok",
		);
	});

	it("localizes existing Phaseo docs URLs", () => {
		expect(
			getLocalizedDocsHref(
				"es-ES",
				"https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
			),
		).toBe("https://phaseo.app/docs/es/v1/guides/routing-and-fallbacks");
	});
});
