import { describe, expect, it } from "vitest";
import {
	adaptRequestFromUpstreamError,
	shouldFallbackToChatFromError,
} from "../retry-policy";

describe("adaptRequestFromUpstreamError", () => {
	it("drops unsupported top-level parameters reported by provider", () => {
		const baseRequest = {
			model: "provider/model",
			input: "hello",
			service_tier: "default",
			stream_options: { include_usage: true },
		};

		const adapted = adaptRequestFromUpstreamError({
			providerId: "example",
			route: "chat",
			request: baseRequest,
			errorText: "Unsupported parameter: service_tier. Unknown parameter stream_options",
			errorPayload: null,
		});

		expect(adapted.changed).toBe(true);
		expect(adapted.request.service_tier).toBeUndefined();
		expect(adapted.request.stream_options).toBeUndefined();
		expect(adapted.dropped).toEqual(expect.arrayContaining(["service_tier", "stream_options"]));
	});

	it("drops nested paths from validation error details", () => {
		const baseRequest = {
			model: "provider/model",
			messages: [
				{ role: "user", name: "alice", content: "hello" },
			],
		};

		const adapted = adaptRequestFromUpstreamError({
			providerId: "example",
			route: "chat",
			request: baseRequest,
			errorText: "",
			errorPayload: {
				details: [
					{
						path: ["messages", 0, "name"],
						message: "additional property not allowed",
					},
				],
			},
		});

		expect(adapted.changed).toBe(true);
		expect((adapted.request.messages?.[0] as any)?.name).toBeUndefined();
	});

	it("maps max_completion_tokens -> max_tokens when unsupported", () => {
		const adapted = adaptRequestFromUpstreamError({
			providerId: "example",
			route: "chat",
			request: {
				model: "provider/model",
				max_completion_tokens: 512,
			},
			errorText: "unknown parameter max_completion_tokens",
			errorPayload: null,
		});

		expect(adapted.changed).toBe(true);
		expect(adapted.request.max_completion_tokens).toBeUndefined();
		expect(adapted.request.max_tokens).toBe(512);
	});

	it("maps input_items -> input when unsupported", () => {
		const adapted = adaptRequestFromUpstreamError({
			providerId: "example",
			route: "responses",
			request: {
				model: "provider/model",
				input_items: [{ type: "message", role: "user", content: "hi" }],
			},
			errorText: "unsupported parameter input_items",
			errorPayload: null,
		});

		expect(adapted.changed).toBe(true);
		expect(adapted.request.input_items).toBeUndefined();
		expect(adapted.request.input).toBeDefined();
	});
});

describe("shouldFallbackToChatFromError", () => {
	it("falls back for responses 404-style errors", () => {
		expect(shouldFallbackToChatFromError({
			route: "responses",
			status: 404,
			errorText: "Not found",
		})).toBe(true);
	});

	it("does not fallback for non-responses routes", () => {
		expect(shouldFallbackToChatFromError({
			route: "chat",
			status: 404,
			errorText: "Not found",
		})).toBe(false);
	});
});

