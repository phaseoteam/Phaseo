import { describe, expect, it } from "vitest";
import { irPartsToGeminiParts } from "./media";

describe("google shared media mapping for file parts", () => {
	it("inlines base64 files and keeps Gemini file URIs", async () => {
		const parts = await irPartsToGeminiParts([
			{ type: "text", text: "Summarise" },
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "report.pdf" },
			{ type: "file", source: "id", data: "files/abc123", mimeType: "application/pdf" },
		]);
		expect(parts).toEqual([
			{ text: "Summarise" },
			{ inline_data: { mime_type: "application/pdf", data: "JVBERi0x" } },
			{ file_data: { mime_type: "application/pdf", file_uri: "files/abc123" } },
		]);
	});

	it("leaves out an OpenAI file id, which is not a Gemini file", async () => {
		const parts = await irPartsToGeminiParts([
			{ type: "text", text: "Summarise" },
			{ type: "file", source: "id", data: "file-abc123" },
		]);
		expect(parts).toEqual([{ text: "Summarise" }]);
	});
});
