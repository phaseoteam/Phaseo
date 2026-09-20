import {
	buildChatRequestLogHref,
	getChatMessageRequestId,
	getChatPayloadRequestId,
} from "./chatMessageMetadata";

describe("chat message metadata", () => {
	it("reads explicit request IDs from response payloads", () => {
		expect(
			getChatPayloadRequestId({ request_id: " req_123 " }, "responses"),
		).toBe("req_123");
	});

	it("uses the canonical Responses API ID when no explicit field exists", () => {
		expect(
			getChatPayloadRequestId(
				{ response: { id: "req_stream_123", object: "response" } },
				"responses",
			),
		).toBe("req_stream_123");
		expect(
			getChatPayloadRequestId(
				{ id: "chatcmpl_provider_123", object: "chat.completion" },
				"chat.completions",
			),
		).toBeNull();
	});

	it("reads persisted and failed-request IDs from message metadata", () => {
		expect(getChatMessageRequestId({ request_id: "req_saved" })).toBe(
			"req_saved",
		);
		expect(
			getChatMessageRequestId({
				chat_request_error: { requestId: "req_failed" },
			}),
		).toBe("req_failed");
	});

	it("builds an encoded request-log detail URL", () => {
		expect(buildChatRequestLogHref("req/with spaces")).toBe(
			"/settings/usage/logs/requests/req%2Fwith%20spaces",
		);
	});
});
