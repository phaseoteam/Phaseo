import { describe, expect, it, vi } from "vitest";
import { createAgent } from "../agent";
import { AgentGatewayError } from "../errors";
import { createGatewayAgentClient } from "./gateway-client";
import { Phaseo } from "@phaseo/sdk";

describe("createGatewayAgentClient", () => {
	it("reads gateway event headers through the real SDK stream parser", async () => {
		const frames = 'event: response.reasoning_text.delta\ndata: {"delta":"Owned thought"}\n\nevent: response.output_text.delta\ndata: {"delta":"Owned answer"}\n\nevent: response.function_call_arguments.delta\ndata: {"delta":"{}"}\n\nevent: response.completed\ndata: {"response":{"output":[]}}\n\n';
		const sdk = new Phaseo({ apiKey: "owned-key", fetchImpl: async () => new Response(frames, { headers: { "content-type": "text/event-stream" } }) } as any);
		const client = createGatewayAgentClient({ client: sdk });
		const events = [];
		for await (const event of client.stream!({ agentId: "owned", messages: [], tools: [], context: undefined })) events.push(event);
		expect(events.filter(event => event.type === "response.output_text.delta")).toEqual([expect.objectContaining({ delta: "Owned answer" })]);
		expect(events).toContainEqual(expect.objectContaining({ type: "response.reasoning.delta", delta: "Owned thought" }));
	});
	it("maps user text and images to Responses multimodal parts", async () => {
		const create = vi.fn(async () => ({ id: "owned-image", output: [] }));
		const client = createGatewayAgentClient({ client: { responses: { create } } as any });
		await client.generate({ agentId: "images", model: "owned", messages: [{ role: "user", content: [{ type: "text", text: "Describe" }, { type: "image_url", image_url: { url: "data:image/png;base64,YWJj" } }] }], tools: [], context: undefined });
		expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Describe" }, { type: "input_image", image_url: "data:image/png;base64,YWJj" }] }] }));
	});
	it("passes current Responses fields through while protecting agent-owned fields", async () => {
		const create = vi.fn(async () => ({ id: "resp_1", output: [] }));
		const client = createGatewayAgentClient({
			client: { responses: { create } } as any,
			requestOptions: {
				model: "must-not-win",
				input: "must-not-win",
				service_tier: "priority",
				session_id: "session_123",
				store: true,
				top_p: 0.8,
				truncation: "auto",
			},
		});

		await client.generate({
			agentId: "docs-agent",
			model: "openai/gpt-5.4-nano",
			messages: [{ role: "user", content: "Hello" }],
			tools: [],
			context: undefined,
		});

		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			model: "openai/gpt-5.4-nano",
			input: [{ type: "message", role: "user", content: "Hello" }],
			service_tier: "priority",
			session_id: "session_123",
			store: true,
			top_p: 0.8,
			truncation: "auto",
		}));
	});

	it("serializes assistant tool calls and tool outputs into Responses input items", async () => {
		const create = vi.fn(async () => ({
			id: "resp_123",
			model: "phaseo/free",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Done" }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		await client.generate({
			agentId: "docs-agent",
			instructions: "Use tools when helpful.",
			messages: [
				{ role: "system", content: "System prompt" },
				{ role: "user", content: "Find the docs page." },
				{
					role: "assistant",
					content: "",
					toolCalls: [
						{
							id: "call_1",
							name: "lookup-docs",
							input: { slug: "presets" },
						},
					],
				},
				{
					role: "tool",
					name: "lookup-docs",
					toolCallId: "call_1",
					content: '{"slug":"presets"}',
				},
			],
			tools: [{ id: "lookup-docs", description: "Look up docs." }],
			context: undefined,
		});

		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				instructions: "Use tools when helpful.\n\nSystem prompt",
				input: [
					{
						type: "message",
						role: "user",
						content: "Find the docs page.",
					},
					{
						type: "message",
						role: "assistant",
						content: "",
						tool_calls: [
							{
								id: "call_1",
								type: "function",
								function: {
									name: "lookup-docs",
									arguments: '{"slug":"presets"}',
								},
							},
						],
					},
					{
						type: "function_call_output",
						call_id: "call_1",
						output: '{"slug":"presets"}',
					},
				],
			}),
		);
	});

	it("extracts tool calls from Responses function_call items", async () => {
		const create = vi.fn(async () => ({
			id: "resp_123",
			model: "phaseo/free",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "" }],
				},
				{
					type: "function_call",
					call_id: "call_1",
					name: "lookup-docs",
					arguments: '{"slug":"presets"}',
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		const response = await client.generate({
			agentId: "docs-agent",
			messages: [{ role: "user", content: "Find the docs page." }],
			tools: [{ id: "lookup-docs", description: "Look up docs." }],
			context: undefined,
		});

		expect(response.message.toolCalls).toEqual([
			{
				id: "call_1",
				name: "lookup-docs",
				input: { slug: "presets" },
			},
		]);
	});

	it("passes gateway-native request defaults through the adapter", async () => {
		const create = vi.fn(async () => ({
			id: "resp_456",
			model: "phaseo/free",
			meta: {
				throughput_tps: 12.5,
				routing: {
					selected_provider: "openai",
				},
				plugin_executions: [
					{
						id: "response-healing",
						status: "skipped",
					},
				],
			},
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: '{"ok":true}' }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
			responseFormat: {
				type: "json_schema",
				name: "agent_step",
				schema: {
					type: "object",
					properties: {
						ok: { type: "boolean" },
					},
					required: ["ok"],
					additionalProperties: false,
				},
			},
			plugins: [{ id: "response-healing" }],
			includeMeta: true,
			webSearchOptions: { search_context_size: "high" },
			providerOptions: {
				openai: {
					context_management: {
						type: "compaction",
						compact_threshold: 0.7,
					},
				},
			},
			promptCacheKey: "agent-step-cache",
		});

		const response = await client.generate({
			agentId: "structured-agent",
			messages: [{ role: "user", content: "Return valid JSON." }],
			tools: [],
			context: undefined,
		});

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				response_format: expect.objectContaining({
					type: "json_schema",
					name: "agent_step",
				}),
				meta: true,
				plugins: [{ id: "response-healing" }],
				web_search_options: { search_context_size: "high" },
				provider_options: {
					openai: {
						context_management: {
							type: "compaction",
							compact_threshold: 0.7,
						},
					},
				},
				prompt_cache_key: "agent-step-cache",
			}),
		);
		expect(response.responseMeta).toEqual({
			throughput_tps: 12.5,
			routing: {
				selected_provider: "openai",
			},
			plugin_executions: [
				{
					id: "response-healing",
					status: "skipped",
				},
			],
		});
	});

	it("uses an adapter-level preset alias when no explicit model is supplied", async () => {
		const create = vi.fn(async () => ({
			id: "resp_preset_1",
			model: "@support-triage",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Done" }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
			preset: "support-triage",
		});

		await client.generate({
			agentId: "support-agent",
			messages: [{ role: "user", content: "Triage this ticket." }],
			tools: [],
			context: undefined,
		});

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "@support-triage",
			}),
		);
	});

	it("surfaces the gateway-native response id when the Responses payload includes it", async () => {
		const create = vi.fn(async () => ({
			id: "req_123",
			nativeResponseId: "resp_native_123",
			model: "phaseo/free",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Done" }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		const response = await client.generate({
			agentId: "native-id-agent",
			messages: [{ role: "user", content: "Reply once." }],
			tools: [],
			context: undefined,
		});

		expect(response.requestId).toBe("req_123");
		expect(response.nativeResponseId).toBe("resp_native_123");
	});

	it("merges local runtime tools with gateway-native upstream tools and tool choice", async () => {
		const create = vi.fn(async () => ({
			id: "resp_789",
			model: "phaseo/free",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Search-backed answer" }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
			gatewayTools: [
				{
					type: "gateway:web_search",
					parameters: { max_results: 5 },
				},
			] as any,
			toolChoice: "gateway:web_search" as any,
		});

		await client.generate({
			agentId: "research-agent",
			messages: [{ role: "user", content: "Research this topic." }],
			tools: [{ id: "lookup-docs", description: "Look up docs." }],
			context: undefined,
		});

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				tool_choice: "gateway:web_search",
				tools: [
					{
						type: "function",
						function: {
							name: "lookup-docs",
							description: "Look up docs.",
							parameters: {
								type: "object",
								additionalProperties: true,
							},
						},
					},
					{
						type: "gateway:web_search",
						parameters: { max_results: 5 },
					},
				],
			}),
		);
	});

	it("passes explicit local tool parameter schemas through to Responses function tools", async () => {
		const create = vi.fn(async () => ({
			id: "resp_schema_1",
			model: "phaseo/free",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Done" }],
				},
			],
		}));
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		await client.generate({
			agentId: "schema-agent",
			messages: [{ role: "user", content: "Lookup docs for presets." }],
			tools: [
				{
					id: "lookup-docs",
					description: "Look up docs by slug.",
					parameters: {
						type: "object",
						required: ["slug"],
						properties: {
							slug: { type: "string" },
						},
						additionalProperties: false,
					},
				},
			],
			context: undefined,
		});

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [
					{
						type: "function",
						function: {
							name: "lookup-docs",
							description: "Look up docs by slug.",
							parameters: {
								type: "object",
								required: ["slug"],
								properties: {
									slug: { type: "string" },
								},
								additionalProperties: false,
							},
						},
					},
				],
			}),
		);
	});

	it("wraps structured gateway HTTP failures with request and routing diagnostics", async () => {
		const create = vi.fn(async () => {
			throw Object.assign(
				new Error("Request failed: 403 Forbidden"),
				{
					name: "PhaseoHttpError",
					status: 403,
					statusText: "Forbidden",
					headers: {
						"x-request-id": "req_gateway_error_1",
					},
					body: {
						message: "Guardrail blocked the request",
						reason: "workspace_policy_blocked",
						generation_id: "gen_gateway_error_1",
						provider_failure_diagnostics: {
							category: "provider_access_missing",
							hint: "Check provider credentials",
						},
						routing_diagnostics: {
							filterStages: [
								{
									stage: "workspace_policy",
									beforeCount: 4,
									afterCount: 0,
								},
							],
						},
					},
				},
			);
		});
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		await expect(
			client.generate({
				agentId: "support-agent",
				messages: [{ role: "user", content: "Triage this blocked request." }],
				tools: [],
				context: undefined,
			}),
		).rejects.toMatchObject({
			name: "AgentGatewayError",
			status: 403,
			statusText: "Forbidden",
			requestId: "req_gateway_error_1",
			generationId: "gen_gateway_error_1",
			reason: "workspace_policy_blocked",
			providerFailureDiagnostics: {
				category: "provider_access_missing",
				hint: "Check provider credentials",
			},
			routingDiagnostics: {
				filterStages: [
					{
						stage: "workspace_policy",
						beforeCount: 4,
						afterCount: 0,
					},
				],
			},
		});
	});

	it("wraps plain-text gateway HTTP failures and preserves header request ids", async () => {
		const create = vi.fn(async () => {
			throw Object.assign(
				new Error("Request failed: 429 Too Many Requests - try again later"),
				{
					name: "PhaseoHttpError",
					status: 429,
					statusText: "Too Many Requests",
					headers: {
						"request-id": "req_gateway_error_2",
					},
					body: "try again later",
				},
			);
		});
		const client = createGatewayAgentClient({
			client: {
				responses: {
					create,
				},
			} as any,
		});

		try {
			await client.generate({
				agentId: "rate-limit-agent",
				messages: [{ role: "user", content: "Retry this later." }],
				tools: [],
				context: undefined,
			});
		} catch (error) {
			expect(error).toBeInstanceOf(AgentGatewayError);
			expect(error).toMatchObject({
				status: 429,
				statusText: "Too Many Requests",
				requestId: "req_gateway_error_2",
				body: "try again later",
			});
			expect((error as AgentGatewayError).message).toContain("429 Too Many Requests");
			return;
		}

		throw new Error("Expected gateway client to throw an AgentGatewayError");
	});

	it("normalizes provider output into typed items while preserving raw data", async () => {
		const rawMessage = { id: "msg_1", type: "message", content: [{ type: "output_text", text: "Ready" }] };
		const rawReasoning = { id: "reason_1", type: "reasoning", summary: [{ text: "Checked the request" }] };
		const rawCall = { id: "item_1", type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"slug":"start"}' };
		const client = createGatewayAgentClient({
			client: { responses: { create: vi.fn(async () => ({ id: "resp_1", output: [rawMessage, rawReasoning, rawCall] })) } } as any,
		});

		const response = await client.generate({
			agentId: "typed-items",
			messages: [{ role: "user", content: "Start" }],
			tools: [],
			context: undefined,
		});

		expect(response.items).toEqual([
			expect.objectContaining({ type: "message", id: "msg_1", content: "Ready", rawProviderItem: rawMessage }),
			expect.objectContaining({ type: "reasoning", id: "reason_1", text: "Checked the request", rawProviderItem: rawReasoning }),
			expect.objectContaining({ type: "tool_call", id: "item_1", toolCallId: "call_1", name: "lookup", input: { slug: "start" }, rawProviderItem: rawCall }),
		]);
	});

	it("streams only text and reasoning deltas as text, and items once they are done", async () => {
		const call = { id: "fc_1", type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"slug":"start"}', status: "completed" };
		// The frames the gateway sends for a turn with a tool call, reasoning and text.
		async function* frames() {
			yield { type: "response.created", response: { id: "resp_stream" } };
			yield { type: "response.output_item.added", output_index: 0, item: { ...call, arguments: "", status: "in_progress" } };
			yield { type: "response.function_call_arguments.delta", output_index: 0, delta: '{"slug":' };
			yield { type: "response.function_call_arguments.delta", output_index: 0, delta: '"start"}' };
			yield { type: "response.function_call_arguments.done", output_index: 0, arguments: call.arguments };
			yield { type: "response.output_item.done", output_index: 0, item: call };
			yield { type: "response.reasoning_summary_text.delta", output_index: 1, delta: "Checking" };
			yield { type: "response.reasoning_summary_text.done", output_index: 1, text: "Checking" };
			yield { type: "response.output_text.delta", output_index: 2, delta: "Hello " };
			yield { type: "response.output_text.delta", output_index: 2, delta: "there" };
			yield { type: "response.output_text.done", output_index: 2, text: "Hello there" };
			yield { type: "response.content_part.done", output_index: 2, part: { type: "output_text", text: "Hello there" } };
			yield { type: "response.completed", response: { id: "resp_stream", output: [call, { type: "message", content: [{ type: "output_text", text: "Hello there" }] }] } };
		}
		const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(async () => frames()) } } as any });

		const events: any[] = [];
		for await (const event of client.stream!({ agentId: "stream", messages: [{ role: "user", content: "Hi" }], tools: [], context: undefined })) events.push(event);

		expect(events.filter((event) => event.type === "response.output_text.delta").map((event) => event.delta).join("")).toBe("Hello there");
		expect(events.filter((event) => event.type === "response.reasoning.delta").map((event) => event.delta)).toEqual(["Checking"]);
		expect(events.filter((event) => event.type === "response.item").map((event) => event.item)).toEqual([
			expect.objectContaining({ type: "tool_call", toolCallId: "call_1", name: "lookup", input: { slug: "start" } }),
		]);
		expect(events.at(-1)).toMatchObject({ type: "response.completed" });
	});

	it("fails a stream that reports an error after it started, instead of completing with partial text", async () => {
		const failures: Array<[Record<string, unknown>, string, string]> = [
			// The gateway's own frame: named only on its event line, so untyped here.
			[{ error: { message: "Provider stream ended early" } }, "stream_error", "Provider stream ended early"],
			[{ type: "error", code: "rate_limit_exceeded", message: "Slow down" }, "rate_limit_exceeded", "Slow down"],
			[{ type: "response.failed", response: { id: "resp_failed", error: { code: "server_error", message: "Upstream failed" } } }, "server_error", "Upstream failed"],
		];
		for (const [frame, code, message] of failures) {
			async function* frames() {
				yield { type: "response.output_text.delta", delta: "Partial " };
				yield frame;
				yield { type: "response.output_text.delta", delta: "never sent" };
			}
			const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(async () => frames()) } } as any });
			const deltas: string[] = [];
			let caught: unknown;
			try {
				for await (const event of client.stream!({ agentId: "failing", messages: [{ role: "user", content: "Hi" }], tools: [], context: undefined })) {
					if (event.type === "response.output_text.delta") deltas.push(event.delta);
				}
			} catch (error) {
				caught = error;
			}
			expect(caught, code).toBeInstanceOf(AgentGatewayError);
			expect(caught, code).toMatchObject({ status: 502, reason: code, message });
			expect(deltas, code).toEqual(["Partial "]);
		}
	});

	it("fails the agent run when its stream reports an error", async () => {
		async function* frames() {
			yield { type: "response.output_text.delta", delta: "Partial " };
			yield { error: { message: "Provider stream ended early" } };
		}
		const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(async () => frames()) } } as any });
		const stream = createAgent({ id: "failing-run", retry: { maxRetries: 0 } } as any).stream({ input: "Hi", client });
		await expect(Promise.resolve(stream)).rejects.toMatchObject({ status: 502, message: "Provider stream ended early" });
	});

	it("keeps text from untyped chunks", async () => {
		async function* frames() {
			yield { delta: "Hello" };
			yield { text: " there" };
		}
		const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(async () => frames()) } } as any });

		const deltas: string[] = [];
		for await (const event of client.stream!({ agentId: "untyped", messages: [{ role: "user", content: "Hi" }], tools: [], context: undefined })) {
			if (event.type === "response.output_text.delta") deltas.push(event.delta);
		}

		expect(deltas.join("")).toBe("Hello there");
	});

	it("wraps HTTP failures of a streamed request, which the SDK throws on the first read", async () => {
		// @phaseo/sdk returns the stream before sending the request, so a 402 surfaces while iterating.
		const client = createGatewayAgentClient({
			clientOptions: {
				apiKey: "test-key",
				baseUrl: "https://gateway.test/v1",
				fetchImpl: async (input) => String(input instanceof Request ? input.url : input).endsWith("/responses")
					? Response.json({ error: "insufficient_funds", reason: "insufficient_credits", request_id: "req_stream_402" }, { status: 402, statusText: "Payment Required", headers: { "x-request-id": "req_stream_402" } })
					: Response.json({ models: [] }),
			},
		});

		const read = async () => { for await (const _event of client.stream!({ agentId: "stream-402", messages: [{ role: "user", content: "Hi" }], tools: [], context: undefined })) { /* drain */ } };

		await expect(read()).rejects.toBeInstanceOf(AgentGatewayError);
		await expect(read()).rejects.toMatchObject({ status: 402, statusText: "Payment Required", requestId: "req_stream_402", reason: "insufficient_credits" });
	});

	it("wraps HTTP-shaped errors thrown partway through a stream", async () => {
		async function* frames() {
			yield { type: "response.output_text.delta", delta: "Hel" };
			throw Object.assign(new Error("Stream request failed: 503 Service Unavailable"), {
				name: "PhaseoHttpError", status: 503, statusText: "Service Unavailable", headers: { "x-request-id": "req_stream_503" },
				body: { message: "All providers failed", failed_providers: ["openai"] },
			});
		}
		const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(async () => frames()) } } as any });

		const deltas: string[] = [];
		const read = async () => { for await (const event of client.stream!({ agentId: "stream-503", messages: [{ role: "user", content: "Hi" }], tools: [], context: undefined })) if (event.type === "response.output_text.delta") deltas.push(event.delta); };

		await expect(read()).rejects.toMatchObject({ name: "AgentGatewayError", status: 503, requestId: "req_stream_503", failedProviders: ["openai"] });
		expect(deltas).toEqual(["Hel"]);
	});
});

describe("gateway client in agent runs", () => {
	it("sends string instructions once, in the instructions field, on every step", async () => {
		const create = vi.fn()
			.mockResolvedValueOnce({ id: "resp_1", output: [{ type: "function_call", call_id: "call_1", name: "lookup", arguments: "{}" }] })
			.mockResolvedValueOnce({ id: "resp_2", output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }] });
		const agent = createAgent({ id: "instructions-once", instructions: "Answer briefly.", tools: [{ id: "lookup", execute: async () => "found" }] });

		const result = await agent.run({ input: "Hi", client: createGatewayAgentClient({ client: { responses: { create } } as any }) });

		expect(result.output).toBe("Done");
		expect(create).toHaveBeenCalledTimes(2);
		for (const [payload] of create.mock.calls) {
			expect(payload.instructions).toBe("Answer briefly.");
			expect(payload.input.filter((item: any) => item.role === "system" || item.role === "developer")).toEqual([]);
		}
	});

	it("streams with string instructions sent once", async () => {
		async function* frames() {
			yield { type: "response.output_text.delta", delta: "Hi" };
			yield { type: "response.completed", response: { id: "resp_1", output: [{ type: "message", content: [{ type: "output_text", text: "Hi" }] }] } };
		}
		const create = vi.fn(async () => frames());
		const agent = createAgent({ id: "instructions-once-stream", instructions: "Answer briefly." });

		await agent.stream({ input: "Hi", client: createGatewayAgentClient({ client: { responses: { create } } as any }) }).getResult();

		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0]?.[0]).toMatchObject({ instructions: "Answer briefly.", stream: true });
	});

	function countingFetch() {
		const requests: string[] = [];
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input instanceof Request ? input.url : input);
			requests.push(`${(input instanceof Request ? input.method : init?.method) ?? "GET"} ${new URL(url).pathname}`);
			if (!url.endsWith("/responses")) return Response.json({ models: [{ model_id: "openai/gpt-5.4-nano", status: "active" }] });
			const body = JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : "{}")));
			// A stream that ends without its completion counts as cut off, so this one completes.
			if (body.stream) return new Response("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Done\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_stream\",\"status\":\"completed\"}}\n\ndata: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
			const calledTool = body.input.some((item: any) => item.type === "function_call_output");
			return Response.json({ id: `resp_${requests.length}`, model: body.model, output: calledTool
				? [{ type: "message", content: [{ type: "output_text", text: "Done" }] }]
				: [{ type: "function_call", call_id: "call_1", name: "lookup", arguments: "{}" }] });
		};
		return { requests, fetchImpl };
	}

	it("makes no GET /models lookup before model requests", async () => {
		const { requests, fetchImpl } = countingFetch();
		const client = createGatewayAgentClient({ clientOptions: { apiKey: "test-key", baseUrl: "https://gateway.test/v1", fetchImpl } });
		const agent = createAgent({ id: "no-model-lookup", model: "openai/gpt-5.4-nano", tools: [{ id: "lookup", execute: async () => "found" }] });

		await agent.run({ input: "Hi", client });
		await agent.stream({ input: "Hi again", client }).getResult();

		expect(requests).toEqual(["POST /v1/responses", "POST /v1/responses", "POST /v1/responses"]);
	});

	it("looks a model up once per client when lifecycle checks are turned on", async () => {
		const { requests, fetchImpl } = countingFetch();
		const client = createGatewayAgentClient({ clientOptions: { apiKey: "test-key", baseUrl: "https://gateway.test/v1", fetchImpl, modelLifecycleChecks: true } as any });
		const agent = createAgent({ id: "one-model-lookup", model: "openai/gpt-5.4-nano", tools: [{ id: "lookup", execute: async () => "found" }] });

		await agent.run({ input: "Hi", client });
		await agent.stream({ input: "Hi again", client }).getResult();

		expect(requests).toEqual(["GET /v1/models", "POST /v1/responses", "POST /v1/responses", "POST /v1/responses"]);
	});
});

describe("live GPT 5.6 Luna gateway smoke", () => {
	it.each(["complete", "missing", "without-items"])("keeps tool argument deltas out of assistant text with %s completion", async completion => {
		const call = { type: "function_call", call_id: "owned-call", name: "run_project_command", arguments: '{"command":"owned-command"}' };
		async function* stream() {
			yield { type: "response.reasoning_text.delta", delta: "Inspect the environment" };
			yield { type: "response.output_text.delta", delta: "Checking the drives." };
			yield { type: "response.function_call_arguments.delta", delta: call.arguments };
			yield { type: "response.output_item.done", item: call };
			if (completion !== "missing") yield { type: "response.completed", response: completion === "complete" ? { output: [call] } : { id: "owned-response" } };
		}
		const client = createGatewayAgentClient({ client: { responses: { create: vi.fn(() => stream()) } } as any });
		const events = [];
		for await (const event of client.stream!({ agentId: "owned", messages: [], tools: [], context: undefined })) events.push(event);
		expect(events.filter(event => event.type === "response.output_text.delta")).toEqual([expect.objectContaining({ delta: "Checking the drives." })]);
		expect(events).toContainEqual(expect.objectContaining({ type: "response.reasoning.delta", delta: "Inspect the environment" }));
		expect(events.at(-1)).toMatchObject({ type: "response.completed", response: { message: { toolCalls: [{ id: "owned-call", name: "run_project_command", input: { command: "owned-command" } }] } } });
	});
	it.runIf(process.env.PHASEO_AGENT_LIVE_SMOKE === "true" && Boolean(process.env.PHASEO_API_KEY))("streams a real response", async () => {
		const client=createGatewayAgentClient({model:"openai/gpt-5.6-luna",includeMeta:true});const events=[];
		for await(const event of client.stream!({agentId:"live-smoke",messages:[{role:"user",content:"Reply with exactly: luna-ok"}],tools:[],context:undefined}))events.push(event);
		expect(events.some((event)=>event.type==="response.output_text.delta"&&Boolean((event as any).delta))).toBe(true);expect(events.some((event)=>event.type==="response.completed"&&Boolean((event as any).response))).toBe(true);
	});
});
