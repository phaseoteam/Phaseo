import englishProductMessages from "../../messages/en-GB/product.json";
import germanProductMessages from "../../messages/de-DE/product.json";
import { flattenCatalog } from "./validation";

describe("interactive product localisation", () => {
	it("keeps the German product catalog in exact key parity with English", () => {
		const source = flattenCatalog(englishProductMessages);
		const german = flattenCatalog(germanProductMessages);
		expect(Object.keys(german).sort()).toEqual(Object.keys(source).sort());
	});

	it("translates the user-facing product copy instead of copying English", () => {
		const source = flattenCatalog(englishProductMessages);
		const german = flattenCatalog(germanProductMessages);
		const translatableKeys = [
			"tools.title",
			"tools.json.format",
			"tools.provenance.checkFile",
			"tools.request.generatedCode",
			"chat.title",
			"experiments.title",
			"games.title",
			"apps.title",
		];
		for (const key of translatableKeys) {
			expect(german[key]).toBeDefined();
			expect(german[key]).not.toBe(source[key]);
		}
	});
});
