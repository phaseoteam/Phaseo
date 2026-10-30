import { ocrText, rankedDocuments, rerankDocuments } from "./documentTools";

describe("document tools", () => {
	it("reads normalized OCR text and falls back to ordered page text", () => {
		expect(ocrText({ text: "Extracted", pages: [{ markdown: "Duplicate" }] })).toBe("Extracted");
		expect(ocrText({ text: "", pages: [{ markdown: "Page 1" }, null, { text: "Page 2" }] })).toBe("Page 1\n\nPage 2");
		expect(ocrText(null)).toBe("");
		expect(ocrText({ pages: [{ markdown: "", text: "Text fallback" }, { markdown: "  ", text: "Second page" }] })).toBe("Text fallback\n\nSecond page");
	});
	it("maps ranked indices back to the submitted documents, preserving provider order", () => {
		const documents = rerankDocuments(" First \r\n\nSecond\n Third ");
		expect(rankedDocuments({ results: [{ index: 2, relevance_score: 0.9 }, { index: 0, relevance_score: 0.3 }, { index: 8 }, null] }, documents)).toEqual([
			{ index: 2, text: "Third", score: 0.9 }, { index: 0, text: "First", score: 0.3 },
		]);
		expect(rankedDocuments({ results: [{ index: 1, relevance_score: NaN }] }, documents)[0].score).toBeNull();
	});
});
