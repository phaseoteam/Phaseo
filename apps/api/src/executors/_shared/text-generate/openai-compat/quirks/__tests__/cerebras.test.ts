import { describe, expect, it } from "vitest";
import { cerebrasQuirks } from "../../providers/cerebras/quirks";

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
		expect(request.max_reasoning_tokens).toBe(256);
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

	it("drops unsupported penalties/logit_bias and response_format on reasoning", () => {
		const request: Record<string, any> = {
			frequency_penalty: 0.2,
			presence_penalty: 0.1,
			logit_bias: { 42: 1 },
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

		expect(request.frequency_penalty).toBeUndefined();
		expect(request.presence_penalty).toBeUndefined();
		expect(request.logit_bias).toBeUndefined();
		expect(request.response_format).toBeUndefined();
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

		expect(request.prompt_cache_key).toBeUndefined();
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

	it("passes through Cerebras raw curl params for glm models", () => {
		const request: Record<string, any> = {
			model: "zai-glm-4.7",
		};
		const ir: any = {
			model: "zai-glm-4.7",
			rawRequest: {
				clear_thinking: false,
				disable_reasoning: true,
				max_reasoning_tokens: 321,
				reasoning_effort: "low",
				prediction: {
					type: "content",
					content: "known prefix",
				},
			},
		};

		cerebrasQuirks.transformRequest?.({ request, ir });

		expect(request.clear_thinking).toBe(false);
		expect(request.disable_reasoning).toBe(true);
		expect(request.max_reasoning_tokens).toBe(321);
		expect(request.reasoning_effort).toBe("low");
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
