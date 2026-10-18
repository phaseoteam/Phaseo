import { describe, expect, it } from "vitest";
import {
	geminiGroundingToAnnotations,
	toAnthropicCitations,
	toChatAnnotations,
	toIRAnnotations,
	toResponsesAnnotations,
} from "./citations";

const chatCitation = { type: "url_citation", url_citation: { url: "https://example.com/a", title: "A", start_index: 0, end_index: 5 } };
const responsesCitation = { type: "url_citation", url: "https://example.com/a", title: "A", start_index: 0, end_index: 5 };
const claudeWebCitation = {
	type: "web_search_result_location",
	url: "https://example.com/b",
	title: "B",
	cited_text: "source quote",
	encrypted_index: "enc",
};
const claudeDocumentCitation = { type: "char_location", cited_text: "quote", document_index: 0, start_char_index: 0, end_char_index: 5 };

describe("citation shapes", () => {
	it("reads Chat, Responses and Claude citations into one IR form", () => {
		expect(toIRAnnotations([chatCitation, responsesCitation, claudeWebCitation, claudeDocumentCitation, { type: "unknown" }, null]))
			.toEqual([responsesCitation, responsesCitation, claudeWebCitation, claudeDocumentCitation]);
	});

	it("emits Chat annotations with the fields under url_citation", () => {
		expect(toChatAnnotations([responsesCitation, claudeWebCitation, claudeDocumentCitation])).toEqual([
			chatCitation,
			{ type: "url_citation", url_citation: { url: "https://example.com/b", title: "B" } },
		]);
	});

	it("emits flat Responses annotations and keeps file citations", () => {
		const fileCitation = { type: "file_citation", file_id: "file_1", index: 3 };
		expect(toResponsesAnnotations([chatCitation, claudeWebCitation, fileCitation])).toEqual([
			responsesCitation,
			{ type: "url_citation", url: "https://example.com/b", title: "B" },
			fileCitation,
		]);
	});

	it("passes Claude citations through to Messages and maps URL citations to web results", () => {
		expect(toAnthropicCitations([claudeWebCitation, claudeDocumentCitation, chatCitation], "Hello world")).toEqual([
			claudeWebCitation,
			claudeDocumentCitation,
			{ type: "web_search_result_location", url: "https://example.com/a", title: "A", cited_text: "Hello" },
		]);
	});

	it("turns Gemini grounding metadata into URL citations with the supported span", () => {
		const annotations = geminiGroundingToAnnotations({
			groundingMetadata: {
				groundingChunks: [
					{ web: { uri: "https://example.com/g1", title: "G1" } },
					{ web: { uri: "https://example.com/g2", title: "G2" } },
				],
				groundingSupports: [{ segment: { startIndex: 0, endIndex: 12 }, groundingChunkIndices: [1] }],
			},
			citationMetadata: { citations: [{ uri: "https://example.com/g2" }, { uri: "https://example.com/c3", startIndex: 2, endIndex: 4 }] },
		});
		expect(annotations).toEqual([
			{ type: "url_citation", url: "https://example.com/g2", title: "G2", start_index: 0, end_index: 12 },
			{ type: "url_citation", url: "https://example.com/g1", title: "G1" },
			{ type: "url_citation", url: "https://example.com/c3", start_index: 2, end_index: 4 },
		]);
	});
});
