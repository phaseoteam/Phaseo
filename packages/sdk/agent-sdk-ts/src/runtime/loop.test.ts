import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { createAgent } from "../agent";
import { createAgentDevtools } from "../devtools";
import { AgentGatewayError } from "../errors";

describe("Agent SDK runtime loop", () => {
	it("pauses a run for human review and exposes pause metadata", async () => {
		const events: string[] = [];
		const client = {
			generate: vi.fn(async () => ({
				message: {
					role: "assistant" as const,
					content: "Draft answer that needs approval",
				},
				requestId: "req_pause_1",
				nativeResponseId: "resp_pause_native_1",
				provider: "openai",
				model: "openai/gpt-5.4",
			})),
		};

		const agent = createAgent<string, string, { reviewer: string }>({
			id: "review-agent",
			humanReview: ({ response }) =>
				response.message.content.includes("needs approval")
					? {
							reason: "approval_required",
							payload: { draft: response.message.content },
					  }
					: null,
		});

		const result = await agent.run({
			input: "Prepare a draft",
			client,
			context: { reviewer: "ops" },
			onEvent: (event) => {
				events.push(event.type);
			},
		});

		expect(result.output).toBeUndefined();
		expect(result.run.status).toBe("waiting_for_human");
		expect(result.run.pause).toEqual(
			expect.objectContaining({
				reason: "approval_required",
				payload: { draft: "Draft answer that needs approval" },
			}),
		);
		expect(result.steps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					index: 0,
					status: "checkpointed",
					requestId: "req_pause_1",
					nativeResponseId: "resp_pause_native_1",
				}),
			]),
		);
		expect(events).toEqual([
			"run.started",
			"step.started",
			"model.requested",
			"model.completed",
			"step.completed",
			"checkpoint.saved",
			"run.waiting_for_human",
		]);
	});

	it("continues a paused run with human input and clears the pause", async () => {
		const events: string[] = [];
		const continuedEvents: Array<{ status: string; previousStatus?: string }> = [];
		const client = {
			generate: vi
				.fn()
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "Draft answer that needs approval",
					},
					requestId: "req_pause_1",
					provider: "openai",
					model: "openai/gpt-5.4",
				})
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "Approved final answer",
					},
					requestId: "req_continue_2",
					provider: "openai",
					model: "openai/gpt-5.4",
				}),
		};

		const agent = createAgent<string, string, { reviewer: string }>({
			id: "review-agent",
			humanReview: ({ response }) =>
				response.message.content.includes("needs approval")
					? {
							reason: "approval_required",
							payload: { draft: response.message.content },
					  }
					: null,
		});

		const paused = await agent.run({
			input: "Prepare a draft",
			client,
			context: { reviewer: "ops" },
			onEvent: (event) => {
				events.push(event.type);
			},
		});

		const continued = await agent.continueRun({
			run: paused,
			client,
			context: { reviewer: "ops" },
			humanInput: "Approved. Return the final answer.",
			onEvent: (event) => {
				events.push(event.type);
				if (event.type === "run.resumed") {
					continuedEvents.push({
						status: event.status,
						previousStatus: event.previousStatus,
					});
				}
			},
		});

		expect(continued.output).toBe("Approved final answer");
		expect(continued.run.status).toBe("completed");
		expect(continued.run.pause).toBeNull();
		expect(continued.messages.at(-2)).toEqual({
			role: "user",
			content: "Approved. Return the final answer.",
		});
		expect(continued.messages.at(-1)).toEqual({
			role: "assistant",
			content: "Approved final answer",
		});
		expect(continuedEvents).toEqual([
			{
				status: "running",
				previousStatus: "waiting_for_human",
			},
		]);
	});

	it("rejects continue without human input when the run is paused", async () => {
		const client = {
			generate: vi.fn(async () => ({
				message: {
					role: "assistant" as const,
					content: "Draft answer that needs approval",
				},
				requestId: "req_pause_1",
			})),
		};

		const agent = createAgent<string, string>({
			id: "review-agent",
			humanReview: () => ({
				reason: "approval_required",
			}),
		});

		const paused = await agent.run({
			input: "Prepare a draft",
			client,
		});

		await expect(
			agent.continueRun({
				run: paused,
				client,
			}),
		).rejects.toThrow("waiting for human input");
	});

	it("emits tool execution events for runtime tools", async () => {
		const events: string[] = [];
		const client = {
			generate: vi
				.fn()
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "",
						toolCalls: [{ id: "call_1", name: "lookup-docs", input: { slug: "presets" } }],
					},
					requestId: "req_tools_1",
				})
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "Done",
					},
					requestId: "req_tools_2",
				}),
		};

		const agent = createAgent({
			id: "tool-agent",
			tools: [
				{
					id: "lookup-docs",
					async execute(input: { slug: string }) {
						return { slug: input.slug };
					},
				},
			],
		});

		const result = await agent.run({
			input: "Use the tool",
			client,
			onEvent: (event) => {
				events.push(event.type);
			},
		});

		expect(result.output).toBe("Done");
		expect(events).toEqual([
			"run.started",
			"step.started",
			"model.requested",
			"model.completed",
			"tool.started",
			"tool.completed",
			"step.completed",
			"checkpoint.saved",
			"step.started",
			"model.requested",
			"model.completed",
			"step.completed",
			"checkpoint.saved",
			"run.completed",
		]);
	});

	it("passes local tool parameter schemas through the runtime model request", async () => {
		const client = {
			generate: vi.fn(async () => ({
				message: {
					role: "assistant" as const,
					content: "Done",
				},
				requestId: "req_tool_schema_1",
			})),
		};

		const agent = createAgent({
			id: "tool-schema-agent",
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
					async execute() {
						return { ok: true };
					},
				},
			],
		});

		await agent.run({
			input: "Do the thing",
			client,
		});

		expect(client.generate).toHaveBeenCalledWith(
			expect.objectContaining({
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
			}),
		);
	});

	it("emits tool.failed before step.failed when a local tool throws", async () => {
		const events: string[] = [];
		const client = {
			generate: vi.fn().mockResolvedValueOnce({
				message: {
					role: "assistant" as const,
					content: "",
					toolCalls: [{ id: "call_1", name: "explode", input: {} }],
				},
				requestId: "req_tools_fail_1",
			}),
		};

		const agent = createAgent({
			id: "tool-failure-agent",
			tools: [
				{
					id: "explode",
					async execute() {
						throw new Error("boom");
					},
				},
			],
		});

		await expect(
			agent.run({
				input: "Trigger the tool",
				client,
				onEvent(event) {
					events.push(event.type);
				},
			}),
		).rejects.toThrow("boom");

		expect(events).toEqual([
			"run.started",
			"step.started",
			"model.requested",
			"model.completed",
			"tool.started",
			"tool.failed",
			"step.failed",
			"run.failed",
		]);
	});

	it("executes multiple local tools concurrently while preserving tool-result order", async () => {
		const completionOrder: string[] = [];
		const client = {
			generate: vi
				.fn()
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "",
						toolCalls: [
							{ id: "call_1", name: "slow-tool", input: { label: "slow" } },
							{ id: "call_2", name: "fast-tool", input: { label: "fast" } },
						],
					},
					requestId: "req_parallel_1",
				})
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "Parallel tool summary",
					},
					requestId: "req_parallel_2",
				}),
		};

		const agent = createAgent({
			id: "parallel-tool-agent",
			toolExecution: {
				toolConcurrency: 2,
			},
			tools: [
				{
					id: "slow-tool",
					async execute(input: { label: string }) {
						await new Promise((resolve) => setTimeout(resolve, 25));
						completionOrder.push(input.label);
						return { label: input.label };
					},
				},
				{
					id: "fast-tool",
					async execute(input: { label: string }) {
						completionOrder.push(input.label);
						return { label: input.label };
					},
				},
			],
		});

		const result = await agent.run({
			input: "Use both tools in parallel",
			client,
		});

		expect(result.output).toBe("Parallel tool summary");
		expect(completionOrder).toEqual(["fast", "slow"]);
		expect(result.messages.slice(-3)).toEqual([
			{
				role: "tool",
				content: JSON.stringify({ label: "slow" }, null, 2),
				toolCallId: "call_1",
				name: "slow-tool",
			},
			{
				role: "tool",
				content: JSON.stringify({ label: "fast" }, null, 2),
				toolCallId: "call_2",
				name: "fast-tool",
			},
			{
				role: "assistant",
				content: "Parallel tool summary",
			},
		]);
	});

	it("fails a run when a local tool exceeds its timeout and aborts the tool signal", async () => {
		let observedAborted = false;
		const client = {
			generate: vi.fn().mockResolvedValueOnce({
				message: {
					role: "assistant" as const,
					content: "",
					toolCalls: [{ id: "call_timeout_1", name: "slow-tool", input: {} }],
				},
				requestId: "req_tool_timeout_1",
			}),
		};

		const agent = createAgent({
			id: "tool-timeout-agent",
			tools: [
				{
					id: "slow-tool",
					timeoutMs: 10,
					async execute(_input: unknown, context) {
						return await new Promise((_resolve, reject) => {
							context.signal?.addEventListener(
								"abort",
								() => {
									observedAborted = true;
									reject(context.signal?.reason ?? new Error("aborted"));
								},
								{ once: true },
							);
						});
					},
				},
			],
		});

		await expect(
			agent.run({
				input: "Trigger the timeout",
				client,
			}),
		).rejects.toThrow("timed out");
		expect(observedAborted).toBe(true);
	});

	it("retries a transient model failure before completing the run", async () => {
		const events: Array<{ type: string; attempt?: number }> = [];
		const client = {
			generate: vi
				.fn()
				.mockRejectedValueOnce(new Error("temporary upstream failure"))
				.mockResolvedValueOnce({
					message: {
						role: "assistant" as const,
						content: "Recovered answer",
					},
					requestId: "req_retry_2",
				}),
		};

		const agent = createAgent({
			id: "retry-agent",
			modelRetry: {
				maxRetries: 1,
				backoffMs: 0,
			},
		});

		const result = await agent.run({
			input: "Retry if needed",
			client,
			onEvent(event) {
				events.push({
					type: event.type,
					attempt: "attempt" in event ? event.attempt : undefined,
				});
			},
		});

		expect(result.output).toBe("Recovered answer");
		expect(client.generate).toHaveBeenCalledTimes(2);
		expect(result.steps[0]?.modelAttempts).toBe(2);
		expect(events).toEqual(
			expect.arrayContaining([
				{ type: "model.requested", attempt: 1 },
				{ type: "model.requested", attempt: 2 },
			]),
		);
	});

	it("persists structured gateway failure diagnostics on run.failed events", async () => {
		const failures: Array<{ error?: string; errorDetails?: unknown }> = [];
		const client = {
			generate: vi.fn(async () => {
				throw new AgentGatewayError({
					status: 429,
					statusText: "Too Many Requests",
					body: {
						error: "rate_limited",
						request_id: "req_gateway_fail_1",
						reason: "provider_rate_limit",
					},
				});
			}),
		};

		const agent = createAgent({
			id: "gateway-error-agent",
		});

		await expect(
			agent.run({
				input: "Trigger the gateway error",
				client,
				onEvent(event) {
					if (event.type === "run.failed") {
						failures.push({
							error: event.error,
							errorDetails: event.errorDetails,
						});
					}
				},
			}),
		).rejects.toBeInstanceOf(AgentGatewayError);

		expect(failures).toEqual([
			expect.objectContaining({
				error: "Gateway request failed: 429 Too Many Requests - provider_rate_limit",
				errorDetails: expect.objectContaining({
					status: 429,
					requestId: "req_gateway_fail_1",
					reason: "provider_rate_limit",
				}),
			}),
		]);
	});

	it("persists successful gateway metadata and native response ids on step records and events", async () => {
		const checkpointEvents: Array<{ requestId?: string; nativeResponseId?: string | null }> = [];
		const client = {
			generate: vi.fn(async () => ({
				message: {
					role: "assistant" as const,
					content: "Done",
				},
				requestId: "req_meta_1",
				nativeResponseId: "resp_native_1",
				provider: "openai",
				model: "openai/gpt-5.4",
				usage: { input_tokens: 12, output_tokens: 8 },
				responseMeta: {
					routing: { target: "phaseo/free" },
				},
			})),
		};

		const agent = createAgent({
			id: "meta-agent",
		});

		const result = await agent.run({
			input: "Return metadata",
			client,
			onEvent(event) {
				if (event.type === "checkpoint.saved") {
					checkpointEvents.push({
						requestId: event.requestId,
						nativeResponseId: event.nativeResponseId ?? null,
					});
				}
			},
		});

		expect(result.steps[0]).toEqual(
			expect.objectContaining({
				requestId: "req_meta_1",
				nativeResponseId: "resp_native_1",
				responseMeta: {
					routing: { target: "phaseo/free" },
				},
			}),
		);
		expect(checkpointEvents).toEqual([
			{
				requestId: "req_meta_1",
				nativeResponseId: "resp_native_1",
			},
		]);
	});

	it("captures agent runs in devtools-compatible JSONL", async () => {
		const directory = `.phaseo-agent-devtools-test-${randomUUID()}`;
		const client = {
			generate: vi.fn(async () => ({
				message: {
					role: "assistant" as const,
					content: "Done",
				},
				requestId: "req_agent_devtools_1",
				nativeResponseId: "resp_agent_devtools_1",
				provider: "openai",
				model: "openai/gpt-5.4",
			})),
		};

		try {
			const agent = createAgent({
				id: "devtools-agent",
				model: "phaseo/free",
			});

			await agent.run({
				input: "Capture this run",
				client,
				devtools: createAgentDevtools({
					directory,
				}),
			});

			const lines = fs
				.readFileSync(`${directory}/generations.jsonl`, "utf-8")
				.trim()
				.split("\n");
			expect(lines).toHaveLength(1);
			const entry = JSON.parse(lines[0]);
			expect(entry).toMatchObject({
				type: "agent.run",
				request: {
					agent_id: "devtools-agent",
					input: "Capture this run",
					model: "phaseo/free",
				},
				metadata: {
					sdk: "typescript",
					stream: false,
					agent_id: "devtools-agent",
					run_status: "completed",
					request_id: "req_agent_devtools_1",
					native_response_id: "resp_agent_devtools_1",
					provider: "openai",
					model: "openai/gpt-5.4",
				},
			});
			expect(entry.response.run.status).toBe("completed");
		} finally {
			if (fs.existsSync(directory)) {
				fs.rmSync(directory, { recursive: true, force: true });
			}
		}
	});

	it("uses preset and run-level overrides on the initial run path", async () => {
		const requestedModels: string[] = [];
		const requestedConcurrency: Array<number | undefined> = [];
		const client = {
			generate: vi
				.fn()
				.mockImplementationOnce(async (request) => {
					requestedModels.push(request.model ?? "");
					return {
						message: {
							role: "assistant" as const,
							content: "",
							toolCalls: [
								{ id: "call_1", name: "first-tool", input: {} },
								{ id: "call_2", name: "second-tool", input: {} },
							],
						},
						requestId: "req_override_1",
					};
				})
				.mockImplementationOnce(async () => ({
					message: {
						role: "assistant" as const,
						content: "Done",
					},
					requestId: "req_override_2",
				})),
		};

		const toolStarts: string[] = [];
		const toolFinishes: string[] = [];
		let concurrentTools = 0;
		let maxConcurrentTools = 0;
		const agent = createAgent({
			id: "override-agent",
			preset: "baseline",
			modelRetry: {
				maxRetries: 0,
				backoffMs: 0,
			},
			toolExecution: {
				toolConcurrency: 1,
			},
			tools: [
				{
					id: "first-tool",
					async execute() {
						concurrentTools += 1;
						maxConcurrentTools = Math.max(maxConcurrentTools, concurrentTools);
						toolStarts.push("first");
						await new Promise((resolve) => setTimeout(resolve, 15));
						toolFinishes.push("first");
						concurrentTools -= 1;
						return { ok: true };
					},
				},
				{
					id: "second-tool",
					async execute() {
						concurrentTools += 1;
						maxConcurrentTools = Math.max(maxConcurrentTools, concurrentTools);
						toolStarts.push("second");
						await new Promise((resolve) => setTimeout(resolve, 15));
						toolFinishes.push("second");
						concurrentTools -= 1;
						return { ok: true };
					},
				},
			],
		});

		await agent.run({
			input: "Use the override path",
			client,
			model: "phaseo/premium",
			toolExecution: {
				toolConcurrency: 2,
			},
			onEvent(event) {
				if (event.type === "tool.started") {
					requestedConcurrency.push(maxConcurrentTools);
				}
			},
		});

		expect(requestedModels).toEqual(["phaseo/premium"]);
		expect(toolStarts).toEqual(["first", "second"]);
		expect(toolFinishes).toEqual(["first", "second"]);
		expect(maxConcurrentTools).toBe(2);
	});

	it("fails after the configured model retries are exhausted", async () => {
		const client = {
			generate: vi.fn(async () => {
				throw new Error("still failing");
			}),
		};

		const agent = createAgent({
			id: "retry-exhausted-agent",
			modelRetry: {
				maxRetries: 1,
				backoffMs: 0,
			},
		});

		await expect(
			agent.run({
				input: "Fail twice",
				client,
			}),
		).rejects.toThrow("still failing");
		expect(client.generate).toHaveBeenCalledTimes(2);
	});
});
