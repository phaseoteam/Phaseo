// /v1/messages context_management and user reach Anthropic as documented:
// https://platform.claude.com/docs/en/build-with-claude/context-editing
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAnthropic, irToAnthropicMessages } from "../index";
import { encodeAnthropicMessagesResponse } from "@protocols/anthropic-messages/encode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { stripGatewayStop } from "@core/finish-reason";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

afterEach(() => {
	vi.unstubAllGlobals();
	teardownTestRuntime();
});

const contextManagement = { edits: [{ type: "clear_tool_uses_20250919", keep: { type: "tool_uses", value: 2 } }] };

describe("Anthropic context_management", () => {
	it("sends context_management unchanged", () => {
		const request = irToAnthropicMessages({
			model: "claude-opus-5-5",
			messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
			maxTokens: 64,
			anthropicContextManagement: contextManagement,
			userId: "user_123",
		} as any, null, "claude-opus-5-5");
		expect(request.context_management).toEqual(contextManagement);
		expect(request.metadata).toEqual({ user_id: "user_123" });
	});

	it("adds the context-management beta header only when the request uses it", async () => {
		setupRuntimeFromEnv({ ANTHROPIC_API_KEY: "anthropic-test-key" } as any);
		const message = { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "OK." }], stop_reason: "end_turn", usage: { input_tokens: 14, output_tokens: 5 } };
		const sse = `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`;
		const fetchMock = vi.fn().mockImplementation(async () => new Response(sse, { headers: { "Content-Type": "text/event-stream" } }));
		vi.stubGlobal("fetch", fetchMock);
		const run = (ir: Record<string, unknown>) => executeAnthropic({
			ir: { model: "anthropic/claude-opus-5.5", messages: [{ role: "user", content: [{ type: "text", text: "Reply OK." }] }], stream: false, maxTokens: 16, ...ir },
			protocol: "anthropic.messages", endpoint: "messages", requestId: "req_cm", workspaceId: "workspace",
			providerId: "anthropic", providerModelSlug: "claude-opus-5-5", capability: "text.generate", byokMeta: [], pricingCard: null, meta: {},
		} as any);

		await run({ anthropicContextManagement: contextManagement });
		const [, withEdits] = fetchMock.mock.calls[0];
		expect(withEdits.headers["anthropic-beta"]).toContain("context-management-2025-06-27");
		expect(JSON.parse(withEdits.body).context_management).toEqual(contextManagement);

		await run({});
		const [, without] = fetchMock.mock.calls[1];
		expect(without.headers["anthropic-beta"] ?? "").not.toContain("context-management");
		expect(JSON.parse(without.body).context_management).toBeUndefined();
	});
});

// Anthropic reports the edits it applied on the final message_delta of the stream
// it sends us, and as `context_management` on a whole message.
const appliedEdits = {
	applied_edits: [{ type: "clear_tool_uses_20250919", cleared_tool_uses: 8, cleared_input_tokens: 50_000 }],
};
const startedMessage = { id: "msg_cm", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, usage: { input_tokens: 14, output_tokens: 1 } };
const editedSse = [
	{ type: "message_start", message: startedMessage },
	{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
	{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK." } },
	{ type: "content_block_stop", index: 0 },
	{ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 }, context_management: appliedEdits },
	{ type: "message_stop" },
].map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");

async function runEdited(protocol: string, stream: boolean) {
	setupRuntimeFromEnv({ ANTHROPIC_API_KEY: "anthropic-test-key" } as any);
	vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(editedSse, { headers: { "Content-Type": "text/event-stream" } })));
	return executeAnthropic({
		ir: { model: "anthropic/claude-opus-5.5", messages: [{ role: "user", content: [{ type: "text", text: "Reply OK." }] }], stream, maxTokens: 16, anthropicContextManagement: contextManagement },
		protocol, endpoint: protocol === "anthropic.messages" ? "messages" : "responses", requestId: "req_cm", workspaceId: "workspace",
		providerId: "anthropic", providerModelSlug: "claude-opus-5-5", capability: "text.generate", byokMeta: [], pricingCard: null, meta: {},
	} as any);
}

async function streamFrames(result: any): Promise<any[]> {
	const text = await new Response(result.stream).text();
	return text.split("\n\n").flatMap((block) => {
		const data = block.split("\n").find((line) => line.startsWith("data: "));
		if (!data) return [];
		try { return [stripGatewayStop(JSON.parse(data.slice(6)))]; } catch { return []; }
	});
}

describe("Anthropic context_management results", () => {
	it("returns applied edits on a buffered Messages response only", async () => {
		const result: any = await runEdited("anthropic.messages", false);
		expect(encodeAnthropicMessagesResponse(result.ir).context_management).toEqual(appliedEdits);
		expect(JSON.stringify(encodeOpenAIChatResponse(result.ir))).not.toContain("applied_edits");
		expect(JSON.stringify(encodeOpenAIResponsesResponse(result.ir))).not.toContain("applied_edits");
	});

	it("returns applied edits on the final streamed Messages message_delta", async () => {
		const frames = await streamFrames(await runEdited("anthropic.messages", true));
		const delta = frames.find((frame) => frame.type === "message_delta");
		expect(delta?.context_management).toEqual(appliedEdits);
		expect(delta?.delta?.stop_reason).toBe("end_turn");
	});

	it("keeps applied edits off a streamed Responses response", async () => {
		const frames = await streamFrames(await runEdited("openai.responses", true));
		expect(frames.some((frame) => frame?.response?.status === "completed")).toBe(true);
		expect(JSON.stringify(frames)).not.toContain("applied_edits");
	});

	it("never sends the internal carrier to a client", () => {
		const frame = { type: "response.completed", response: { status: "completed", _phaseo_context_management: appliedEdits } };
		expect(stripGatewayStop(frame)).toEqual({ type: "response.completed", response: { status: "completed" } });
	});
});
