import englishCatalogue from "../../messages/en-GB/catalogue.json";
import germanCatalogue from "../../messages/de-DE/catalogue.json";

function flatten(value: unknown, prefix = "", result: Record<string, string> = {}) {
	if (typeof value === "string") {
		result[prefix] = value;
		return result;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError(`Expected a message object at ${prefix}`);
	}
	for (const [key, child] of Object.entries(value)) {
		flatten(child, prefix ? `${prefix}.${key}` : key, result);
	}
	return result;
}

describe("catalogue localisation", () => {
	it("keeps the German catalogue structurally in parity with English", () => {
		const source = flatten(englishCatalogue);
		const german = flatten(germanCatalogue);
		expect(Object.keys(german).sort()).toEqual(Object.keys(source).sort());
		for (const [key, value] of Object.entries(german)) {
			expect(value.trim()).not.toBe("");
			expect(value).not.toContain("undefined");
			if (source[key].includes("{")) {
				expect(value).toMatch(/\{[^}]+\}/);
			}
		}
	});
});
