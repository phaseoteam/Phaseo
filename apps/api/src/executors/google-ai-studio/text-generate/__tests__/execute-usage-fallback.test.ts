import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

function buildArgs(
	overrides?: Partial<IRChatRequest>,
	options?: {
		providerModelSlug?: string;
		endpoint?: string;
		protocol?: string;
	},
): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemma-3-27b:free",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Write a short paragraph." }] }],
		...overrides,
	};
	return {
		ir,
		requestId: "req_google_usage_fallback",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: options?.endpoint ?? "responses",
		protocol: options?.protocol ?? "openai.responses",
		capability: "text.generate",
		providerModelSlug: options?.providerModelSlug ?? "gemma-3-27b-it",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio execute usage fallback", () => {
	it.each(["openai.chat.completions", "openai.responses", "anthropic.messages"])("forwards native output before upstream completion: %s", async protocol => {
		let upstream!: ReadableStreamDefaultController<Uint8Array>;
		const encoder = new TextEncoder();
		const send = (event: unknown) => upstream.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
		const source = new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; } });
		const mock = installFetchMock([{ match: url => url.endsWith("/v1beta/interactions"),
			response: new Response(source, { headers: { "Content-Type": "text/event-stream" } }) }]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.8-flash", stream: true, store: false },
				{ providerModelSlug: "gemini-3.8-flash", protocol }));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ stream: true, store: false });
			expect(result.kind).toBe("stream");
			if (result.kind !== "stream") throw new Error("expected stream");
			send({ event_type: "interaction.created", interaction: { id: "native-stream" } });
			send({ event_type: "step.start", index: 0, step: { type: "model_output" } });
			send({ event_type: "step.delta", index: 0, delta: { type: "text", text: "early-output" } });
			const reader = result.stream.getReader();
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const early = (async () => {
					let text = "";
					for (let i = 0; i < 12 && !text.includes("early-output"); i++) {
						const chunk = await reader.read();
						if (chunk.done) break;
						text += new TextDecoder().decode(chunk.value);
					}
					return text;
				})();
				expect(await Promise.race([early, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("stream buffered until completion")), 1000); })])).toContain("early-output");
				clearTimeout(timer);
				send({ event_type: "step.stop", index: 0 });
				send({ event_type: "interaction.completed", interaction: { status: "completed", usage: { total_input_tokens: 7, total_output_tokens: 3, total_tokens: 10 } } });
				upstream.close();
				let terminal = "";
				while (true) { const chunk = await reader.read(); if (chunk.done) break; terminal += new TextDecoder().decode(chunk.value); }
				expect(terminal).toContain(protocol === "anthropic.messages" ? "message_stop" : protocol === "openai.responses" ? "response.completed" : "[DONE]");
			} finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
		} finally { mock.restore(); }
	});
	it("uses generateContent for explicit cached content", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/models/gemini-2.5-flash:generateContent"),
			response: new Response(JSON.stringify({
				candidates: [{ content: { role: "model", parts: [{ text: "Cached response" }] }, finishReason: "STOP" }],
				usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2, totalTokenCount: 10 },
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		}]);

		const args = buildArgs({
			model: "google/gemini-2.5-flash",
			googleCachedContent: "cachedContents/example",
		}, { providerModelSlug: "gemini-2.5-flash" });
		args.byokMeta = [{
			id: "byok_google_cached_content",
			key: "customer-google-key",
			providerId: "google-ai-studio",
			alwaysUse: true,
		}] as any;
		const result = await executor(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.cachedContent).toBe("cachedContents/example");
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("model");
	});

	it("uses generateContent for active models not supported by Interactions", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/models/gemma-3-27b-it:generateContent"),
			response: new Response(JSON.stringify({
				candidates: [{ content: { role: "model", parts: [{ text: "Gemma response" }] }, finishReason: "STOP" }],
				usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2, totalTokenCount: 8 },
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.contents).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("model");
	});

	it("preserves billable usage when current Gemini Flash models return empty output", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				id: "v1_empty_response",
				status: "completed",
				steps: [],
				usage: { total_input_tokens: 8, total_output_tokens: 0, total_tokens: 8 },
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/gemini-3.6-flash" },
			{ providerModelSlug: "google/gemini-3.6-flash" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir).toBeDefined();
		expect(result.ir?.choices[0]?.message.content).toEqual([]);
		expect(result.ir?.choices[0]?.message.toolCalls ?? []).toEqual([]);
		expect(result.upstream?.status).toBe(200);
		expect(result.bill.usage).toMatchObject({
			input_text_tokens: 8,
			total_tokens: 8,
		});
		expect(result.rawResponse).toMatchObject({
			id: "v1_empty_response",
			usage: { total_input_tokens: 8, total_tokens: 8 },
		});
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("gemini-3.6-flash");
		expect(mock.calls[0]?.bodyJson?.generation_config).toBeUndefined();
	});

	it("streams Interactions tool calls natively without storing the interaction", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response([
				{ event_type: "interaction.created", interaction: { id: "interactions/tool-call" } },
				{ event_type: "step.start", index: 0, step: { type: "function_call", id: "call_datetime", name: "datetime", arguments: {} } },
				{ event_type: "step.delta", index: 0, delta: { type: "arguments_delta", arguments: '{"timezone":"Europe/London"}' } },
				{ event_type: "step.stop", index: 0 },
				{ event_type: "interaction.completed", interaction: { status: "completed", usage: { total_input_tokens: 10, total_output_tokens: 5, total_tokens: 15 } } },
			].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		}]);

		try {
			const result = await executor(buildArgs(
				{
					model: "google/gemini-3.5-flash-lite",
					stream: true,
					tools: [{
						name: "datetime",
						description: "Get the current datetime",
						parameters: { type: "object", properties: { timezone: { type: "string" } } },
					}],
				},
				{ providerModelSlug: "google/gemini-3.5-flash-lite" },
			));

			expect(result.kind).toBe("stream");
			if (result.kind !== "stream") return;
			const body = await new Response(result.stream).text();
			expect(body).toContain("response.created");
			expect(mock.calls[0]?.bodyJson).toMatchObject({ stream: true, store: false });
			expect(body).toContain("call_datetime");
			expect(body).not.toContain("google_empty_response");
		} finally {
			mock.restore();
		}
	});

	it("routes Gemini 2.5 through Interactions", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				candidates: [{
					content: { parts: [{ text: "legacy response" }] },
					finishReason: "STOP",
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/gemini-2.5-flash" },
			{ providerModelSlug: "google/gemini-2.5-flash" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices[0]?.message.content[0]).toEqual({
			type: "text",
			text: "legacy response",
		});
		expect(mock.calls[0]?.bodyJson?.input?.[0]?.type).toBe("user_input");
	});

	it("defaults Gemma 4 to minimal thinking so short output budgets retain a final answer", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				candidates: [{
					content: { parts: [{ text: "OK" }] },
					finishReason: "STOP",
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/gemma-4-26b-a4b:free", maxTokens: 32 },
			{ providerModelSlug: "gemma-4-26b-a4b-it" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.bodyJson?.generation_config).toMatchObject({
			thinking_summaries: "none",
			thinking_level: "minimal",
		});
		expect(mock.calls[0]?.bodyJson?.generation_config).not.toHaveProperty("thinking_budget");
	});

	it("maps explicit Gemma 4 reasoning effort to thinkingLevel instead of thinkingBudget", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				candidates: [{
					content: { parts: [{ text: "OK" }] },
					finishReason: "STOP",
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{
				model: "google/gemma-4-31b:free",
				reasoning: { enabled: true, effort: "minimal", includeThoughts: false },
			},
			{ providerModelSlug: "gemma-4-31b-it" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.bodyJson?.generation_config).toMatchObject({
			thinking_summaries: "none",
			thinking_level: "minimal",
		});
		expect(mock.calls[0]?.bodyJson?.generation_config).not.toHaveProperty("thinking_budget");
	});

	it("does not request thoughts when Gemma 4 reasoning is disabled", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				candidates: [{
					content: { parts: [{ text: "OK" }] },
					finishReason: "STOP",
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{
				model: "google/gemma-4-26b-a4b:free",
				reasoning: { effort: "none", includeThoughts: true },
			},
			{ providerModelSlug: "gemma-4-26b-a4b-it" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.bodyJson?.generation_config).toMatchObject({
			thinking_summaries: "none",
			thinking_level: "minimal",
		});
	});

	it("estimates completion tokens when upstream usage reports prompt-only counts", async () => {
		const payload = {
			id: "v1_usage_fallback",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "This is a generated answer from Gemini." }],
			}],
			usage: {
				total_input_tokens: 552,
				total_output_tokens: 0,
				total_tokens: 552,
			},
		};

		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs({ model: "google/gemini-3.6-flash" }, {
			providerModelSlug: "gemini-3.6-flash",
			endpoint: "interactions",
			protocol: "google.interactions",
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "This is a generated answer from Gemini.",
		});
		expect(result.ir?.usage?.inputTokens).toBe(552);
		expect(result.ir?.usage?.outputTokens ?? 0).toBeGreaterThan(0);
		expect(result.ir?.usage?.totalTokens ?? 0).toBeGreaterThan(552);

		expect(result.bill.usage?.output_text_tokens ?? 0).toBeGreaterThan(0);
	});

	it("retries Lyria transient 5xx failures on the same candidate model", async () => {
		const payload = {
			id: "v1_lyria_retry",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "Recovered after transient upstream failure." }],
			}],
			usage: {
				total_input_tokens: 24,
				total_output_tokens: 11,
				total_tokens: 35,
			},
		};

		let attempts = 0;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: () => {
				attempts += 1;
				if (attempts === 1) {
					return new Response(JSON.stringify({ error: { message: "Internal error encountered." } }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(JSON.stringify(payload), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro-preview" },
			{
				providerModelSlug: "google/lyria-3-pro-preview",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(attempts).toBe(2);
		expect(mock.calls.every((call) => call.bodyJson?.model === "lyria-3-pro-preview")).toBe(true);
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Recovered after transient upstream failure.",
		});
	});

	it("falls back from non-preview Lyria alias to preview candidate model", async () => {
		const payload = {
			id: "v1_lyria_fallback",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "Served by fallback candidate." }],
			}],
			usage: {
				total_input_tokens: 19,
				total_output_tokens: 8,
				total_tokens: 27,
			},
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1beta/models/lyria-3-pro:generateContent"),
				response: new Response(JSON.stringify({ error: { message: "Model not found." } }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
			},
			{
				match: (url) => url.endsWith("/v1beta/interactions"),
				response: new Response(JSON.stringify(payload), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
			},
		]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro" },
			{
				providerModelSlug: "google/lyria-3-pro",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(
			mock.calls.some((call) => call.bodyJson?.model === "lyria-3-pro-preview"),
		).toBe(true);
		expect(result.ir?.model).toBe("lyria-3-pro-preview");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Served by fallback candidate.",
		});
	});

	it("parses Interactions JSON responses into text+audio IR content", async () => {
		const payload = {
			id: "resp_123",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [
					{ type: "text", text: "Verse line one" },
					{
						type: "audio",
						mime_type: "audio/mpeg",
						data: "RkFLRS1NUEczLURBVEE=",
					},
				],
			}],
			usage: {
				total_input_tokens: 21,
				total_output_tokens: 1106,
				total_tokens: 1127,
			},
		};

		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-clip-preview" },
			{
				providerModelSlug: "google/lyria-3-clip-preview",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(mock.calls.some((call) => call.bodyJson?.stream)).toBe(false);
		expect(result.ir?.nativeId).toBe("resp_123");
		expect(result.ir?.choices?.[0]?.finishReason).toBe("stop");
		expect(result.ir?.choices?.[0]?.message?.content).toEqual([
			{ type: "text", text: "Verse line one" },
			{
				type: "audio",
				source: "data",
				data: "RkFLRS1NUEczLURBVEE=",
				format: "mp3",
			},
		]);
		expect(result.ir?.usage?.totalTokens).toBe(1127);
	});
});
