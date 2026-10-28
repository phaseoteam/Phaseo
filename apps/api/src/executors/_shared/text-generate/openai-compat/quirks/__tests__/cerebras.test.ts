import { describe, expect, it } from "vitest";
import { cerebrasQuirks } from "../../providers/cerebras/quirks";
import { openAIChatToIR } from "../../transform-chat";

describe("Cerebras quirks", () => {
	it("maps reasoning and service tier, and rewrites developer role", () => {
		const request: Record<string, any> = {
			max_tokens: 128,
			service_tier: "standard",
			messages: [
				{ role: "developer", content: "You are a code assistant." },
				{ role: "user", content: "hi" },
			],
		};
		const ir: any = {
			reasoning: {
				effort: "xhigh",
				maxTokens: 256,
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.max_tokens).toBeUndefined();
		expect(request.max_completion_tokens).toBe(128);
		expect(request.reasoning_effort).toBe("high");
		expect(request.service_tier).toBe("default");
		expect(request.messages[0].role).toBe("system");
	});

	it("maps reasoning enabled=false to none", () => {
		const request: Record<string, any> = {};
		const ir: any = {
			reasoning: {
				enabled: false,
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("none");
	});

	it("preserves supported penalties, logit bias, caching, and structured output", () => {
		const request: Record<string, any> = {
			frequency_penalty: 0.2,
			presence_penalty: 0.1,
			logit_bias: { 42: 1 },
			prompt_cache_key: "conversation-1",
			response_format: {
				type: "json_object",
			},
		};
		const ir: any = {
			reasoning: {
				effort: "medium",
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.frequency_penalty).toBe(0.2);
		expect(request.presence_penalty).toBe(0.1);
		expect(request.logit_bias).toEqual({ 42: 1 });
		expect(request.prompt_cache_key).toBe("conversation-1");
		expect(request.response_format).toEqual({ type: "json_object" });
	});

	it("drops unsupported OpenAI fields used by responses payloads", () => {
		const request: Record<string, any> = {
			prompt_cache_key: null,
			safety_identifier: null,
			input_items: [
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "hi" }],
				},
			],
		};

		cerebrasQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.prompt_cache_key).toBeNull();
		expect(request.safety_identifier).toBeUndefined();
		expect(Array.isArray(request.input_items)).toBe(true);
	});

	it("extracts reasoning from message.reasoning", () => {
		const out = cerebrasQuirks.extractReasoning?.({
			choice: {
				message: {
					reasoning: "step-by-step",
				},
			},
			rawContent: "final answer",
		});

		expect(out?.main).toBe("final answer");
		expect(out?.reasoning).toEqual(["step-by-step"]);
	});

	it("maps stream reasoning deltas to reasoning_content", () => {
		const chunk: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {
						reasoning: "chain ",
					},
				},
			],
		};

		cerebrasQuirks.transformStreamChunk?.({
			chunk,
			accumulated: {},
		});

		expect(chunk.choices[0].delta.reasoning_content).toBe("chain ");
	});

	it("preserves Cerebras top-level image token usage", () => {
		const response = openAIChatToIR({
			id: "chatcmpl-cerebras-1",
			choices: [],
			usage: {
				prompt_tokens: 20,
				completion_tokens: 5,
				total_tokens: 25,
				image_tokens: 12,
			},
		}, "request-1", "gemma-4-31b", "cerebras");

		expect(response.usage?._ext?.inputImageTokens).toBe(12);
	});

	it("passes through current Cerebras reasoning params for glm models", () => {
		const request: Record<string, any> = {
			model: "zai-glm-4.7",
		};
		const ir: any = {
			model: "zai-glm-4.7",
			rawRequest: {
				clear_thinking: false,
				disable_reasoning: true,
				reasoning_effort: "low",
				reasoning_format: "parsed",
				prediction: {
					type: "content",
					content: "known prefix",
				},
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.clear_thinking).toBe(false);
		expect(request.disable_reasoning).toBeUndefined();
		expect(request.reasoning_effort).toBe("low");
		expect(request.reasoning_format).toBe("parsed");
		expect(request.prediction).toEqual({
			type: "content",
			content: "known prefix",
		});
	});

	it("silently drops glm-only params for non-glm models", () => {
		const request: Record<string, any> = {
			model: "gpt-oss-120b",
		};
		const ir: any = {
			model: "gpt-oss-120b",
			rawRequest: {
				clear_thinking: false,
				disable_reasoning: true,
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.clear_thinking).toBeUndefined();
		expect(request.disable_reasoning).toBeUndefined();
	});

	it("silently drops invalid glm-only param values", () => {
		const request: Record<string, any> = {
			model: "zai-glm-4.7",
		};
		const ir: any = {
			model: "zai-glm-4.7",
			rawRequest: {
				clear_thinking: "nope",
				disable_reasoning: "nope",
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.clear_thinking).toBeUndefined();
		expect(request.disable_reasoning).toBeUndefined();
	});
});

describe("Cerebras gpt-oss reasoning", () => {
	// gpt-oss accepts low, medium or high (https://inference-docs.cerebras.ai/api-reference/chat-completions).
	it("leaves out effort none for gpt-oss", () => {
		const request: Record<string, any> = { model: "gpt-oss-120b", messages: [] };
		cerebrasQuirks.transformRequest?.({ request, ir: { reasoning: { enabled: false } } as any });
		expect(request).not.toHaveProperty("reasoning_effort");
	});
});
