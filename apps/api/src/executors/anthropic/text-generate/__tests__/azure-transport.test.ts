import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAnthropic } from "../index";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

afterEach(() => {
	vi.unstubAllGlobals();
	teardownTestRuntime();
});

describe("Azure Claude transport", () => {
	it.each([false, true])("sends the configured deployment and Claude credentials (stream=%s)", async (stream) => {
		setupRuntimeFromEnv({
			AZURE_OPENAI_BASE_URL: "https://resource.openai.azure.com/openai/v1",
			AZURE_OPENAI_API_KEY: "azure-test-key",
		} as any);
		const message = { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "OK." }], stop_reason: "end_turn", usage: { input_tokens: 14, output_tokens: 5 } };
		const fetchMock = vi.fn().mockResolvedValue(new Response(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
		vi.stubGlobal("fetch", fetchMock);
		await executeAnthropic({
			ir: { model: "anthropic/claude-opus-5.5", messages: [{ role: "user", content: [{ type: "text", text: "Reply OK." }] }], stream, maxTokens: 16 },
			protocol: "anthropic.messages", endpoint: "messages", requestId: "req_azure", workspaceId: "workspace",
			providerId: "azure", providerModelSlug: "claude-opus-5-5", capability: "text.generate", byokMeta: [], pricingCard: null, meta: {},
		} as any);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://resource.services.ai.azure.com/anthropic/v1/messages");
		expect(init.headers["x-api-key"]).toBe("azure-test-key");
		expect(init.headers["api-key"]).toBeUndefined();
		expect(init.headers["anthropic-version"]).toBe("2023-06-01");
		expect(JSON.parse(init.body)).toMatchObject({ model: "claude-opus-5-5", stream: true });
	});
});
