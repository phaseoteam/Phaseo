// A follow-up Chat request can send an earlier audio response back by id:
// `{ role: "assistant", audio: { id } }`
// (https://platform.openai.com/docs/api-reference/chat/create). The reference
// must survive validation, decoding and normalisation, and reach OpenAI's and
// Azure OpenAI's Chat routes; other providers drop it and report the drop.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatCompletionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { executor } from "@executors/openai/text-generate";
import { normalizeIRForProvider } from "./normalize";
import type { DroppedParam } from "./unsupportedParams";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

// The client sends back the whole message.audio it received; only the id is
// part of the request shape.
const body = {
	model: "openai/gpt-audio",
	modalities: ["text", "audio"],
	audio: { voice: "alloy", format: "wav" },
	messages: [
		{ role: "user", content: "Is a golden retriever a good family dog?" },
		{
			role: "assistant",
			audio: { id: "audio_abc123", data: "UklGRg==", expires_at: 1_760_003_600, transcript: "Yes, they are." },
		},
		{ role: "user", content: "Why do you say they are loyal?" },
	],
};

function decodeAndNormalise(providerId: string) {
	const dropped: DroppedParam[] = [];
	const ir = normalizeIRForProvider(
		decodeOpenAIChatRequest(ChatCompletionsSchema.parse(body) as any),
		providerId,
		"openai.chat.completions",
		{ onDroppedParams: (entries) => dropped.push(...entries) },
	);
	return { ir, dropped };
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("assistant audio references on Chat requests", () => {
	it("validates the request form and strips the response-only fields", () => {
		const parsed = ChatCompletionsSchema.parse(body) as any;
		expect(parsed.messages[1].audio).toEqual({ id: "audio_abc123" });
		expect(ChatCompletionsSchema.safeParse({
			model: "openai/gpt-audio",
			messages: [{ role: "assistant", audio: { transcript: "no id" } }],
		}).success).toBe(false);
	});

	for (const providerId of ["openai", "openai-eu", "azure"]) {
		it(`keeps audio: { id } through decode, IR and the ${providerId} Chat body`, () => {
			const { ir, dropped } = decodeAndNormalise(providerId);
			const payload = irToOpenAIChat(ir, "gpt-audio", providerId, null);

			expect(dropped).toEqual([]);
			expect(ir.messages[1]).toMatchObject({ role: "assistant", audio: { id: "audio_abc123" } });
			expect(payload.messages[1]).toEqual({ role: "assistant", content: null, audio: { id: "audio_abc123" } });
		});
	}

	it("sends the reference to OpenAI's Chat Completions endpoint", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/chat/completions",
			response: jsonResponse({
				id: "chatcmpl_audio_2",
				object: "chat.completion",
				created: 1_760_000_100,
				model: "gpt-audio",
				choices: [{ index: 0, message: { role: "assistant", content: "Because…" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
			}),
		}]);
		const { ir } = decodeAndNormalise("openai");
		await executor({
			ir: { ...ir, stream: false },
			requestId: "req_assistant_audio",
			workspaceId: "team_test",
			providerId: "openai",
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			capability: "text.generate",
			providerModelSlug: "gpt-audio",
			capabilityParams: null,
			byokMeta: [],
			pricingCard: null,
			meta: {},
		} as unknown as ExecutorExecuteArgs);
		mock.restore();

		expect(mock.calls[0]?.bodyJson?.messages?.[1]).toMatchObject({ role: "assistant", audio: { id: "audio_abc123" } });
	});

	it("drops the reference, keeps the message and reports messages.audio elsewhere", () => {
		const { ir, dropped } = decodeAndNormalise("groq");
		const payload = irToOpenAIChat(ir, "llama-4", "groq", null);

		expect(dropped).toEqual([{
			param: "messages.audio",
			reason: "unsupported_by_provider",
			source: "provider_api",
			clientSent: true,
		}]);
		expect(ir.messages).toHaveLength(3);
		expect(ir.messages[1]).not.toHaveProperty("audio");
		expect(payload.messages[1]).not.toHaveProperty("audio");
	});
});
