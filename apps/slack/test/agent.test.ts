import { AgentGatewayError } from "@phaseo/agent-sdk";
import { describe, expect, it, vi } from "vitest";
import {
	classifyTurnError, createSdkAgentRunner, gatewayBaseUrl, gatewayFetch, ImageNotReadError, turnErrorText, withAttachments, withZeroDataRetention,
	type AgentTurnRequest, type AskRequest, type PausedRun,
} from "../src/agent";
import { askQuestionTool, type QuestionDraft } from "../src/questions";
import { noRouteInCountry, noZeroDataRetentionRoute } from "./fakes";

function sse(events: unknown[]): Response {
	return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

const COMPLETED = {
	type: "response.completed",
	response: {
		id: "resp_test_1",
		model: "openai/gpt-test",
		status: "completed",
		output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello there" }] }],
		usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13, cost: 0.0021 },
	},
};

function request(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
	return {
		gatewayKey: "phaseo_v1_sk_testkid00000_testsecret",
		model: "phaseo/auto",
		instructions: "You are the Phaseo agent.",
		prompt: "New message from <@U0PERSON01>:\nhello",
		endUser: "slack:T0TEST0001:U0PERSON01",
		sessionId: "slack-Ev0TEST0001",
		labels: { slackTeam: "T0TEST0001", slackChannel: "C0CHANNEL1" },
		tools: [],
		maxCostUsd: 0.5,
		signal: new AbortController().signal,
		...overrides,
	};
}

async function capture(input: RequestInfo | URL, init?: RequestInit) {
	const req = input instanceof Request ? input : new Request(input, init);
	return { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) as Record<string, any> };
}

describe("the SDK agent runner", () => {
	it("sends the Slack data rules, labels and tools with every gateway request, and streams the text", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(await capture(input, init));
			return sse([
				{ type: "response.output_text.delta", delta: "Hello" },
				{ type: "response.output_text.delta", delta: " there" },
				COMPLETED,
			]);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const deltas: string[] = [];
		const steps: number[] = [];
		const tool = { id: "get_spend", description: "Spend", parameters: { type: "object", properties: {} }, execute: async () => ({}) };
		const output = await runner.run(request({ tools: [tool] }), { onText: async (delta) => { deltas.push(delta); }, onStep: async (progress) => { steps.push(progress.costUsd); } });

		expect(deltas.join("")).toBe("Hello there");
		// Each step reports what the run has spent so far, so a retried turn can count it.
		expect(steps).toEqual([0.0021]);
		expect(output).toEqual({ costUsd: 0.0021, model: "openai/gpt-test", stopReason: null });
		expect(seen).toHaveLength(1);
		const [sent] = seen;
		expect(sent.url).toBe("https://gateway.test/v1/responses");
		expect(sent.headers.get("authorization")).toBe("Bearer phaseo_v1_sk_testkid00000_testsecret");
		expect(sent.headers.get("x-title")).toBe("Phaseo Slack agent");
		expect(JSON.parse(sent.headers.get("x-phaseo-metadata")!)).toEqual({
			labels: [{ key: "app", value: "slack-agent" }, { key: "slack_team", value: "T0TEST0001" }, { key: "slack_channel", value: "C0CHANNEL1" }],
		});
		expect(sent.body).toMatchObject({
			model: "phaseo/auto",
			user: "slack:T0TEST0001:U0PERSON01",
			// The answer's session, in the body: the Responses API reads it from nowhere else.
			session_id: "slack-Ev0TEST0001",
			stream: true,
			instructions: "You are the Phaseo agent.",
		});
		// The guardrail on the key carries the data rules; the gateway rejects provider.data_collection "deny".
		expect(sent.body).not.toHaveProperty("provider");
		expect(sent.body.tools).toEqual([
			{ type: "function", function: { name: "get_spend", description: "Spend", parameters: { type: "object", properties: {} } } },
			{ type: "phaseo:web_search" },
			{ type: "phaseo:web_fetch" },
		]);
		expect(JSON.stringify(sent.body.input)).toContain("New message from <@U0PERSON01>");
		// Sent once, as instructions, not also as a system message.
		expect(JSON.stringify(sent.body.input)).not.toContain("You are the Phaseo agent.");
	});

	it("stops at the cost a retried turn has left, not the whole turn's limit", async () => {
		const fetchImpl = vi.fn(async () => sse([COMPLETED]));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const output = await runner.run(request({ maxCostUsd: 0.001 }), { onText: async () => undefined, onStep: async () => undefined });
		expect(output).toMatchObject({ costUsd: 0.0021, stopReason: "max_cost:0.001" });
	});

	it("only sends the managed key to an HTTPS gateway, or plain HTTP on this machine", () => {
		expect(gatewayBaseUrl({})).toBe("https://api.phaseo.app/v1");
		expect(gatewayBaseUrl({ PHASEO_API_BASE_URL: " https://api.phaseo.app/v1/ " })).toBe("https://api.phaseo.app/v1");
		expect(gatewayBaseUrl({ PHASEO_API_BASE_URL: "http://localhost:8787/v1" })).toBe("http://localhost:8787/v1");
		expect(gatewayBaseUrl({ PHASEO_API_BASE_URL: "http://127.0.0.1:8787/v1" })).toBe("http://127.0.0.1:8787/v1");
		expect(() => gatewayBaseUrl({ PHASEO_API_BASE_URL: "http://api.phaseo.app/v1" })).toThrow("PHASEO_API_BASE_URL must use https");
		expect(() => gatewayBaseUrl({ PHASEO_API_BASE_URL: "ftp://api.phaseo.app/v1" })).toThrow("PHASEO_API_BASE_URL must use https");
		expect(() => gatewayBaseUrl({ PHASEO_API_BASE_URL: "api.phaseo.app/v1" })).toThrow("PHASEO_API_BASE_URL is not a valid URL");
	});

	it("calls the gateway's public URL, so the request has a country providers can check", async () => {
		const globalFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => sse([COMPLETED]));
		vi.stubGlobal("fetch", globalFetch);
		try {
			const runner = createSdkAgentRunner({ fetchImpl: gatewayFetch(), baseUrl: "https://api.phaseo.app/v1" });
			await runner.run(request(), { onText: async () => undefined, onStep: async () => undefined });
			// One request: the agent client doesn't look the model up first.
			expect(globalFetch.mock.calls.map(([input, init]) => `${init?.method ?? (input as Request).method} ${String(input instanceof Request ? input.url : input)}`))
				.toEqual(["POST https://api.phaseo.app/v1/responses"]);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("turns gateway errors into plain replies", async () => {
		const error = (status: number, body: Record<string, unknown>) => new AgentGatewayError({ status, statusText: "Error", body });
		expect(classifyTurnError(error(402, { error: { code: "insufficient_funds", message: "x" } }))).toBe("no_credits");
		expect(classifyTurnError(error(429, { reason: "monthly_cost_limit_reached" }))).toBe("cap_reached");
		expect(classifyTurnError(error(429, { error: { code: "key_limit_exceeded" } }))).toBe("cap_reached");
		expect(classifyTurnError(error(404, { error: { code: "model_not_found" } }))).toBe("model_unavailable");
		expect(classifyTurnError(error(503, { failed_providers: ["openai"] }))).toBe("model_unavailable");
		expect(classifyTurnError(error(500, { error: { code: "api_error" } }))).toBe("failed");
		expect(classifyTurnError(new Error("network"))).toBe("failed");
		// The SDK can wrap the gateway error.
		expect(classifyTurnError(new Error("run failed", { cause: error(402, {}) }))).toBe("no_credits");
		expect(turnErrorText("no_credits")).toBe("This Phaseo workspace is out of credits, so I can't answer right now. An admin can add credits in Phaseo billing.");
	});

	it("says the model isn't available to the agent when the gateway refuses it for the key, without internal details", async () => {
		// The bodies the gateway sends (captured live on 2026-10-26): the specific reason is in
		// error_operational_kind, and there is no top-level `reason`.
		const refused = (kind: string, message: string) => new AgentGatewayError({
			status: 403, statusText: "Forbidden",
			body: {
				error: { code: "guardrail_blocked", message, type: "permission_error", param: null },
				code: "guardrail_blocked", error_type: "user", error_origin: "user", description: message, message,
				error_operational_kind: kind, guardrail: { type: "data_handling", scope: "workspace", active_guardrail_ids: ["g1"] },
			},
		});
		const refusals = [
			refused("data_handling_policy_no_routes", "No provider routes satisfy the workspace data-handling policy"),
			refused("provider_restricted_by_policy", "All provider routes for this model are blocked by a workspace policy or guardrail"),
			refused("model_restricted_by_policy", "Model \"openai/gpt-6-luna\" is blocked by a workspace policy or guardrail"),
		];
		for (const refusal of refusals) expect(classifyTurnError(refusal, "openai/gpt-6-luna")).toBe("model_not_allowed");
		expect(classifyTurnError(new Error("run failed", { cause: refusals[0] }), "openai/gpt-6-luna")).toBe("model_not_allowed");
		// A guardrail that blocks the message itself is not about the model.
		expect(classifyTurnError(refused("prompt_injection_detected", "Request blocked by prompt injection guardrail"), "openai/gpt-6-luna")).toBe("failed");

		// Auto without access is a plain not_supported; the same code means something else for other models.
		const notSupported = new AgentGatewayError({
			status: 400, statusText: "Bad Request",
			body: {
				error: { code: "not_supported", message: "Auto Routing is currently available to selected Alpha workspaces.", type: "invalid_request_error", param: null },
				code: "not_supported", error_type: "user", error_origin: "user",
			},
		});
		expect(classifyTurnError(notSupported, "phaseo/auto")).toBe("model_not_allowed");
		expect(classifyTurnError(notSupported, "openai/gpt-6-luna")).toBe("failed");
		expect(classifyTurnError(notSupported)).toBe("failed");
		const text = turnErrorText("model_not_allowed");
		expect(text).toBe("The model chosen for this agent isn't available to the Slack agent. An admin can choose another model in Phaseo settings.");
		expect(text).not.toMatch(/guardrail|policy|alpha|provider/i);
	});

	it("pauses at ask_question, keeps the run small, and continues it from the answer, spending only the new run's cost", async () => {
		const bodies: Array<Record<string, any>> = [];
		const askCall = { type: "function_call", id: "fc_1", call_id: "call_q1", name: "ask_question", arguments: JSON.stringify({ question: "Which region?", options: ["EU", "US"] }) };
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			bodies.push((await capture(input, init)).body);
			if (bodies.length === 1) {
				return sse([
					{ type: "response.output_text.delta", delta: "One thing first." },
					{ type: "response.completed", response: { id: "resp_q", model: "openai/gpt-test", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "One thing first." }] }, askCall], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, cost: 0.003 } } },
				]);
			}
			return sse([{ type: "response.output_text.delta", delta: "Using EU." }, { ...COMPLETED, response: { ...COMPLETED.response, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Using EU." }] }], usage: { ...COMPLETED.response.usage, cost: 0.002 } } }]);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const asked: QuestionDraft[] = [];
		const tool = () => askQuestionTool({ refusal: () => null, onAsk: (question) => { asked.push(question); } });
		const hooks = { onText: async () => undefined, onStep: async () => undefined };

		const first = await runner.run(request({ tools: [tool()] }), hooks);
		expect(asked).toEqual([{ callId: "call_q1", text: "Which region?", options: ["EU", "US"], other: false }]);
		expect(first).toMatchObject({ costUsd: 0.003, model: "openai/gpt-test", stopReason: null });
		expect(first.paused?.run.status).toBe("waiting_for_human");
		// What is kept: the conversation and one entry per step, without costs, items or the prompt input.
		const kept = JSON.parse(JSON.stringify(first.paused)) as PausedRun;
		expect(kept.stepResults).toEqual([{ stepIndex: 0, text: "", toolCalls: [], toolResults: [], usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0 } }]);
		expect(kept.steps).toEqual([expect.objectContaining({ index: 0, model: "openai/gpt-test" })]);
		expect(kept.run).toMatchObject({ input: null, stepCount: 1, usage: { cost: 0 } });
		expect(kept.run.pause?.pendingToolCalls?.map((entry) => entry.call.id)).toEqual(["call_q1"]);

		const second = await runner.run(request({ tools: [tool()], maxCostUsd: 0.497, resume: { run: kept, toolOutputs: [{ toolCallId: "call_q1", output: { answered: true, answer: "EU" } }] } }), hooks);
		expect(second).toEqual({ costUsd: 0.002, model: "openai/gpt-test", stopReason: null });
		expect(bodies).toHaveLength(2);
		// The continued request carries the whole conversation and the answer as the question's output.
		const input = JSON.stringify(bodies[1].input);
		expect(input).toContain("New message from <@U0PERSON01>");
		expect(input).toContain("call_q1");
		expect(input).toContain("EU");
	});

	it("counts the steps before a question toward the 12-step limit of the continued run", async () => {
		const fetchImpl = vi.fn(async () => sse([COMPLETED]));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const paused: PausedRun = {
			run: { id: "run_1", agentId: "phaseo-slack-agent", status: "waiting_for_human", input: null, messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "", toolCalls: [{ id: "call_q1", name: "ask_question", input: { question: "Which?", options: ["A", "B"] } }] }], pause: { reason: "Pending tool calls require input", requestedAt: "2026-10-21T12:00:00.000Z", kind: "hitl", pendingToolCalls: [{ call: { id: "call_q1", name: "ask_question", input: { question: "Which?", options: ["A", "B"] } }, kind: "hitl" }] }, createdAt: "2026-10-21T12:00:00.000Z", updatedAt: "2026-10-21T12:00:00.000Z", stepCount: 11 },
			steps: [],
			stepResults: Array.from({ length: 11 }, (_, stepIndex) => ({ stepIndex, text: "", toolCalls: [], toolResults: [], usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0 } })),
			output: undefined, messages: [], items: [],
		};
		const output = await runner.run(request({ tools: [askQuestionTool({ refusal: () => null, onAsk: () => undefined })], resume: { run: paused, toolOutputs: [{ toolCallId: "call_q1", output: { answered: true, answer: "A" } }] } }), { onText: async () => undefined, onStep: async () => undefined });
		// 11 steps before the question: the continued run's first step is the twelfth, and the limit stops it there.
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(output).toMatchObject({ costUsd: 0.0021, stopReason: "step_count:12" });
	});

	it("surfaces a gateway refusal from a streamed request as an error the turn can classify", async () => {
		const fetchImpl = vi.fn(async () => Response.json({ error: { code: "insufficient_funds", message: "Not enough credits" } }, { status: 402 }));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const failure = await runner.run(request(), { onText: async () => undefined, onStep: async () => undefined }).then(() => null, (caught: unknown) => caught);
		expect(classifyTurnError(failure)).toBe("no_credits");
	});

	it("counts what its tools spent on other models against the limit, in each step's cost and in its own", async () => {
		const fetchImpl = vi.fn(async () => sse([COMPLETED]));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const steps: number[] = [];
		const modelCosts: number[] = [];
		// $0.0021 of its own and $0.498 asked of other models: over $0.50, so it stops.
		const output = await runner.run(request({ otherCostUsd: () => 0.498 }), {
			onText: async () => undefined,
			onStep: async (progress) => { steps.push(progress.costUsd); },
			onCost: (usd) => { modelCosts.push(usd); },
		});
		expect(output).toMatchObject({ costUsd: expect.closeTo(0.5001, 9), stopReason: "max_cost:0.5" });
		expect(steps).toEqual([expect.closeTo(0.5001, 9)]);
		expect(modelCosts).toEqual([0.0021]);
		// Under the limit, it isn't stopped.
		await expect(runner.run(request({ otherCostUsd: () => 0.1 }), { onText: async () => undefined, onStep: async () => undefined })).resolves.toMatchObject({ stopReason: null });
	});
});

describe("asking another model", () => {
	const RESPONSE = {
		id: "resp_test_2",
		model: "anthropic/claude-test",
		status: "completed",
		output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "  A second opinion.  " }] }],
		usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14, cost: 0.0042 },
	};

	function ask(overrides: Partial<AskRequest> = {}): AskRequest {
		const { gatewayKey, endUser, sessionId, labels, signal } = request();
		return { gatewayKey, endUser, sessionId, labels, signal, model: "anthropic/claude-test", instructions: "Answer directly.", prompt: "Is this right?", webTools: false, maxOutputTokens: 4_000, ...overrides };
	}

	it("sends one non-streaming request with the answer's key, labels, user and session, and no tools", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(await capture(input, init));
			return Response.json(RESPONSE);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		await expect(runner.ask(ask())).resolves.toEqual({ text: "A second opinion.", costUsd: 0.0042 });
		expect(seen).toHaveLength(1);
		const [sent] = seen;
		expect(sent.url).toBe("https://gateway.test/v1/responses");
		expect(sent.headers.get("authorization")).toBe("Bearer phaseo_v1_sk_testkid00000_testsecret");
		expect(sent.headers.get("x-title")).toBe("Phaseo Slack agent");
		expect(JSON.parse(sent.headers.get("x-phaseo-metadata")!)).toEqual({
			labels: [{ key: "app", value: "slack-agent" }, { key: "slack_team", value: "T0TEST0001" }, { key: "slack_channel", value: "C0CHANNEL1" }],
		});
		expect(sent.body).toMatchObject({
			model: "anthropic/claude-test",
			user: "slack:T0TEST0001:U0PERSON01",
			session_id: "slack-Ev0TEST0001",
			stream: false,
			instructions: "Answer directly.",
			max_output_tokens: 4_000,
		});
		expect(sent.body.tools).toBeUndefined();
		expect(sent.body).not.toHaveProperty("provider");
		expect(JSON.stringify(sent.body.input)).toContain("Is this right?");
	});

	it("lets the gateway search the web for a Compare", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(await capture(input, init));
			return Response.json(RESPONSE);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		await runner.ask(ask({ webTools: true }));
		expect(seen[0].body.tools).toEqual([{ type: "phaseo:web_search" }, { type: "phaseo:web_fetch" }]);
	});

	it("throws the gateway's refusal for the caller to classify", async () => {
		const body = { error: { code: "guardrail_blocked" }, code: "guardrail_blocked", error_operational_kind: "data_handling_policy_no_routes" };
		const fetchImpl = vi.fn(async () => Response.json(body, { status: 403 }));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const failure = await runner.ask(ask()).then(() => null, (caught: unknown) => caught);
		expect(classifyTurnError(failure, "anthropic/claude-test")).toBe("model_not_allowed");
	});
});

describe("files and images", () => {
	const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
	const IMAGE_PART = { type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo=" };

	it("adds the shared files to the first user message of every Responses request, after its text", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(await capture(input, init));
			return sse([COMPLETED]);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		await runner.run(request({ attachments: [IMAGE_PART] }), { onText: async () => {}, onStep: async () => {} });
		const [user] = seen[0].body.input.filter((item: any) => item.role === "user");
		expect(user.content).toEqual([{ type: "input_text", text: "New message from <@U0PERSON01>:\nhello" }, IMAGE_PART]);
		// The rest of the request is as the SDK built it.
		expect(seen[0].headers.get("authorization")).toBe("Bearer phaseo_v1_sk_testkid00000_testsecret");
		expect(seen[0].body).toMatchObject({ model: "phaseo/auto", stream: true, session_id: "slack-Ev0TEST0001" });
	});

	it("leaves requests alone without files, and anything that isn't a Responses request", async () => {
		const passed = vi.fn(async () => new Response("{}"));
		expect(withAttachments(passed as unknown as typeof fetch, [])).toBe(passed);
		const wrapped = withAttachments(passed as unknown as typeof fetch, [IMAGE_PART]);
		await wrapped("https://gateway.test/v1/models");
		const sent = (passed.mock.calls[0] as unknown[])[0] as Request;
		expect(sent.url).toBe("https://gateway.test/v1/models");
		expect(sent.method).toBe("GET");
	});

	it("counts the tools' spend with the model's, against the limit and in the cost", async () => {
		const fetchImpl = vi.fn(async () => sse([COMPLETED]));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const steps: number[] = [];
		const modelCosts: number[] = [];
		const output = await runner.run(request({ otherCostUsd: () => 0.04 }), {
			onText: async () => {},
			onStep: async (progress) => { steps.push(progress.costUsd); },
			onCost: (usd) => { modelCosts.push(usd); },
		});
		expect(modelCosts).toEqual([0.0021]);
		expect(steps.map((usd) => Math.round(usd * 10_000) / 10_000)).toEqual([0.0421]);
		expect(Math.round(output.costUsd * 10_000) / 10_000).toBe(0.0421);

		// An image that takes the run to its limit stops it there, as model spend would.
		const tool = { id: "draw", description: "Draw", parameters: { type: "object", properties: {} }, execute: async () => ({ posted: true }) };
		let calls = 0;
		const looping = vi.fn(async () => {
			calls += 1;
			return sse([{ ...COMPLETED, response: { ...COMPLETED.response, output: [{ type: "function_call", call_id: `call_${calls}`, name: "draw", arguments: "{}" }] } }]);
		});
		const stopped = await createSdkAgentRunner({ fetchImpl: looping as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" })
			.run(request({ tools: [tool], maxCostUsd: 0.5, otherCostUsd: () => 0.5 }), { onText: async () => {}, onStep: async () => {} });
		expect(stopped.stopReason).toBe("max_cost:0.5");
		expect(calls).toBe(1);
	});

	it("makes an image through the gateway with the turn's key, labels, end user and session, and reads its cost", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(await capture(input, init));
			return Response.json({ created: 1, model: "openai/gpt-image-2", data: [{ b64_json: btoa(String.fromCharCode(...PNG)) }], cost_nanos: 42_000_000 });
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const image = await runner.generateImage!({
			gatewayKey: "phaseo_v1_sk_testkid00000_testsecret", model: "openai/gpt-image-2", prompt: "A lighthouse", size: "1024x1024",
			endUser: "slack:T0TEST0001:U0PERSON01", sessionId: "slack-Ev0TEST0001", labels: { slackTeam: "T0TEST0001", slackChannel: "C0CHANNEL1" },
			signal: new AbortController().signal,
		});
		expect(image).toEqual({ bytes: PNG, mimeType: "image/png", costUsd: 0.042, model: "openai/gpt-image-2" });
		expect(seen[0].url).toBe("https://gateway.test/v1/images/generations");
		expect(seen[0].headers.get("authorization")).toBe("Bearer phaseo_v1_sk_testkid00000_testsecret");
		expect(seen[0].headers.get("x-title")).toBe("Phaseo Slack agent");
		expect(seen[0].headers.get("x-phaseo-session-id")).toBe("slack-Ev0TEST0001");
		expect(JSON.parse(seen[0].headers.get("x-phaseo-metadata")!).labels).toContainEqual({ key: "app", value: "slack-agent" });
		expect(seen[0].body).toEqual({ model: "openai/gpt-image-2", prompt: "A lighthouse", n: 1, size: "1024x1024", quality: "medium", user: "slack:T0TEST0001:U0PERSON01" });
	});

	it("turns an image refusal into an error the turn can classify, and refuses anything that isn't an image", async () => {
		const imageRequest = {
			gatewayKey: "k", model: "openai/gpt-image-2", prompt: "A cat", size: "1024x1024" as const, endUser: "slack:T:U", sessionId: "s",
			labels: { slackTeam: "T", slackChannel: "C" }, signal: new AbortController().signal,
		};
		const refused = createSdkAgentRunner({ fetchImpl: (async () => Response.json({ error: "insufficient_credits" }, { status: 402 })) as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const error = await refused.generateImage!(imageRequest).catch((caught: unknown) => caught);
		expect(classifyTurnError(error)).toBe("no_credits");
		const notImage = createSdkAgentRunner({ fetchImpl: (async () => Response.json({ data: [{ b64_json: btoa("<html>") }], cost_nanos: 40_000_000 })) as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const unread = await notImage.generateImage!(imageRequest).catch((caught: unknown) => caught);
		// Billed all the same: the cost goes with the error.
		expect(unread).toBeInstanceOf(ImageNotReadError);
		expect((unread as ImageNotReadError).costUsd).toBe(0.04);
		const lostDownload = createSdkAgentRunner({
			fetchImpl: (async (input: RequestInfo | URL) => String(input).endsWith("/images/generations")
				? Response.json({ data: [{ url: "https://images.test/fox.png" }], cost_nanos: 40_000_000 })
				: Promise.reject(new TypeError("network"))) as unknown as typeof fetch,
			baseUrl: "https://gateway.test/v1",
		});
		await expect(lostDownload.generateImage!(imageRequest)).rejects.toMatchObject({ name: "ImageNotReadError", costUsd: 0.04 });
		// A null or blank cost_nanos is no amount: the usage pricing is read instead of counting $0.
		const nullNanos = createSdkAgentRunner({
			fetchImpl: (async () => Response.json({ data: [{ b64_json: btoa(String.fromCharCode(...PNG)) }], cost_nanos: null, usage: { pricing: { total_nanos: "35000000" } } })) as unknown as typeof fetch,
			baseUrl: "https://gateway.test/v1",
		});
		await expect(nullNanos.generateImage!(imageRequest)).resolves.toMatchObject({ costUsd: 0.035 });
	});

	it("says when the model can't read the files shared", () => {
		const error = new AgentGatewayError({ status: 400, statusText: "Bad Request", body: { error: "unsupported_modalities", reason: "unsupported_modalities" }, message: "unsupported" });
		expect(classifyTurnError(error, "phaseo/auto")).toBe("files_unsupported");
		expect(turnErrorText("files_unsupported")).toBe("The model this agent uses can't read the files shared here. Ask again without them, or an admin can choose a model that reads images and PDFs in Phaseo settings.");
		expect(turnErrorText("files_unsupported", true)).toContain("The model you chose for this message can't read the files shared here.");
	});
});

describe("after a Slack search", () => {
	const NO_ZDR_ROUTE = noZeroDataRetentionRoute();

	it("sends every request from the first search on only to providers that keep no data, and none before it", async () => {
		const bodies: Array<Record<string, any>> = [];
		let searched = false;
		const asked: boolean[] = [];
		const search = { id: "search_slack", description: "Search", parameters: { type: "object", properties: {} }, execute: async () => { searched = true; return { found: true }; } };
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			bodies.push((await capture(input, init)).body);
			if (bodies.length === 1) return sse([{ ...COMPLETED, response: { ...COMPLETED.response, output: [{ type: "function_call", call_id: "call_s1", name: "search_slack", arguments: "{}" }] } }]);
			return sse([COMPLETED]);
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		await runner.run(request({ model: "openai/gpt-test", tools: [search], zeroDataRetention: async () => { asked.push(searched); return searched; } }), { onText: async () => undefined, onStep: async () => undefined });
		expect(bodies).toHaveLength(2);
		// The first request went before the search; the one that carries its results, and any after, keep no data.
		expect(bodies[0]).not.toHaveProperty("provider");
		expect(bodies[1].provider).toEqual({ require_zero_data_retention: true });
		// Without the gateway's web tools once it has searched: nothing found leaves in a query or a URL.
		expect(bodies[0].tools.map((tool: { type: string }) => tool.type)).toEqual(expect.arrayContaining(["phaseo:web_search", "phaseo:web_fetch"]));
		expect(bodies[1].tools.map((tool: { type: string }) => tool.type)).toEqual(["function"]);
		expect(JSON.stringify(bodies[1].tools)).toContain("search_slack");
		expect(JSON.stringify(bodies[1].input)).toContain("call_s1");
		// Asked before each request, not once for the run.
		expect(asked).toEqual([false, true]);
		// Never the field the gateway rejects.
		expect(JSON.stringify(bodies)).not.toContain("data_collection");
	});

	it("keeps the request's other provider fields, with the files added, and leaves requests that don't go to a model alone", async () => {
		const sent: Request[] = [];
		const passed = vi.fn(async (input: RequestInfo | URL) => { sent.push(input as Request); return new Response("{}"); });
		const wrapped = withZeroDataRetention(withAttachments(passed as unknown as typeof fetch, [{ type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo=" }]), async () => true);
		await wrapped("https://gateway.test/v1/responses", { method: "POST", body: JSON.stringify({ model: "openai/gpt-test", provider: { sort: "price", require_zero_data_retention: false }, input: [{ role: "user", content: "hello" }] }) });
		const body = await sent[0].json() as Record<string, any>;
		expect(body.provider).toEqual({ sort: "price", require_zero_data_retention: true });
		expect(body.input[0].content).toHaveLength(2);
		await wrapped("https://gateway.test/v1/models");
		await wrapped("https://images.test/fox.png");
		expect(sent.slice(1).map((request) => `${request.method} ${request.url}`)).toEqual(["GET https://gateway.test/v1/models", "GET https://images.test/fox.png"]);
		// A model request it can't read isn't sent without the flag.
		await expect(wrapped("https://gateway.test/v1/responses", { method: "POST", body: "not json" })).rejects.toThrow("zero_data_retention_not_applied");
		expect(sent).toHaveLength(3);
		expect(withZeroDataRetention(passed as unknown as typeof fetch, undefined)).toBe(passed);
	});

	it("sends the models it asks and the images it makes only to providers that keep no data", async () => {
		const seen: Array<Awaited<ReturnType<typeof capture>>> = [];
		const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const sent = await capture(input, init);
			seen.push(sent);
			return sent.url.endsWith("/images/generations")
				? Response.json({ data: [{ b64_json: btoa(String.fromCharCode(...PNG)) }], cost_nanos: 40_000_000 })
				: Response.json({ ...COMPLETED.response, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Yes." }] }] });
		});
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const { gatewayKey, endUser, sessionId, labels, signal } = request();
		const ask: AskRequest = { gatewayKey, endUser, sessionId, labels, signal, model: "anthropic/claude-test", instructions: "Answer directly.", prompt: "Right?", webTools: false, maxOutputTokens: 4_000 };
		await runner.ask(ask);
		await runner.ask({ ...ask, zeroDataRetention: async () => true });
		await runner.generateImage!({ gatewayKey, endUser, sessionId, labels, signal, model: "openai/gpt-image-2", prompt: "A fox", size: "1024x1024", zeroDataRetention: async () => true });
		expect(seen.map((sent) => sent.body.provider ?? null)).toEqual([null, { require_zero_data_retention: true }, { require_zero_data_retention: true }]);
	});

	it("says so when no provider that keeps no data could answer, and only after a search", async () => {
		const refusal = new AgentGatewayError({ status: 403, statusText: "Forbidden", body: NO_ZDR_ROUTE });
		expect(classifyTurnError(refusal, "openai/gpt-test", true)).toBe("search_needs_zdr");
		expect(classifyTurnError(new Error("run failed", { cause: refusal }), "openai/gpt-test", true)).toBe("search_needs_zdr");
		// The same code before a search isn't about zero data retention.
		expect(classifyTurnError(refusal, "openai/gpt-test")).toBe("failed");
		// Other refusals after a search are what they always were.
		expect(classifyTurnError(new AgentGatewayError({ status: 402, statusText: "Payment Required", body: { error: { code: "insufficient_funds" } } }), "openai/gpt-test", true)).toBe("no_credits");
		// The gateway's own field for it is enough too.
		const named = { error: { code: "model_region_unavailable", message: "No provider for this model meets this request's residency requirements." }, code: "model_region_unavailable", unmet_requirements: { zero_data_retention: true } };
		expect(classifyTurnError(new AgentGatewayError({ status: 403, statusText: "Forbidden", body: named }), "openai/gpt-test", true)).toBe("search_needs_zdr");
		expect(turnErrorText("search_needs_zdr")).toBe("I stopped here: after a Slack search, I can only use AI providers that keep no data (zero data retention), and none could answer with this agent's model. An admin can choose a model that keeps no data in Phaseo settings.");
		expect(turnErrorText("search_needs_zdr", true)).toContain("none could answer with the model you chose for this message. Ask again with a model that keeps no data");
		expect(turnErrorText("search_needs_zdr")).not.toMatch(/region|guardrail|policy/i);
	});

	it("says no provider kept no data only when the gateway says that is what no route met", () => {
		const forbidden = (body: Record<string, unknown>) => new AgentGatewayError({ status: 403, statusText: "Forbidden", body });
		// The same code for a request from a country none of the model's routes serves.
		expect(classifyTurnError(forbidden(noRouteInCountry()), "openai/gpt-test", true)).toBe("failed");
		// Or with no diagnostics at all.
		expect(classifyTurnError(forbidden({ error: { code: "model_region_unavailable" }, code: "model_region_unavailable" }), "openai/gpt-test", true)).toBe("failed");
		// A residency gate that dropped routes for their region only.
		const region = noZeroDataRetentionRoute() as { routing_diagnostics: { filterStages: Array<Record<string, any>> } };
		const regional = structuredClone(region);
		regional.routing_diagnostics.filterStages[1].droppedProviders = [{ providerId: "us-cloud", reason: "execution_region_mismatch" }];
		expect(classifyTurnError(forbidden(regional), "openai/gpt-test", true)).toBe("failed");
		// A route that needs the workspace's own provider key: its body doesn't say zero data retention left only such routes.
		const byok = new AgentGatewayError({ status: 400, statusText: "Bad Request", body: { error: { code: "byok_credentials_required", message: "The selected route requires your own provider credential." }, code: "byok_credentials_required", error_type: "user" } });
		expect(classifyTurnError(byok, "openai/gpt-test", true)).toBe(classifyTurnError(byok, "openai/gpt-test"));
		expect(classifyTurnError(byok, "openai/gpt-test", true)).not.toBe("search_needs_zdr");
	});

	it("sends Auto's requests after a search with the flag too, and says so when no model Auto may choose keeps no data", async () => {
		const sent: Array<Record<string, any>> = [];
		const passed = vi.fn(async (input: RequestInfo | URL) => { sent.push(JSON.parse(await (input as Request).text())); return new Response("{}"); });
		let searched = false;
		const wrapped = withZeroDataRetention(passed as unknown as typeof fetch, async () => searched);
		await wrapped("https://gateway.test/v1/responses", { method: "POST", body: JSON.stringify({ model: "phaseo/auto", input: "hello" }) });
		searched = true;
		// The gateway's auto router picks only among models with a provider that keeps no data, and its classifier request carries the flag.
		await wrapped("https://gateway.test/v1/responses", { method: "POST", body: JSON.stringify({ model: "phaseo/auto", input: "what the search found", tools: [{ type: "phaseo:web_search" }] }) });
		expect(sent[0]).not.toHaveProperty("provider");
		expect(sent[1].provider).toEqual({ require_zero_data_retention: true });
		expect(sent[1].tools).toEqual([]);

		// Auto's refusal when the workspace's Auto settings leave no such model.
		const autoRefusal = new AgentGatewayError({
			status: 403,
			statusText: "Forbidden",
			body: {
				error: { code: "model_region_unavailable", message: "No model Auto can choose has a provider that offers zero data retention." },
				code: "model_region_unavailable",
				reason: "no_provider_meets_residency_requirements",
				unmet_requirements: { zero_data_retention: true },
				routing_diagnostics: { autoRouter: { candidates: [{ model: "openai/gpt-test", eligible: false, reason: "no_residency_compliant_providers" }] } },
			},
		});
		expect(classifyTurnError(autoRefusal, "phaseo/auto", true)).toBe("search_needs_zdr");
		expect(classifyTurnError(autoRefusal, "phaseo/auto")).not.toBe("search_needs_zdr");
	});
});
