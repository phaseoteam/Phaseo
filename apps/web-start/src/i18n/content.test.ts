import englishContent from "../../messages/en-GB/content.json";
import germanContent from "../../messages/de-DE/content.json";

function leafPaths(value: unknown, prefix = ""): string[] {
	if (typeof value === "string") return [prefix];
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) =>
		leafPaths(child, prefix ? `${prefix}.${key}` : key),
	);
}

describe("public content catalogues", () => {
	it("keeps German content structurally aligned with the English source", () => {
		expect(leafPaths(germanContent).sort()).toEqual(leafPaths(englishContent).sort());
	});

	it("does not silently present the German editorial fallback as translated", () => {
		expect(germanContent.blog.englishBodyNotice).toMatch(/Originalartikel/);
		expect(germanContent.migrate.englishBodyNotice).toMatch(/Originalleitfaden/);
	});
});
