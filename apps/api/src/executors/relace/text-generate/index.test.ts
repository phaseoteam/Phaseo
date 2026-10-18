import { describe, expect, it } from "vitest";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import {
	irToOpenAIChat,
	openAIChatToIR,
} from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { preprocess } from "./index";

describe("Relace search text contract", () => {
	it("maps the documented model, tools, and sampling parameters to Chat Completions", () => {
		const decoded = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "relace/relace-search",
			messages: [{ role: "user", content: "Find the authentication implementation" }],
			tools: [{
				type: "function",
				function: {
					name: "view_file",
					strict: true,
					parameters: { type: "object", properties: { path: { type: "string" } } },
				},
			}],
			tool_choice: "auto",
			temperature: 1,
			top_p: 0.95,
			top_k: 100,
			repetition_penalty: 1,
			seed: 42,
		}));
		// Routing hands executors the keyed record built from the catalogue list.
		const filtered = preprocess(decoded, {
			capabilityParams: Object.fromEntries(
				["tools", "tool_choice", "temperature", "top_p", "top_k", "repetition_penalty"].map((key) => [key, {}]),
			),
		} as any);
		const wire = irToOpenAIChat(filtered, "relace-search", "relace");

		expect(wire).toMatchObject({
			model: "relace-search",
			tool_choice: "auto",
			temperature: 1,
			top_p: 0.95,
			top_k: 100,
			repetition_penalty: 1,
		});
		expect(wire.tools[0].function.name).toBe("view_file");
		// Preprocessing never filtered in production; routing enforces param support.
		expect(wire.seed).toBe(42);
	});

	it("normalizes Relace tool calls and token usage", () => {
		const response = openAIChatToIR({
			id: "chatcmpl-relace-1",
			object: "chat.completion",
			model: "relace-search",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [{
						id: "call_1",
						type: "function",
						function: { name: "view_file", arguments: '{"path":"/repo/auth.ts"}' },
					}],
				},
				finish_reason: "tool_calls",
			}],
			usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
		}, "req-relace", "relace/relace-search", "relace");

		expect(response.choices[0]?.message.toolCalls?.[0]).toMatchObject({
			id: "call_1",
			name: "view_file",
			arguments: '{"path":"/repo/auth.ts"}',
		});
		expect(response.usage).toMatchObject({ inputTokens: 40, outputTokens: 12, totalTokens: 52 });
	});
});
