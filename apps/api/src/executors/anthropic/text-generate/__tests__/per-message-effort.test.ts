import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRChatResponse } from "@core/ir";
import { AnthropicMessagesSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "../../../../protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "../../../../protocols/openai-responses/decode";
import { decodeAnthropicMessagesRequest } from "../../../../protocols/anthropic-messages/decode";
import { encodeOpenAIChatResponse } from "../../../../protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "../../../../protocols/openai-responses/encode";
import { foldEffortMarkersForProvider } from "../../../../pipeline/execute/normalize";
import {
	anthropicEffortRecordForClient,
	irToAnthropicMessages,
	usesAnthropicPerMessageEffort,
} from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../stream-transformer";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";

const MODEL = "claude-opus-5-5";

function reply(effortRecord?: { effort: "low" | "high"; base: "high" }): IRChatResponse {
	return {
		id: "req_1",
		created: 0,
		model: MODEL,
		provider: "anthropic",
		choices: [{
			index: 0,
			message: { role: "assistant", content: [{ type: "text", text: "Plan." }], ...(effortRecord ? { effortRecord } : {}) },
			finishReason: "stop",
		}],
	};
}

function chatRequest(effort: string, history: any[]): IRChatRequest {
	return decodeOpenAIChatRequest({ model: MODEL, reasoning_effort: effort, messages: history } as any);
}

describe("Claude per-message effort on Chat Completions", () => {
	it("changes the effort with a marker and keeps the top-level effort", () => {
		// Turn 1 at high: the reply carries a sealed effort record in reasoning_details.
		const first = irToAnthropicMessages(chatRequest("high", [{ role: "user", content: "Plan it" }]), null, MODEL, { providerId: "anthropic" });
		expect(first.output_config).toEqual({ effort: "high" });
		const record = anthropicEffortRecordForClient(first, "openai.chat.completions");
		expect(record).toEqual({ effort: "high", base: "high" });
		const encoded = encodeOpenAIChatResponse(reply(record as any), "req_1");
		const assistantMessage = encoded.choices[0].message as any;
		expect(assistantMessage.reasoning_details.at(-1)).toMatchObject({ type: "reasoning.encrypted", format: "anthropic-claude-v1" });

		// Turn 2 at low: same top level, one marker after the new user message.
		const history = [
			{ role: "user", content: "Plan it" },
			{ role: "assistant", content: "Plan.", reasoning_details: assistantMessage.reasoning_details },
			{ role: "user", content: "Summarise" },
		];
		const second = irToAnthropicMessages(chatRequest("low", history), null, MODEL, { providerId: "anthropic" });
		expect(second.output_config).toEqual({ effort: "high" });
		expect(second.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "Plan it" }] },
			{ role: "assistant", content: [{ type: "text", text: "Plan." }] },
			{ role: "user", content: [{ type: "text", text: "Summarise" }] },
			{ role: "system", content: [], output_config: { effort: "low" } },
		]);
		expect(usesAnthropicPerMessageEffort(second)).toBe(true);
		expect(anthropicEffortRecordForClient(second, "openai.chat.completions")).toEqual({ effort: "low", base: "high" });
		// The record never reaches the upstream body.
		expect(JSON.stringify(second)).not.toContain("anthropicEffortPlan");
	});

	it("does not send the record to Claude as a thinking block", () => {
		const encoded = encodeOpenAIChatResponse(reply({ effort: "high", base: "high" }), "req_1");
		const history = [
			{ role: "user", content: "Plan it" },
			{ role: "assistant", content: "Plan.", reasoning_details: (encoded.choices[0].message as any).reasoning_details },
			{ role: "user", content: "Again" },
		];
		const payload = irToAnthropicMessages(chatRequest("high", history), null, MODEL, { providerId: "anthropic" });
		expect(payload.messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Plan." }] });
		expect(usesAnthropicPerMessageEffort(payload)).toBe(false);
	});

	it("changes the top-level effort on routes without per-message effort", () => {
		const encoded = encodeOpenAIChatResponse(reply({ effort: "high", base: "high" }), "req_1");
		const history = [
			{ role: "user", content: "Plan it" },
			{ role: "assistant", content: "Plan.", reasoning_details: (encoded.choices[0].message as any).reasoning_details },
			{ role: "user", content: "Summarise" },
		];
		const payload = irToAnthropicMessages(chatRequest("low", history), null, MODEL, { providerId: "azure" });
		expect(payload.output_config).toEqual({ effort: "low" });
		expect(usesAnthropicPerMessageEffort(payload)).toBe(false);
		expect(anthropicEffortRecordForClient(payload, "openai.chat.completions")).toBeUndefined();
	});

	it("keeps a client's late system message in place next to a marker", () => {
		const encoded = encodeOpenAIChatResponse(reply({ effort: "high", base: "high" }), "req_1");
		const history = [
			{ role: "system", content: "Be brief." },
			{ role: "user", content: "Plan it" },
			{ role: "assistant", content: "Plan.", reasoning_details: (encoded.choices[0].message as any).reasoning_details },
			{ role: "user", content: "Summarise" },
			{ role: "system", content: "Answer in French." },
		];
		const payload = irToAnthropicMessages(chatRequest("low", history), null, MODEL, { providerId: "anthropic" });
		expect(payload.system).toBe("Be brief.");
		expect(payload.messages.slice(-2)).toEqual([
			{ role: "system", content: "Answer in French." },
			{ role: "system", content: [], output_config: { effort: "low" } },
		]);
	});
});

describe("Claude per-message effort on Responses", () => {
	it("round-trips the record as the last reasoning item", () => {
		const encoded = encodeOpenAIResponsesResponse(reply({ effort: "high", base: "high" }), "resp_1");
		const effortItem = encoded.output.at(-1) as any;
		expect(effortItem).toMatchObject({ type: "reasoning", id: "rs_effort_resp_1", summary: [], content: [] });
		expect(effortItem.encrypted_content).toMatch(/^phx1\./);

		const ir = decodeOpenAIResponsesRequest({
			model: MODEL,
			reasoning: { effort: "low" },
			input: [
				{ role: "user", content: "Plan it" },
				...encoded.output,
				{ role: "user", content: "Summarise" },
			],
		} as any);
		expect(ir.messages[1]).toMatchObject({ role: "assistant", effortRecord: { effort: "high", base: "high" } });
		const payload = irToAnthropicMessages(ir, null, MODEL, { providerId: "anthropic" });
		expect(payload.output_config).toEqual({ effort: "high" });
		expect(payload.messages.at(-1)).toEqual({ role: "system", content: [], output_config: { effort: "low" } });
	});
});

describe("Claude per-message effort on Messages", () => {
	const body = {
		model: MODEL,
		max_tokens: 1024,
		output_config: { effort: "high" },
		messages: [
			{ role: "user", content: "Plan it" },
			{ role: "assistant", content: "Plan." },
			{ role: "system", content: [], output_config: { effort: "low" } },
			{ role: "user", content: "Summarise" },
		],
	};

	it("accepts an effort-only system message anywhere", () => {
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(AnthropicMessagesSchema.safeParse({
			...body,
			messages: [{ role: "system", content: [], output_config: { effort: "low" } }, ...body.messages],
		}).success).toBe(true);
	});

	it("rejects an effort-only system message with text", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			...body,
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "system", content: "Be brief", output_config: { effort: "low" } },
			],
		});
		expect(parsed.success).toBe(false);
	});

	it("forwards the client's marker as sent on a supported route", () => {
		const ir = decodeAnthropicMessagesRequest(body as any);
		const payload = irToAnthropicMessages(ir, null, MODEL, { providerId: "anthropic" });
		expect(payload.messages[2]).toEqual({ role: "system", content: [], output_config: { effort: "low" } });
		expect(usesAnthropicPerMessageEffort(payload)).toBe(true);
		expect(anthropicEffortRecordForClient(payload, "anthropic.messages")).toBeUndefined();
	});

	it("folds the marker into the top-level effort elsewhere", () => {
		const ir = decodeAnthropicMessagesRequest(body as any);
		const folded = foldEffortMarkersForProvider(ir, "azure", MODEL);
		expect(folded.messages.some((message) => message.role === "system")).toBe(false);
		expect(folded.reasoning?.effort).toBe("low");
		// A supported route keeps it.
		expect(foldEffortMarkersForProvider(ir, "anthropic", MODEL)).toBe(ir);
	});
});

describe("Anthropic stream transformer effort record", () => {
	it("ends the output with the sealed effort item", async () => {
		const events = [
			{ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 1, output_tokens: 0 } } },
			{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
			{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
			{ type: "content_block_stop", index: 0 },
			{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
			{ type: "message_stop" },
		];
		const upstream = new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")).body!;
		const text = await new Response(upstream.pipeThrough(createAnthropicToResponsesStreamTransformer("req_1", MODEL, {
			providerId: "anthropic",
			effortRecord: { effort: "low", base: "high" },
		}))).text();
		const completed = text.split("\n\n").find((frame) => frame.startsWith("event: response.completed"));
		const output = JSON.parse(completed!.split("data: ")[1]).response.output;
		expect(output.at(-1)).toMatchObject({ type: "reasoning", id: "rs_effort_req_1" });
		expect(text).toContain("\"id\":\"rs_effort_req_1\"");
	});
});

describe("Streaming Chat clients", () => {
	it("get the effort record in reasoning_details and can send it back", async () => {
		const events = [
			{ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 1, output_tokens: 0 } } },
			{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
			{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
			{ type: "content_block_stop", index: 0 },
			{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
			{ type: "message_stop" },
		];
		const upstream = new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")).body!;
		const responsesStream = upstream.pipeThrough(createAnthropicToResponsesStreamTransformer("req_1", MODEL, {
			providerId: "anthropic",
			effortRecord: { effort: "high", base: "high" },
		}));
		const chatStream = resolveStreamForProtocol(
			new Response(responsesStream, { headers: { "Content-Type": "text/event-stream" } }),
			{
				ir: { messages: [], model: MODEL, stream: true },
				requestId: "req_1",
				workspaceId: "team_test",
				providerId: "anthropic",
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				byokMeta: [],
				pricingCard: null,
				meta: {},
			} as any,
			"responses",
			{ canonicalResponsesEvents: true },
		);
		const text = await new Response(chatStream).text();
		const details = text.split("\n\n")
			.map((frame) => frame.replace(/^data: /, ""))
			.filter((data) => data.startsWith("{"))
			.flatMap((data) => JSON.parse(data).choices?.flatMap((choice: any) => choice.delta?.reasoning_details ?? []) ?? []);
		expect(details).toHaveLength(1);
		expect(details[0]).toMatchObject({ type: "reasoning.encrypted", format: "anthropic-claude-v1" });

		const ir = chatRequest("low", [
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hi", reasoning_details: details },
			{ role: "user", content: "Shorter" },
		]);
		expect(ir.messages[1]).toMatchObject({ effortRecord: { effort: "high", base: "high" } });
	});
});
