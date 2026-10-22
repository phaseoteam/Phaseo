// OpenAI Chat audio output: `message.audio` ({ id, data, expires_at, transcript }) and its
// `delta.audio` stream pieces are decoded, returned in OpenAI's shape and billed on the
// audio token meters.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import type { PriceCard } from "@pipeline/pricing/types";
import { computeBill } from "@pipeline/pricing/engine";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { bufferStreamToIR, joinBase64Chunks } from "@executors/_shared/text-generate/openai-compat";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

const rule = (meter: string, price: string) => ({
	pricing_plan: "standard",
	meter,
	unit: "token",
	unit_size: 1_000_000,
	price_per_unit: price,
	currency: "USD",
	match: [],
	priority: 100,
});

// gpt-audio per 1M tokens: text $2.50 in / $10 out, audio $32 in / $64 out.
const GPT_AUDIO_CARD = {
	provider: "openai",
	model: "openai/gpt-audio",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		rule("input_text_tokens", "2.5"),
		rule("input_audio_tokens", "32"),
		rule("output_text_tokens", "10"),
		rule("output_audio_tokens", "64"),
	],
} as unknown as PriceCard;

// 60 text + 40 audio tokens in; 50 text + 450 audio tokens out.
const AUDIO_USAGE = {
	prompt_tokens: 100,
	completion_tokens: 500,
	total_tokens: 600,
	prompt_tokens_details: { cached_tokens: 0, audio_tokens: 40, text_tokens: 60 },
	completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 450, text_tokens: 50 },
};
// 60 x 2.5 + 40 x 32 + 50 x 10 + 450 x 64 = 150 + 1,280 + 500 + 28,800 micro-dollars.
const EXPECTED_NANOS = 30_730_000;

function chatArgs(overrides?: Partial<IRChatRequest>): ExecutorExecuteArgs {
	return {
		ir: {
			model: "openai/gpt-audio",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "Say hello" }] }],
			modalities: ["text", "audio"],
			audioConfig: { voice: "alloy", format: "wav" },
			...overrides,
		} as IRChatRequest,
		requestId: "req_chat_audio",
		workspaceId: "team_test",
		providerId: "openai",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: "gpt-audio",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: GPT_AUDIO_CARD,
		meta: {},
	} as unknown as ExecutorExecuteArgs;
}

function pricedNanos(usage: Record<string, any>): number {
	return Number((computeBill(usage, GPT_AUDIO_CARD).pricing as any)?.total_nanos);
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("OpenAI Chat audio output", () => {
	it("sends a non-streaming audio request unstreamed and returns message.audio", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/chat/completions",
			response: jsonResponse({
				id: "chatcmpl_audio_1",
				object: "chat.completion",
				created: 1_760_000_000,
				model: "gpt-audio",
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						refusal: null,
						audio: { id: "audio_abc", data: "UklGRg==", expires_at: 1_760_003_600, transcript: "Hello!" },
					},
					finish_reason: "stop",
				}],
				usage: AUDIO_USAGE,
			}),
		}]);

		const result = await executor(chatArgs());
		mock.restore();

		expect(mock.calls[0]?.bodyJson?.stream).toBe(false);
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("stream_options");
		expect(mock.calls[0]?.bodyJson?.audio).toEqual({ voice: "alloy", format: "wav" });
		expect(mock.calls[0]?.bodyJson?.modalities).toEqual(["text", "audio"]);
		expect(result.kind).toBe("completed");
		if (result.kind !== "completed" || !result.ir) throw new Error("expected a completed result");

		const encoded = encodeOpenAIChatResponse(result.ir as any, "req_chat_audio");
		expect(encoded.choices[0]?.message).toMatchObject({
			audio: { id: "audio_abc", data: "UklGRg==", expires_at: 1_760_003_600, transcript: "Hello!" },
		});
		expect((encoded.choices[0]?.message as any).audios).toBeUndefined();
		expect((encoded.usage as any)?.output_tokens_details?.output_audio).toBe(450);

		expect(result.bill.usage).toMatchObject({ input_audio_tokens: 40, output_audio_tokens: 450 });
		expect(pricedNanos(result.bill.usage as any)).toBe(EXPECTED_NANOS);
	});

	it("keeps streaming audio requests streamed", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/chat/completions",
			response: new Response("data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		}]);
		const result = await executor(chatArgs({ stream: true, audioConfig: { voice: "alloy", format: "pcm16" } } as any));
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(mock.calls[0]?.bodyJson?.stream).toBe(true);
		expect(mock.calls[0]?.bodyJson?.stream_options).toEqual({ include_usage: true });
	});

	it("assembles delta.audio pieces from a stream into one message.audio", async () => {
		const frames = [
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", audio: { id: "audio_s1", transcript: "Hel" } }, finish_reason: null }] },
			// Each piece is base64 on its own: bytes 00 01 and 02 03.
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { audio: { data: "AAE=", transcript: "lo" } }, finish_reason: null }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { audio: { data: "AgM=", expires_at: 1_760_003_600 } }, finish_reason: "stop" }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [], usage: AUDIO_USAGE },
		];
		const upstream = new Response(
			frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n",
			{ headers: { "Content-Type": "text/event-stream" } },
		);

		const { ir, rawResponse } = await bufferStreamToIR(upstream, chatArgs(), "chat", Date.now());

		const encoded = encodeOpenAIChatResponse(ir, "req_chat_audio");
		expect(encoded.choices[0]?.message).toMatchObject({
			audio: { id: "audio_s1", data: "AAECAw==", expires_at: 1_760_003_600, transcript: "Hello" },
		});
		expect(Object.getOwnPropertySymbols(rawResponse.choices[0].message.audio)).toEqual([]);
	});

	it("joins base64 fragments without corrupting padding", () => {
		expect(joinBase64Chunks(["AAEC", "AwQF"])).toBe("AAECAwQF");
		expect(joinBase64Chunks(["AAE=", "AgM="])).toBe("AAECAw==");
		expect(joinBase64Chunks(["AA=="])).toBe("AA==");
	});

	it("bills audio output once, at the audio rate", () => {
		// Usage as the Chat executor meters it: output_text_tokens mirrors the whole output.
		const meters = {
			input_tokens: 100,
			input_text_tokens: 100,
			output_tokens: 500,
			output_text_tokens: 500,
			total_tokens: 600,
			input_audio_tokens: 40,
			output_audio_tokens: 450,
		};
		const priced = computeBill(meters, GPT_AUDIO_CARD);
		const lines = Object.fromEntries(((priced.pricing as any).lines as any[]).map((line) => [line.dimension, line.quantity]));
		expect(lines).toEqual({ input_text_tokens: 60, input_audio_tokens: 40, output_text_tokens: 50, output_audio_tokens: 450 });
		// Before: output_text_tokens kept the 450 audio tokens too, 35,230,000 nanos.
		expect(Number((priced.pricing as any).total_nanos)).toBe(EXPECTED_NANOS);
	});
});
