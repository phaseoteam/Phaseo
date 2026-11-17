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
				{ role: "assistant", content: "done", reasoning_content: "earlier answer" },
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
		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.tool_choice).toBe("auto");
		expect(request.parallel_tool_calls).toBeUndefined();
		expect(request.seed).toBeUndefined();
		expect(request.metadata).toBeUndefined();
		// DeepSeek needs reasoning_content on every earlier turn when tools are present.
		expect(request.messages[0].reasoning_content).toBe("earlier answer");
		expect(request.messages[1].reasoning_content).toBe("needed for tool continuation");
	});

	// DeepSeek thinks by default and returns 400 for a forced tool_choice in thinking mode
	// (checked live 2026-11-16), so the forced tool is kept and thinking turned off.
	it.each([
		["required", "required"],
		["a named function", { type: "function", function: { name: "lookup" } }],
	])("keeps a forced tool_choice (%s) and turns thinking off on Chat", (_label, toolChoice) => {
		for (const thinking of [undefined, { type: "enabled" }]) {
			const request: Record<string, any> = {
				messages: [{ role: "user", content: "hi" }],
				tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
				tool_choice: toolChoice,
				...(thinking ? { thinking } : {}),
			};

			deepseekQuirks.transformRequest?.({
				request,
				ir: { model: "deepseek-v4-pro", reasoning: { effort: "high" } } as any,
			});

			expect(request.tool_choice).toEqual(toolChoice);
			expect(request.thinking).toEqual({ type: "disabled" });
			expect(request.reasoning_effort).toBeUndefined();
		}
	});

	it("turns thinking off with reasoning effort none for a forced tool on Responses", () => {
		const request: Record<string, any> = {
			input: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }],
			tool_choice: "required",
			reasoning: { effort: "high" },
			thinking: { type: "enabled" },
		};

		deepseekQuirks.transformRequest?.({ request, ir: { model: "deepseek-v4-pro" } as any });

		expect(request.tool_choice).toBe("required");
		expect(request.reasoning).toEqual({ effort: "none" });
		expect(request.thinking).toBeUndefined();
	});

	// The gateway's server-tool loop continues a forced call with tool_choice "auto"; the call
	// was made without thinking, so it has no reasoning_content for thinking mode to require.
	it("keeps thinking off when the current turn's tool call has no reasoning", () => {
		const toolCall = { id: "call_1", type: "function", function: { name: "phaseo_datetime", arguments: "{}" } };
		const continuation: Record<string, any> = {
			messages: [
				{ role: "user", content: "what time is it?" },
				{ role: "assistant", content: null, tool_calls: [toolCall] },
				{ role: "tool", tool_call_id: "call_1", content: "12:00" },
			],
			tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
			tool_choice: "auto",
			thinking: { type: "enabled" },
			reasoning_effort: "high",
		};
		deepseekQuirks.transformRequest?.({ request: continuation, ir: { model: "deepseek-v4-pro" } as any });
		expect(continuation.thinking).toEqual({ type: "disabled" });
		expect(continuation.reasoning_effort).toBeUndefined();

		const thought: Record<string, any> = {
			...continuation,
			messages: [
				continuation.messages[0],
				{ role: "assistant", content: null, reasoning_content: "check the clock", tool_calls: [toolCall] },
				continuation.messages[2],
			],
			thinking: { type: "enabled" },
		};
		deepseekQuirks.transformRequest?.({ request: thought, ir: { model: "deepseek-v4-pro" } as any });
		expect(thought.thinking).toEqual({ type: "enabled" });

		const nextTurn: Record<string, any> = {
			...continuation,
			messages: [...continuation.messages, { role: "assistant", content: "Noon." }, { role: "user", content: "thanks" }],
			thinking: { type: "enabled" },
		};
		deepseekQuirks.transformRequest?.({ request: nextTurn, ir: { model: "deepseek-v4-pro" } as any });
		expect(nextTurn.thinking).toEqual({ type: "enabled" });
	});

	it.each(["auto", "none"])("leaves thinking on for tool_choice %s", (toolChoice) => {
		const request: Record<string, any> = {
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
			tool_choice: toolChoice,
			thinking: { type: "enabled" },
		};

		deepseekQuirks.transformRequest?.({ request, ir: { model: "deepseek-v4-pro" } as any });

		expect(request.tool_choice).toBe(toolChoice);
		expect(request.thinking).toEqual({ type: "enabled" });
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
