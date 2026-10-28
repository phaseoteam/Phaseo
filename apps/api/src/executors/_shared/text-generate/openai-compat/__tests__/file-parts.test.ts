// IR file parts on OpenAI-compatible upstreams (Chat `file`, Responses `input_file`).
import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import { irToOpenAIChat } from "../transform-chat";
import { irToOpenAIResponses } from "../transform";

const dataFile: IRContentPart = { type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "report.pdf" };
const idFile: IRContentPart = { type: "file", source: "id", data: "file-abc123" };
const urlFile: IRContentPart = { type: "file", source: "url", data: "https://example.com/doc.pdf", filename: "doc.pdf" };

function requestWith(parts: IRContentPart[]): IRChatRequest {
	return {
		model: "gpt-5.4",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Summarise" }, ...parts] }],
	};
}

describe("irToOpenAIChat file parts", () => {
	it("sends base64 files as file_data data URLs and uploaded files as file_id", () => {
		const request = irToOpenAIChat(requestWith([dataFile, idFile]), "gpt-5.4", "openai");
		expect(request.messages[0].content).toEqual([
			{ type: "text", text: "Summarise" },
			{ type: "file", file: { filename: "report.pdf", file_data: "data:application/pdf;base64,JVBERi0x" } },
			{ type: "file", file: { file_id: "file-abc123" } },
		]);
	});

	it("fails the attempt for a file given only by URL instead of dropping it", () => {
		// Chat Completions has no file-by-URL field; answering without the document would be wrong.
		expect(() => irToOpenAIChat(requestWith([urlFile]), "gpt-5.4", "openai"))
			.toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "file" }));
	});
});

describe("irToOpenAIResponses file parts", () => {
	it("sends every file form as input_file", () => {
		const request = irToOpenAIResponses(requestWith([dataFile, urlFile, idFile]), "gpt-5.4", "openai");
		const user = request.input.find((item: any) => item.role === "user");
		expect(user.content.slice(1)).toEqual([
			{ type: "input_file", filename: "report.pdf", file_data: "data:application/pdf;base64,JVBERi0x" },
			{ type: "input_file", filename: "doc.pdf", file_url: "https://example.com/doc.pdf" },
			{ type: "input_file", file_id: "file-abc123" },
		]);
	});
});
