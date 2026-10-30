import { describe, expect, it } from "vitest";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import {
	irToOpenAIChat,
	openAIChatToIR,
} from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { resolveTextProviderParamPolicyOverride } from "@providers/textProfiles";
import { preprocess } from "./index";

describe("Baseten Model API text contract", () => {
	it("advertises and preserves documented OpenAI-compatible parameters", () => {
		for (const param of [
			"max_tokens", "temperature", "top_p", "top_k", "frequency_penalty",
			"presence_penalty", "logit_bias", "logprobs", "top_logprobs", "seed",
			"stop", "stream_options", "n", "tools", "tool_choice",
			"parallel_tool_calls", "response_format", "user", "reasoning.effort",
		]) {
			expect(resolveTextProviderParamPolicyOverride({
				providerId: "baseten",
				paramPathCandidates: [param],
			})).toBe(true);
		}

		const decoded = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "zai-org/GLM-5.2",
			messages: [{ role: "user", content: "Return JSON" }],
			max_tokens: 2048,
			temperature: 1.5,
			top_p: 0.9,
			n: 1,
			reasoning_effort: "high",
			tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" }, strict: true } }],
			tool_choice: "required",
			response_format: {
				type: "json_schema",
				json_schema: { name: "answer", strict: true, schema: { type: "object" } },
			},
		}));
		const wire = irToOpenAIChat(
			preprocess(decoded, { capabilityParams: null } as any),
			"zai-org/GLM-5.2",
			"baseten",
		);

		expect(wire).toMatchObject({
			model: "zai-org/GLM-5.2",
			max_tokens: 2048,
			temperature: 1.5,
			top_p: 0.9,
			n: 1,
			reasoning_effort: "high",
			chat_template_args: { enable_thinking: true },
			tool_choice: "required",
			response_format: { type: "json_schema" },
		});
	});

	it("accepts audio_url and emits Baseten multimodal wire shapes", () => {
		const decoded = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "thinkingmachines/inkling",
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Summarize" },
					{ type: "image_url", image_url: { url: "https://example.com/i.png", detail: "original" } },
					{ type: "audio_url", audio_url: { url: "https://example.com/a.wav" } },
					{ type: "video_url", video_url: { url: "https://example.com/v.mp4" } },
				],
			}],
		}));
		const wire = irToOpenAIChat(decoded, "thinkingmachines/inkling", "baseten");
		expect(wire.messages[0].content).toEqual([
			{ type: "text", text: "Summarize" },
			// Baseten documents auto/low/high only, so "original" is sent as "high".
			{ type: "image_url", image_url: { url: "https://example.com/i.png", detail: "high" } },
			{ type: "audio_url", audio_url: { url: "https://example.com/a.wav" } },
			{ type: "video_url", video_url: { url: "https://example.com/v.mp4" } },
		]);
	});

	it("normalizes reasoning, tool calls, and usage into IR", () => {
		const response = openAIChatToIR({
			id: "chatcmpl-baseten",
			model: "deepseek-ai/DeepSeek-V4-Pro",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					reasoning_content: "working",
					content: "answer",
					tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: { q: "x" } } }],
				},
				finish_reason: "tool_calls",
			}],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				prompt_tokens_details: { audio_tokens: 3, cached_tokens: 2 },
			},
		}, "request-baseten", "deepseek-ai/DeepSeek-V4-Pro", "baseten");

		expect(response.choices[0]?.message.content[0]).toEqual({ type: "reasoning_text", text: "working" });
		expect(response.choices[0]?.message.toolCalls?.[0]?.arguments).toBe('{"q":"x"}');
		expect(response.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
		expect(response.usage?._ext).toMatchObject({ inputAudioTokens: 3 });
	});
});
