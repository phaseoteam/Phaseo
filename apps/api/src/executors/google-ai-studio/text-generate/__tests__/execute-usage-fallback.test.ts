import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { interactionSseEvents, interactionSseResponse } from "./interactions-sse";
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
	it.each([false, true])("forwards native Gemini Priority and preserves its Standard downgrade (stream=%s)", async (stream) => {
		const payload = {
			candidates: [{ index: 0, content: { role: "model", parts: [{ text: "OK" }] }, finishReason: "STOP" }],
			usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2, totalTokenCount: 8 },
		};
		const mock = installFetchMock([{
			match: (url) => url.includes("/models/gemini-4-argon:"),
			response: stream
				? new Response(`data: ${JSON.stringify(payload)}\r\n\r\n`, { headers: { "Content-Type": "text/event-stream", "x-gemini-service-tier": "standard" } })
				: new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", "x-gemini-service-tier": "standard" } }),
		}]);
		try {
			const args = buildArgs({ model: "google/gemini-4-argon", serviceTier: "priority", stream }, { providerModelSlug: "gemini-4-argon", endpoint: "chat.completions", protocol: "openai.chat.completions" });
			args.capabilityParams = { params: ["max_tokens", "service_tier"] };
			const result = await executor(args);
			expect(mock.calls[0].bodyJson.serviceTier).toBe("priority");
			if (result.kind === "stream" && result.stream) {
				const output = await new Response(result.stream).text();
				expect(output).toContain('"service_tier":"standard"');
				expect(output).toContain('"content":"OK"');
			} else if (result.kind === "completed") {
				expect(result.ir?.usage?.serviceTier).toBe("standard");
				expect(result.bill?.usage?.service_tier).toBe("standard");
			} else throw new Error("Expected a successful Gemini response");
		} finally { mock.restore(); }
	});

	it("preserves an Interactions downgrade for a Flash Lite response", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: new Response(interactionSseEvents({ id: "interactions/downgrade", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "OK" }] }], usage: { total_input_tokens: 6, total_output_tokens: 2, total_tokens: 8 } }).join(""), { headers: { "Content-Type": "text/event-stream", "x-gemini-service-tier": "standard" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.1-flash-lite", stream: true, serviceTier: "priority" }, { providerModelSlug: "gemini-3.1-flash-lite", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			expect(mock.calls[0].bodyJson.service_tier).toBe("priority");
			expect(mock.calls[0].bodyJson.stream).toBe(true);
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			expect(await new Response(result.stream).text()).toContain('"service_tier":"standard"');
			// A stream is billed from Google's own usage, through the finalizer.
			expect((await result.usageFinalizer?.())?.usage?.service_tier).toBe("standard");
		} finally { mock.restore(); }
	});

	it.each([
		["chat.completions", "openai.chat.completions"],
		["responses", "openai.responses"],
	])("preserves native Gemini output through the public executor for %s", async (endpoint, protocol) => {
		const payloads = [
			{
				candidates: [{ index: 0, content: { role: "model", parts: [{ text: "OK" }] } }],
			},
			{
				candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: "STOP" }],
				usageMetadata: { promptTokenCount: 36, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 44 },
			},
		];
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const payload of payloads) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\r\n\r\n`));
				}
				controller.close();
			},
		});
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse"),
			response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-4-argon", stream: true }, {
				providerModelSlug: "gemini-4-argon", endpoint, protocol,
			}));
			expect(result.kind).toBe("stream");
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected a Gemini stream");
			const output = await new Response(result.stream).text();
			expect(output).toContain('"OK"');
			expect(output).not.toContain("google_empty_response");
			expect(output).toContain('"reasoning_tokens":3');
			// The stream is billed from the upstream usageMetadata, thoughts included.
			expect(result.usageFinalizerAuthoritative).toBe(true);
			const finalized = await result.usageFinalizer?.();
			expect(finalized?.usage).toMatchObject({ input_tokens: 36, output_tokens: 8, reasoning_tokens: 3 });
			if (protocol === "openai.chat.completions") {
				expect(output).toContain('"finish_reason":"stop"');
				expect(output).toContain('"prompt_tokens":36');
				// candidatesTokenCount (5) + thoughtsTokenCount (3), as totalTokenCount (44) implies.
				expect(output).toContain('"completion_tokens":8');
				expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
			} else {
				expect(output).toContain("event: response.completed");
				expect(output).not.toContain("event: response.failed");
			}
		} finally {
			mock.restore();
		}
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

	it("streams Interactions output as Google sends it, not after the whole answer", async () => {
		const encoder = new TextEncoder();
		const events = interactionSseEvents({
			id: "interactions/live",
			status: "completed",
			steps: [{ type: "model_output", content: [{ type: "text", text: "first " }, { type: "text", text: "second" }] }],
			usage: { total_input_tokens: 6, total_output_tokens: 2, total_tokens: 8 },
		});
		// Google sends the events up to the first text delta, then waits.
		const firstText = events.findIndex((event) => event.includes('"text":"first "'));
		let releaseRest: () => void = () => {};
		const restReleased = new Promise<void>((resolve) => { releaseRest = resolve; });
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				for (const event of events.slice(0, firstText + 1)) controller.enqueue(encoder.encode(event));
				await restReleased;
				for (const event of events.slice(firstText + 1)) controller.enqueue(encoder.encode(event));
				controller.close();
			},
		});
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.1-flash-lite", stream: true }, { providerModelSlug: "gemini-3.1-flash-lite", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			// The executor returned while Google was still generating, with the first text ready.
			const reader = result.stream.getReader();
			let received = "";
			while (!received.includes("first ")) {
				const { done, value } = await reader.read();
				if (done) break;
				received += new TextDecoder().decode(value);
			}
			expect(received).toContain('"content":"first "');
			expect(received).not.toContain("second");
			releaseRest();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				received += new TextDecoder().decode(value);
			}
			expect(received).toContain('"content":"second"');
		} finally { mock.restore(); }
	});

	it("returns an empty streamed Interactions answer as empty, so routing can fail over", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: interactionSseResponse({ id: "interactions/empty", status: "completed", steps: [], usage: { total_input_tokens: 8, total_output_tokens: 0, total_tokens: 8 } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.6-flash", stream: true }, { providerModelSlug: "gemini-3.6-flash", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.ir?.choices[0]?.message.content).toEqual([]);
			// Google still billed the input.
			expect(result.bill.usage).toMatchObject({ input_text_tokens: 8 });
		} finally { mock.restore(); }
	});

	it("bills a streamed answer from its text when Google reports no output tokens", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: interactionSseResponse({
				id: "interactions/prompt-only-usage",
				status: "completed",
				steps: [{ type: "model_output", content: [{ type: "text", text: "x".repeat(40) }] }],
				usage: { total_input_tokens: 6, total_output_tokens: 0, total_tokens: 6 },
			}),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.6-flash", stream: true }, { providerModelSlug: "gemini-3.6-flash", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			const body = await new Response(result.stream).text();
			// 40 characters is about 10 tokens, as the buffered fallback estimates.
			expect(body).toContain('"completion_tokens":10');
			expect((await result.usageFinalizer?.())?.usage).toMatchObject({ input_text_tokens: 6, output_text_tokens: 10 });
		} finally { mock.restore(); }
	});

	it.each([
		["responses", "openai.responses"],
		["messages", "anthropic.messages"],
	])("passes a %s client's cancel back to Google", async (endpoint, protocol) => {
		const encoder = new TextEncoder();
		const events = interactionSseEvents({
			id: "interactions/cancel-protocol",
			status: "completed",
			steps: [{ type: "model_output", content: Array.from({ length: 50 }, (_, i) => ({ type: "text", text: `part ${i} ` })) }],
			usage: { total_input_tokens: 6, total_output_tokens: 50, total_tokens: 56 },
		});
		let pulled = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pulled >= events.length) return controller.close();
				controller.enqueue(encoder.encode(events[pulled++]));
			},
			cancel() { cancelled = true; },
		}, { highWaterMark: 0 });
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.6-flash", stream: true }, { providerModelSlug: "gemini-3.6-flash", endpoint, protocol }));
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			const reader = result.stream.getReader();
			await reader.read();
			await reader.cancel("client left");
			expect(cancelled).toBe(true);
		} finally { mock.restore(); }
	});

	it("passes a client cancel back to Google and reads only as the client does", async () => {
		const encoder = new TextEncoder();
		const events = interactionSseEvents({
			id: "interactions/cancel",
			status: "completed",
			steps: [{ type: "model_output", content: Array.from({ length: 50 }, (_, i) => ({ type: "text", text: `part ${i} ` })) }],
			usage: { total_input_tokens: 6, total_output_tokens: 50, total_tokens: 56 },
		});
		let pulled = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pulled >= events.length) return controller.close();
				controller.enqueue(encoder.encode(events[pulled++]));
			},
			cancel() { cancelled = true; },
		}, { highWaterMark: 0 });
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.6-flash", stream: true }, { providerModelSlug: "gemini-3.6-flash", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			const reader = result.stream.getReader();
			await reader.read();
			// The client has read one chunk; the gateway has not drained Google's stream.
			expect(pulled).toBeLessThan(events.length / 2);
			await reader.cancel("client left");
			expect(cancelled).toBe(true);
		} finally { mock.restore(); }
	});

	it("keeps function-call arguments sent whole on the start event", async () => {
		const sse = [
			`data: ${JSON.stringify({ event_type: "step.start", index: 0, step: { type: "function_call", id: "call_1", name: "datetime", arguments: { timezone: "UTC" } } })}\n\n`,
			`data: ${JSON.stringify({ event_type: "step.stop", index: 0 })}\n\n`,
			`data: ${JSON.stringify({ event_type: "interaction.completed", interaction: { id: "interactions/start-args", status: "requires_action", usage: { total_input_tokens: 5, total_output_tokens: 3, total_tokens: 8 } } })}\n\n`,
		].join("");
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: new Response(sse, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor(buildArgs({ model: "google/gemini-3.6-flash", stream: true }, { providerModelSlug: "gemini-3.6-flash", endpoint: "chat.completions", protocol: "openai.chat.completions" }));
			if (result.kind !== "stream" || !result.stream) throw new Error("Expected an Interactions stream");
			const body = await new Response(result.stream).text();
			expect(body).toContain('"arguments":"{\\"timezone\\":\\"UTC\\"}"');
			expect(body).toContain('"finish_reason":"tool_calls"');
		} finally { mock.restore(); }
	});

	it("does not transform an Interactions tool-call stream twice", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions?alt=sse"),
			response: interactionSseResponse({
				id: "interactions/tool-call",
				status: "requires_action",
				steps: [{
					type: "function_call",
					id: "call_datetime",
					name: "datetime",
					arguments: { timezone: "Europe/London" },
				}],
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
			expect(body.match(/event: response\.created/g)).toHaveLength(1);
			expect(body).toContain("call_datetime");
			expect(body).toContain("Europe/London");
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
