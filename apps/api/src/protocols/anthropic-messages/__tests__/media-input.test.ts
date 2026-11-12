import { describe, expect, it } from "vitest";
import { AnthropicMessagesSchema } from "@core/schemas";
import { decodeAnthropicMessagesRequest } from "../decode";
import { irToAnthropicMessages } from "@executors/anthropic/text-generate";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { irPartsToGeminiParts } from "@executors/google/shared/media";

function decode(content: any[]) {
	const body = AnthropicMessagesSchema.parse({
		model: "anthropic/claude-sonnet-4.6",
		max_tokens: 256,
		messages: [{ role: "user", content }],
	});
	return decodeAnthropicMessagesRequest(body as any);
}

const pdfBlock = {
	type: "document",
	source: { type: "base64", media_type: "application/pdf", data: "JVBERi0xLjQ=" },
	title: "report.pdf",
	citations: { enabled: true },
};

describe("Messages image Files API references", () => {
	it("decodes source.type file to an image file reference and sends it back to Claude unchanged", () => {
		const ir = decode([
			{ type: "image", source: { type: "file", file_id: "file_011CNha8iCJcU1wXNR6q4V8w" } },
			{ type: "text", text: "Describe this." },
		]);
		expect(ir.messages[0]?.content[0]).toMatchObject({ type: "image", source: "id", data: "file_011CNha8iCJcU1wXNR6q4V8w" });
		const payload = irToAnthropicMessages(ir);
		expect(payload.messages[0].content[0]).toEqual({
			type: "image",
			source: { type: "file", file_id: "file_011CNha8iCJcU1wXNR6q4V8w" },
		});
	});
});

describe("Messages document blocks on other providers", () => {
	it("keeps the document block verbatim for Claude", () => {
		const ir = decode([{ ...pdfBlock, cache_control: { type: "ephemeral" } }, { type: "text", text: "Summarise." }]);
		const payload = irToAnthropicMessages(ir);
		expect(payload.messages[0].content[0]).toEqual({ ...pdfBlock, cache_control: { type: "ephemeral" } });
	});

	it("sends a base64 PDF to Gemini as inline_data, not [object Object]", async () => {
		const ir = decode([pdfBlock, { type: "text", text: "Summarise." }]);
		const parts = await irPartsToGeminiParts(ir.messages[0]!.content);
		expect(parts).toEqual([
			{ inline_data: { mime_type: "application/pdf", data: "JVBERi0xLjQ=" } },
			{ text: "Summarise." },
		]);
	});

	it("sends a base64 PDF to Chat Completions hosts as an OpenAI file part", () => {
		const ir = decode([pdfBlock, { type: "text", text: "Summarise." }]);
		const request = irToOpenAIChat(ir, "model", "deepinfra");
		expect(request.messages[0].content[0]).toEqual({
			type: "file",
			file: { filename: "report.pdf", file_data: "data:application/pdf;base64,JVBERi0xLjQ=" },
		});
	});

	it("sends URL and text documents to Responses hosts as input_file", () => {
		const ir = decode([
			{ type: "document", source: { type: "url", url: "https://example.com/paper.pdf" } },
			{ type: "document", source: { type: "text", media_type: "text/plain", data: "Plain notes" } },
			{ type: "document", source: { type: "content", content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } },
		]);
		const request = irToOpenAIResponses(ir, "gpt-5.5", "openai");
		expect(request.input[0].content).toEqual([
			{ type: "input_file", file_url: "https://example.com/paper.pdf" },
			{ type: "input_file", file_data: `data:text/plain;base64,${btoa("Plain notes")}` },
			{ type: "input_file", file_data: `data:text/plain;base64,${btoa("A\n\nB")}` },
		]);
	});
});
