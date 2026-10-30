import { loadDocumentationPages } from "./Search.documentation";
import { getLocalizedDocsHref } from "@/lib/docs";
import type { PublicLocale } from "@/i18n/routing";

describe("localized documentation search", () => {
	it.each<PublicLocale>(["es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"])(
		"loads translated metadata and keeps stable page identities for %s",
		async (locale) => {
			const english = await loadDocumentationPages("en-GB");
			const translated = await loadDocumentationPages(locale);
			const id = "docs-v1/guides/private-models";
			const source = english.find((item) => item.id === id)!;
			const page = translated.find((item) => item.id === id)!;
			expect(page).toBeDefined();
			expect(page.title).not.toBe(source.title);
			expect(page.subtitle).not.toBe(source.subtitle);
			expect(page.href).toBe(source.href);
			expect(getLocalizedDocsHref(locale, page.href!)).not.toBe(source.href);
		},
	);
	it("uses the English documentation catalog for US English", async () => {
		expect(await loadDocumentationPages("en-US")).toEqual(await loadDocumentationPages("en-GB"));
	});
});
