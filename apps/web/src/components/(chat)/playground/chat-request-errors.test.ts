import {
	createChatStreamTextError,
	parseChatStreamErrorFrame,
} from "./chat-request-errors";

describe("parseChatStreamErrorFrame", () => {
	it("extracts OpenAI response.failed stream errors", () => {
		const error = parseChatStreamErrorFrame(
			{
				type: "response.failed",
				response: {
					id: "resp_123",
					error: {
						code: "model_not_found",
						message: "The requested model is not available.",
					},
				},
			},
			"response.failed",
		);

		expect(error).not.toBeNull();
		expect(error?.message).toBe("The requested model is not available.");
		expect(error?.code).toBe("model_not_found");
		expect(error?.requestId).toBe("resp_123");
		expect(error?.rawPayload).toMatchObject({
			frame_event_type: "response.failed",
			type: "response.failed",
		});
	});

	it("extracts gateway object error stream frames", () => {
		const error = parseChatStreamErrorFrame({
			object: "error",
			message: "openai_stream_failed",
		});

		expect(error).not.toBeNull();
		expect(error?.message).toBe("openai_stream_failed");
		expect(error?.code).toBe("stream_error");
	});

	it("keeps routing diagnostics from streamed gateway errors", () => {
		const error = parseChatStreamErrorFrame({
			error: "upstream_error",
			description: "Provider failed.",
			action: "Retry with bounded exponential backoff.",
			retryable: true,
			docs_url: "https://phaseo.app/docs/v1/api-reference/errors",
			support_url: "https://phaseo.tawk.help/",
			retry_after_seconds: 10,
			generation_id: "gen_123",
			routing_diagnostics: {
				finalCandidateCount: 1,
			},
		});

		expect(error).not.toBeNull();
		expect(error?.message).toBe("Provider failed.");
		expect(error?.code).toBe("upstream_error");
		expect(error?.requestId).toBe("gen_123");
		expect(error?.action).toBe("Retry with bounded exponential backoff.");
		expect(error?.retryable).toBe(true);
		expect(error?.retryAfterSeconds).toBe(10);
		expect(error?.docsUrl).toBe("https://phaseo.app/docs/v1/api-reference/errors");
		expect(error?.routingDiagnostics).toEqual({
			finalCandidateCount: 1,
		});
	});
});

describe("createChatStreamTextError", () => {
	it("creates a structured error for non-json SSE error frames", () => {
		const error = createChatStreamTextError("stream disconnected", {
			frame_event_type: "error",
		});

		expect(error.message).toBe("stream disconnected");
		expect(error.code).toBe("stream_error");
		expect(error.rawPayload).toEqual({
			frame_event_type: "error",
		});
	});
});
