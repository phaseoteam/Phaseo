import { describe, expect, it } from "vitest";
import { decodeOpenAIResponsesRequest } from "../decode";

function decode(input: any[]) {
	return decodeOpenAIResponsesRequest({ model: "openai/gpt-5.5", input } as any);
}

function userContent(input: any[]) {
	return decode(input).messages[0]?.content;
}

describe("Responses media input decoding", () => {
	it("keeps input_image detail, which sits on the part next to a string image_url", () => {
		expect(userContent([{
			role: "user",
			content: [
				{ type: "input_image", image_url: "https://example.com/cat.png", detail: "low" },
				{ type: "input_image", image_url: "data:image/png;base64,aGVsbG8=", detail: "original" },
			],
		}])).toEqual([
			expect.objectContaining({ type: "image", source: "url", data: "https://example.com/cat.png", detail: "low" }),
			expect.objectContaining({ type: "image", source: "data", data: "aGVsbG8=", mimeType: "image/png", detail: "original" }),
		]);
	});

	it("decodes an input_image sent by file_id as an image file reference, not text", () => {
		const content = userContent([{
			role: "user",
			content: [{ type: "input_image", file_id: "file-img123", detail: "high" }],
		}]);
		expect(content).toEqual([expect.objectContaining({ type: "image", source: "id", data: "file-img123", detail: "high" })]);
		expect(JSON.stringify(content)).not.toContain("[object Object]");
	});

	it("keeps top-level input_image and input_file items", () => {
		expect(decode([
			{ type: "input_image", file_id: "file-img123" },
			{ type: "input_file", file_id: "file-doc456", filename: "report.pdf" },
		]).messages[0]?.content).toEqual([
			expect.objectContaining({ type: "image", source: "id", data: "file-img123" }),
			expect.objectContaining({ type: "file", source: "id", data: "file-doc456", filename: "report.pdf" }),
		]);
	});

	it("decodes Gemini-shaped parts into IR media instead of [object Object] text", () => {
		const content = userContent([{
			role: "user",
			content: [
				{ text: "What is in these?" },
				{ inlineData: { mimeType: "image/png", data: "aW1n" } },
				{ inline_data: { mime_type: "audio/mpeg", data: "YXVk" } },
				{ inlineData: { mimeType: "application/pdf", data: "JVBERi0x" } },
				{ fileData: { mimeType: "video/mp4", fileUri: "https://www.youtube.com/watch?v=abc" } },
				{ file_data: { mime_type: "application/pdf", file_uri: "files/doc123" } },
				{ fileData: { mimeType: "image/jpeg", fileUri: "https://example.com/photo.jpg" } },
			],
		}]);
		expect(content).toEqual([
			{ type: "text", text: "What is in these?" },
			{ type: "image", source: "data", data: "aW1n", mimeType: "image/png" },
			{ type: "audio", source: "data", data: "YXVk", format: "mp3" },
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf" },
			{ type: "video", source: "url", url: "https://www.youtube.com/watch?v=abc" },
			{ type: "file", source: "id", data: "files/doc123", mimeType: "application/pdf" },
			{ type: "image", source: "url", data: "https://example.com/photo.jpg", mimeType: "image/jpeg" },
		]);
		expect(JSON.stringify(content)).not.toContain("[object Object]");
	});

	it("keeps Gemini Files API audio and video as provider-owned file references", () => {
		expect(userContent([{
			role: "user",
			content: [
				{ fileData: { mimeType: "audio/mpeg", fileUri: "files/abc" } },
				{ file_data: { mime_type: "audio/wav", file_uri: "https://generativelanguage.googleapis.com/v1beta/files/def" } },
				{ fileData: { mimeType: "video/mp4", fileUri: "files/ghi" } },
				{ fileData: { mimeType: "audio/mpeg", fileUri: "https://cdn.example/clip.mp3" } },
			],
		}])).toEqual([
			{ type: "file", source: "id", data: "files/abc", mimeType: "audio/mpeg" },
			{ type: "file", source: "id", data: "https://generativelanguage.googleapis.com/v1beta/files/def", mimeType: "audio/wav" },
			{ type: "file", source: "id", data: "files/ghi", mimeType: "video/mp4" },
			{ type: "audio", source: "url", data: "https://cdn.example/clip.mp3", format: "mp3" },
		]);
	});

	it("treats top-level Gemini parts as user content", () => {
		expect(decode([{ inlineData: { mimeType: "image/webp", data: "d2Vi" } }]).messages[0]).toEqual({
			role: "user",
			content: [{ type: "image", source: "data", data: "d2Vi", mimeType: "image/webp" }],
		});
	});
});
