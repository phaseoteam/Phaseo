import { describe, expect, it } from "vitest";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { irToOpenAIChat, openAIChatToIR } from "../../transform-chat";

describe("GMI Cloud Chat mapping", () => {
	it("preserves native Qwen reasoning separately from the answer", () => {
		const result = openAIChatToIR({ id: "chat_gmi", model: "Qwen/Qwen3.6-35B-A3B", choices: [{ index: 0, message: { role: "assistant", content: "OK.", reasoning_content: "Check the instruction." }, finish_reason: "stop" }], usage: { prompt_tokens: 13, completion_tokens: 108, total_tokens: 121 } }, "req_gmi", "qwen/qwen3.6-35b-a3b", "gmicloud");
		expect(result.choices[0].message.content).toEqual([
			{ type: "reasoning_text", text: "Check the instruction." },
			{ type: "text", text: "OK." },
		]);
		expect(result.usage).toMatchObject({ inputTokens: 13, outputTokens: 108, totalTokens: 121 });
	});
	it("carries documented EOS and context controls through IR", () => {
		const ir = decodeOpenAIChatRequest({
			model: "deepseek-ai/DeepSeek-V4-Pro",
			messages: [{ role: "user", content: "Hello" }],
			provider_options: {
				gmicloud: {
					ignore_eos: true,
					context_length_exceeded_behavior: "error",
				},
			},
		} as any);

		const request = irToOpenAIChat(ir, "deepseek-ai/DeepSeek-V4-Pro", "gmicloud");
		expect(request.ignore_eos).toBe(true);
		expect(request.context_length_exceeded_behavior).toBe("error");
	});
});
