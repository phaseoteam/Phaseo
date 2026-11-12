// Chat Completions shapes the OpenAI SDKs send (simulator finding N10).
import { describe, expect, it } from "vitest";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "../decode";
import { decodeOpenAIResponsesRequest } from "../../openai-responses/decode";

function parseChat(body: unknown) {
	const parsed = ChatCompletionsSchema.safeParse(body);
	if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
	return parsed.data;
}

describe("Chat Completions SDK shapes", () => {
	it("accepts and decodes an assistant tool-call message with content: null", () => {
		const ir = decodeOpenAIChatRequest(parseChat({
			model: "openai/gpt-5.4",
			messages: [
				{ role: "user", content: "Weather in Paris?" },
				{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "weather", arguments: "{\"city\":\"Paris\"}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: "18C" },
			],
		}) as any);
		const assistant = ir.messages[1] as any;
		expect(assistant.role).toBe("assistant");
		expect(assistant.toolCalls).toEqual([expect.objectContaining({ id: "call_1", name: "weather", arguments: "{\"city\":\"Paris\"}" })]);
		expect(assistant.content.every((part: any) => part.type === "text" && part.text === "")).toBe(true);
	});

	it("accepts file parts with file_data or file_id and decodes them to IR file parts", () => {
		const ir = decodeOpenAIChatRequest(parseChat({
			model: "openai/gpt-5.4",
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Summarise" },
					{ type: "file", file: { filename: "report.pdf", file_data: "data:application/pdf;base64,JVBERi0x" } },
					{ type: "file", file: { file_id: "file-abc123" } },
				],
			}],
		}) as any);
		expect(ir.messages[0].content.slice(1)).toEqual([
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "report.pdf" },
			{ type: "file", source: "id", data: "file-abc123" },
		]);
	});

	it("rejects a file part with neither file_data nor file_id", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "openai/gpt-5.4",
			messages: [{ role: "user", content: [{ type: "file", file: { filename: "empty.pdf" } }] }],
		});
		expect(parsed.success).toBe(false);
	});

	it("infers a PDF media type from the filename when file_data is bare base64", () => {
		const ir = decodeOpenAIChatRequest(parseChat({
			model: "openai/gpt-5.4",
			messages: [{ role: "user", content: [{ type: "file", file: { filename: "doc.pdf", file_data: "JVBERi0x" } }] }],
		}) as any);
		expect(ir.messages[0].content[0]).toEqual({ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "doc.pdf" });
	});

	it("keeps a file part's cache mark", () => {
		const ir = decodeOpenAIChatRequest(parseChat({
			model: "openai/gpt-5.4",
			messages: [{ role: "user", content: [{ type: "file", file: { file_id: "file-abc123" }, cache_control: { type: "ephemeral" } }] }],
		}) as any);
		expect(ir.messages[0].content[0]).toMatchObject({ type: "file", source: "id", cacheControl: { type: "ephemeral" } });
	});

	it("leaves temperature unset when the request does not name one", () => {
		const body = parseChat({ model: "openai/gpt-5.4", messages: [{ role: "user", content: "hi" }] });
		expect(body.temperature).toBeUndefined();
		expect(decodeOpenAIChatRequest(body as any).temperature).toBeUndefined();
		expect(decodeOpenAIChatRequest(parseChat({ model: "openai/gpt-5.4", messages: [{ role: "user", content: "hi" }], temperature: 0.2 }) as any).temperature).toBe(0.2);
	});
});

describe("Responses input_file parts", () => {
	it("decodes file_data, file_url and file_id to IR file parts", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "openai/gpt-5.4",
			input: [{
				type: "message",
				role: "user",
				content: [
					{ type: "input_file", filename: "a.pdf", file_data: "data:application/pdf;base64,JVBERi0x" },
					{ type: "input_file", file_url: "https://example.com/b.pdf" },
					{ type: "input_file", file_id: "file-c" },
				],
			}],
		} as any);
		const user = ir.messages.find((message) => message.role === "user") as any;
		expect(user.content).toEqual([
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "a.pdf" },
			{ type: "file", source: "url", data: "https://example.com/b.pdf" },
			{ type: "file", source: "id", data: "file-c" },
		]);
	});
});
