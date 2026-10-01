import { describe, expect, it } from "vitest";
import { deepseekQuirks } from "../../providers/deepseek/quirks";
import { applyReasoningParams } from "../../reasoning";

describe("DeepSeek quirks", () => {
	it("keeps json_object response_format and rewrites developer role", () => {
		const request: Record<string, any> = {
			response_format: { type: "json_object" },
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hi" },
			],
		};

		deepseekQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.messages[0].role).toBe("system");
	});

	it("downgrades json_schema to json_object and injects schema instructions", () => {
		const request: Record<string, any> = {
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
				},
			},
			messages: [{ role: "user", content: "Give one city." }],
		};

		deepseekQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.messages[0].role).toBe("system");
		expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
	});

	it("maps the current V4 request contract and removes unsupported fields", () => {
		const request: Record<string, any> = {
			messages: [
				{ role: "assistant", content: "done", reasoning_content: "stale" },
				{
					role: "assistant",
					content: null,
					reasoning_content: "needed for tool continuation",
					tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }],
				},
			],
			thinking: { type: "enabled" },
			tool_choice: "auto",
			user: "tenant-123",
			parallel_tool_calls: true,
			seed: 42,
			metadata: { trace: "x" },
		};

		deepseekQuirks.transformRequest?.({
			request,
			ir: { model: "deepseek-v4-pro", reasoning: { effort: "xhigh" } } as any,
		});

		expect(request.user_id).toBe("tenant-123");
		expect(request.user).toBeUndefined();
		expect(request.reasoning_effort).toBe("high");
		expect(request.tool_choice).toBeUndefined();
		expect(request.parallel_tool_calls).toBeUndefined();
		expect(request.seed).toBeUndefined();
		expect(request.metadata).toBeUndefined();
		expect(request.messages[0].reasoning_content).toBeUndefined();
		expect(request.messages[1].reasoning_content).toBe("needed for tool continuation");
	});

	it("normalizes DeepSeek top-level cache usage for gateway accounting", () => {
		const response = {
			usage: {
				prompt_tokens: 100,
				prompt_cache_hit_tokens: 80,
				prompt_cache_miss_tokens: 20,
			},
		};

		deepseekQuirks.normalizeResponse?.({ response, ir: {} as any });

		expect(response.usage.prompt_tokens_details).toEqual({
			cached_tokens: 80,
			cache_miss_tokens: 20,
		});
	});

	it("maps reasoning effort for the temporary V4.1 Flash Beta deployment", () => {
		const request: Record<string, any> = {};

		applyReasoningParams({
			ir: { reasoning: { effort: "max" } } as any,
			request,
			providerId: "deepseek",
			providerModelSlug: "deepseek-v4.1-flash-expires-on-0910",
		});

		expect(request.reasoning_effort).toBe("max");
		expect(request.thinking).toEqual({ type: "enabled" });
	});
});
