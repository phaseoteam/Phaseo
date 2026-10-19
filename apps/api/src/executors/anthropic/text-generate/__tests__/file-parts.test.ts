// IR file parts (Chat `file`, Responses `input_file`) as Anthropic document blocks.
import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import { irToAnthropicMessages } from "../index";

function requestWith(parts: IRContentPart[]): IRChatRequest {
	return {
		model: "claude-sonnet-5",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Summarise" }, ...parts] }],
	};
}

describe("irToAnthropicMessages file parts", () => {
	it("maps base64 PDFs, URLs and file ids to document blocks", () => {
		const payload = irToAnthropicMessages(requestWith([
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "report.pdf" },
			{ type: "file", source: "url", data: "https://example.com/doc.pdf" },
			{ type: "file", source: "id", data: "file_011abc" },
		]));
		expect(payload.messages[0].content).toEqual([
			{ type: "text", text: "Summarise" },
			{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0x" }, title: "report.pdf" },
			{ type: "document", source: { type: "url", url: "https://example.com/doc.pdf" } },
			{ type: "document", source: { type: "file", file_id: "file_011abc" } },
		]);
	});

	it("sends a base64 text file as a plain-text document", () => {
		const payload = irToAnthropicMessages(requestWith([
			{ type: "file", source: "data", data: Buffer.from("Hello, world").toString("base64"), mimeType: "text/plain", filename: "notes.txt" },
		]));
		expect(payload.messages[0].content[1]).toEqual({
			type: "document",
			source: { type: "text", media_type: "text/plain", data: "Hello, world" },
			title: "notes.txt",
		});
	});

	it("keeps a file part's cache mark on the document block", () => {
		const payload = irToAnthropicMessages(requestWith([
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", cacheControl: { type: "ephemeral" } },
		]));
		expect(payload.messages[0].content[1]).toMatchObject({ type: "document", cache_control: { type: "ephemeral" } });
	});
});
