import { describe, expect, it, vi } from "vitest";
import { AgentGatewayError } from "../errors";
import { createGatewayAgentClient } from "./gateway-client";

describe("createGatewayAgentClient", () => {
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
});

describe("live GPT 5.6 Luna gateway smoke", () => {
	it.runIf(process.env.PHASEO_AGENT_LIVE_SMOKE === "true" && Boolean(process.env.PHASEO_API_KEY))("streams a real response", async () => {
		const client=createGatewayAgentClient({model:"openai/gpt-5.6-luna",includeMeta:true});const events=[];
		for await(const event of client.stream!({agentId:"live-smoke",messages:[{role:"user",content:"Reply with exactly: luna-ok"}],tools:[],context:undefined}))events.push(event);
		expect(events.some((event)=>event.type==="response.output_text.delta"&&Boolean((event as any).delta))).toBe(true);expect(events.some((event)=>event.type==="response.completed"&&Boolean((event as any).response))).toBe(true);
	});
});
