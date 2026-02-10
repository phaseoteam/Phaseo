import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { irToAnthropicMessages } from "../index";
import { decodeOpenAIChatRequest } from "../../../../protocols/openai-chat/decode";
import { decodeAnthropicMessagesRequest } from "../../../../protocols/anthropic-messages/decode";

function createBaseRequest(): IRChatRequest {
	return {
		model: "claude-3-7-sonnet",
		stream: false,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
		],
	};
}

describe("irToAnthropicMessages service controls", () => {
	it("maps priority tier to auto service tier without fast mode", () => {
		const request = createBaseRequest();
		request.serviceTier = "priority";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("auto");
	});

	it("maps speed fast to Anthropic fast mode without service tier override", () => {
		const request = createBaseRequest();
		request.speed = "fast";
		request.serviceTier = "priority";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBe("fast");
		expect(payload.service_tier).toBeUndefined();
	});

	it("maps standard tier to standard_only service tier", () => {
		const request = createBaseRequest();
		request.serviceTier = "standard";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("standard_only");
	});

	it("maps OpenAI surface service_tier=priority to Anthropic service_tier=auto", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			service_tier: "priority",
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("auto");
	});

	it("maps Anthropic surface speed=fast to Anthropic speed=fast", () => {
		const request = decodeAnthropicMessagesRequest({
			model: "anthropic/claude-3-7-sonnet",
			max_tokens: 256,
			speed: "fast",
			messages: [{ role: "user", content: "Hello" }],
		});

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBe("fast");
		expect(payload.service_tier).toBeUndefined();
	});

	it("maps OpenAI xhigh reasoning effort to Anthropic output_config.effort=max", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "xhigh" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.output_config?.effort).toBe("max");
	});

	it("maps OpenAI high reasoning effort straight through to Anthropic", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "high" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.output_config?.effort).toBe("high");
	});

	it("maps none reasoning effort to thinking disabled", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "none" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.thinking).toEqual({ type: "disabled" });
		expect(payload.output_config).toBeUndefined();
	});

	it("adds JSON object structured-output instruction to system prompt", () => {
		const request = createBaseRequest();
		request.responseFormat = { type: "json_object" };

		const payload = irToAnthropicMessages(request);
		expect(typeof payload.system).toBe("string");
		expect(payload.system).toContain("valid JSON object");
	});

	it("adds JSON schema structured-output instruction to system prompt", () => {
		const request = createBaseRequest();
		request.responseFormat = {
			type: "json_schema",
			name: "weather",
			strict: true,
			schema: {
				type: "object",
				properties: {
					location: { type: "string" },
					temperature_c: { type: "number" },
				},
				required: ["location", "temperature_c"],
				additionalProperties: false,
			},
		};

		const payload = irToAnthropicMessages(request);
		expect(typeof payload.system).toBe("string");
		expect(payload.system).toContain("strictly matches this schema");
		expect(payload.system).toContain("\"temperature_c\"");
	});
});
