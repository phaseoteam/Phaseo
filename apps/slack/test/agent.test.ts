import { AgentGatewayError } from "@phaseo/agent-sdk";
import { describe, expect, it, vi } from "vitest";
import { classifyTurnError, createSdkAgentRunner, gatewayBaseUrl, gatewayFetch, turnErrorText, type AgentTurnRequest } from "../src/agent";

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

	it("surfaces a gateway refusal from a streamed request as an error the turn can classify", async () => {
		const fetchImpl = vi.fn(async () => Response.json({ error: { code: "insufficient_funds", message: "Not enough credits" } }, { status: 402 }));
		const runner = createSdkAgentRunner({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "https://gateway.test/v1" });
		const failure = await runner.run(request(), { onText: async () => undefined, onStep: async () => undefined }).then(() => null, (caught: unknown) => caught);
		expect(classifyTurnError(failure)).toBe("no_credits");
	});
});
