import { getCatalogMessages, getCatalogOverlay } from "./catalogs";
import { translationLocales, variantLocales } from "./routing";
import { assertValidCatalogs, flattenCatalog } from "./validation";

describe("localisation catalogs", () => {
	it("keeps keys and ICU arguments valid across every locale", () => {
		expect(() => assertValidCatalogs()).not.toThrow();
	});

	it("generates an expanded pseudo-locale without changing placeholders", () => {
		const sourceCatalog = flattenCatalog(getCatalogMessages("en-GB"));
		const pseudoCatalog = flattenCatalog(getCatalogMessages("en-XA"));
		const key = "Auth.forgotPassword.successDescription";

		expect(pseudoCatalog[key]).toContain("{email}");
		expect(pseudoCatalog[key]).not.toBe(sourceCatalog[key]);
		expect(pseudoCatalog[key]).toMatch(/^⟦.*~~~⟧$/);
	});

	it.each(translationLocales)(
		"loads a distinct, complete %s translation catalog",
		(locale) => {
			const sourceCatalog = flattenCatalog(getCatalogMessages("en-GB"));
			const translatedCatalog = flattenCatalog(getCatalogMessages(locale));

			expect(Object.keys(translatedCatalog).sort()).toEqual(
				Object.keys(sourceCatalog).sort(),
			);
			expect(
				Object.keys(sourceCatalog).some(
					(key) => translatedCatalog[key] !== sourceCatalog[key],
				),
			).toBe(true);
		},
	);

	it.each(variantLocales)(
		"resolves sparse %s overrides into a complete catalog",
		(locale) => {
			const sourceCatalog = flattenCatalog(getCatalogMessages("en-GB"));
			const overlay = flattenCatalog(getCatalogOverlay(locale));
			const resolvedCatalog = flattenCatalog(getCatalogMessages(locale));

			expect(Object.keys(overlay).length).toBeGreaterThan(0);
			expect(Object.keys(overlay).length).toBeLessThan(
				Object.keys(sourceCatalog).length,
			);
			expect(Object.keys(resolvedCatalog).sort()).toEqual(
				Object.keys(sourceCatalog).sort(),
			);
			for (const [key, value] of Object.entries(overlay)) {
				expect(value).not.toBe(sourceCatalog[key]);
				expect(resolvedCatalog[key]).toBe(value);
			}
		},
	);
});
