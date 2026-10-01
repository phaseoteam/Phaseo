import { describe, expect, it } from "vitest";
import { vertexOpenModelQuirks } from "../../providers/google-vertex/quirks";
import { irToOpenAIChat, openAIChatToIR } from "../../transform-chat";

const base = { model: "test", messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Hi" }] }] };

describe("Vertex managed open models", () => {
	it.each([
		["deepseek-ai/deepseek-v3.2-maas", { enabled: true }, { chat_template_kwargs: { thinking: true } }],
		["zai-org/glm-4.7-maas", { enabled: false }, { chat_template_kwargs: { enable_thinking: false } }],
		["openai/gpt-oss-120b-maas", { effort: "high" }, { reasoning_effort: "high" }],
	])("maps native thinking for %s", (model, reasoning, expected) => {
		expect(irToOpenAIChat({ ...base, reasoning } as any, model, "google-vertex")).toMatchObject(expected);
	});
	it("rejects unsupported thinking controls before dispatch", () => {
		expect(() => irToOpenAIChat({ ...base, reasoning: { enabled: false } }, "minimaxai/minimax-m2-maas", "google-vertex")).toThrow("reasoning.enabled");
		expect(() => irToOpenAIChat({ ...base, reasoning: { maxTokens: 200 } }, "zai-org/glm-4.7-maas", "google-vertex")).toThrow("reasoning.max_tokens");
	});
	it("preserves reasoning, tool calls and cached usage in completed responses", () => {
		const ir = openAIChatToIR({ id: "completion", choices: [{ index: 0, finish_reason: "tool_calls", message: { content: "Answer", reasoning_content: "Reason", tool_calls: [{ id: "call", type: "function", function: { name: "lookup", arguments: "{}" } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4 } } }, "request", "test", "google-vertex");
		expect(ir.choices[0].message.content).toEqual(expect.arrayContaining([{ type: "reasoning_text", text: "Reason" }, { type: "text", text: "Answer" }]));
		expect(ir.choices[0].message.toolCalls?.[0].name).toBe("lookup");
		expect(ir.usage?.inputTokens).toBe(10);
	});
	it("parses fragmented MiniMax thinking without leaking native tags", () => {
		const accumulated: any = {};
		let content = "", reasoning = "";
		for (const [index, text] of ["<thi", "nk>Reason", "</thi", "nk>Answer"].entries()) {
			const chunk: any = { model: "minimaxai/minimax-m2-maas", choices: [{ index: 0, delta: { content: text }, finish_reason: index === 3 ? "stop" : null }] };
			vertexOpenModelQuirks.transformStreamChunk?.({ chunk, accumulated });
			content += chunk.choices[0].delta.content ?? "";
			reasoning += chunk.choices[0].delta.reasoning_content ?? "";
		}
		expect(content).toBe("Answer");
		expect(reasoning).toBe("Reason");
	});
});
