// Regressions found by live tool loops on 2026-11-13.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { execute as executeTogether } from "@executors/together/text-generate";
import { irToOpenAIResponses } from "../transform";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

// Together's gpt-oss stream, as captured: the second parallel call has no id and no name.
function togetherStream(): string {
	const chunk = (delta: any, finish: string | null = null) => `data: ${JSON.stringify({ id: "t1", object: "chat.completion.chunk", created: 1, model: "openai/gpt-oss-120b", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
	return [
		chunk({ role: "assistant", reasoning_content: "D1 and E2." }),
		chunk({ tool_calls: [{ index: 0, id: "call_real", type: "function", function: { name: "lookup_shelf", arguments: "" } }] }),
		chunk({ tool_calls: [{ index: 0, function: { arguments: "{\"shelf\":\"D1\"}" } }] }),
		chunk({ tool_calls: [{ index: 1, function: { arguments: "{\"shelf\":\"E2\"}" } }] }),
		chunk({}, "tool_calls"),
		"data: [DONE]\n\n",
	].join("");
}

async function runTogether(stream: boolean) {
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async () => new Response(togetherStream(), { headers: { "Content-Type": "text/event-stream" } })) as any;
	try {
		const ir = decodeOpenAIChatRequest({
			model: "openai/gpt-oss-120b",
			stream,
			messages: [{ role: "user", content: "Look up D1 and E2." }],
			tools: [{ type: "function", function: { name: "lookup_shelf", parameters: { type: "object", properties: { shelf: { type: "string" } } } } }],
		} as any);
		return await executeTogether({
			ir, protocol: "openai.chat.completions", endpoint: "chat.completions", requestId: "req_t", workspaceId: "w", providerId: "together",
			providerModelSlug: "openai/gpt-oss-120b", capability: "text.generate", byokMeta: [], pricingCard: null, meta: {},
		} as any) as any;
	} finally {
		globalThis.fetch = realFetch;
	}
}

describe("Together gpt-oss parallel calls without an id or name", () => {
	it("buffered replies give every call an id and the only tool's name", async () => {
		const result = await runTogether(false);
		const calls = (encodeOpenAIChatResponse(result.ir, "req_t") as any).choices[0].message.tool_calls;
		expect(calls.map((call: any) => [call.id, call.function.name])).toEqual([
			["call_real", "lookup_shelf"],
			["call_req_t_0_1", "lookup_shelf"],
		]);
	});

	it("streamed Chat gives the first delta of every call an id and the only tool's name", async () => {
		const result = await runTogether(true);
		const text = await new Response(result.stream).text();
		const starts = text.split("\n\n")
			.filter((block) => block.startsWith("data: {"))
			.flatMap((block) => JSON.parse(block.slice(6)).choices?.[0]?.delta?.tool_calls ?? [])
			.filter((call: any) => call.id);
		expect(starts.map((call: any) => [call.index, call.id, call.function?.name])).toEqual([
			[0, "call_real", "lookup_shelf"],
			[1, "call_req_t_0_1", "lookup_shelf"],
		]);
	});
});

describe("DeepSeek streamed Responses reasoning", () => {
	it("goes back as reasoning_text although the item carries DeepSeek's own unsealed encrypted_content", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "deepseek/deepseek-v4-pro-0813",
			tools: [{ type: "function", name: "lookup_shelf", parameters: { type: "object", properties: {} } }],
			input: [
				{ role: "user", content: "Look up D1." },
				{ type: "reasoning", id: "9c7f", summary: [], content: [{ type: "reasoning_text", text: "Call lookup_shelf for D1." }], encrypted_content: "9c7f-0" },
				{ type: "function_call", call_id: "call_1", name: "lookup_shelf", arguments: "{\"shelf\":\"D1\"}" },
				{ type: "function_call_output", call_id: "call_1", output: "7 crates" },
			],
		} as any);
		const body: any = irToOpenAIResponses(ir, "deepseek-v4-pro", "deepseek");
		expect(body.input.filter((item: any) => item.type === "reasoning")).toEqual([
			{ type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: "Call lookup_shelf for D1." }] },
		]);
	});

});
