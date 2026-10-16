import { describe, expect, it } from "vitest";
import { irToOpenAIChat } from "../../transform-chat";

describe("Reflection request mapping", () => {
	it.each([undefined, []])("omits parallel tool calls when tools are absent: %j", tools => {
		const request = irToOpenAIChat({ model: "reflection/beam-501b-a23b", stream: false, messages: [], parallelToolCalls: true, tools } as any, "Beam-1.0-501B-A23B", "reflection");
		expect(request.parallel_tool_calls).toBeUndefined();
	});
	it("preserves parallel tool calls when tools are supplied", () => {
		const request = irToOpenAIChat({ model: "reflection/beam-501b-a23b", stream: false, messages: [], parallelToolCalls: true, tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }] } as any, "Beam-1.0-501B-A23B", "reflection");
		expect(request.parallel_tool_calls).toBe(true);
	});
	it("preserves assistant reasoning and tool calls across a tool turn", () => {
		const request = irToOpenAIChat({ model: "reflection/beam-501b-a23b", stream: false, messages: [
			{ role: "assistant", content: [{ type: "reasoning_text", text: "Need a lookup" }], toolCalls: [{ id: "call_1", name: "lookup", arguments: "{}" }] },
			{ role: "tool", toolResults: [{ toolCallId: "call_1", content: "Found" }] },
		] } as any, "Beam-501B-A23B", "reflection");
		expect(request.messages[0]).toMatchObject({ reasoning_content: "Need a lookup", tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: "{}" } }] });
	});
	it.each(["low", "medium", "high", "xhigh", "max"])("preserves effort %s without downgrading", effort => {
		const request = irToOpenAIChat({ model: "reflection/beam-501b-a23b", stream: false, messages: [], reasoning: { effort } } as any, "Beam-501B-A23B", "reflection");
		expect(request.reasoning_effort).toBe(effort);
	});
});
