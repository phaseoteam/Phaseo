// /v1/messages context_management and user reach Anthropic as documented:
// https://platform.claude.com/docs/en/build-with-claude/context-editing
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAnthropic, irToAnthropicMessages } from "../index";
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
