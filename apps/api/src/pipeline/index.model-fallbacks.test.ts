import { beforeEach, describe, expect, it, vi } from "vitest";

const { beforeRequestMock, handleErrorMock, runnerMock, policyRejectedMock } = vi.hoisted(() => ({
	policyRejectedMock: vi.fn((_ctx: unknown) => false),
	beforeRequestMock: vi.fn(),
	handleErrorMock: vi.fn(async ({ res }: { res: Response }) => res),
	runnerMock: vi.fn(),
}));

vi.mock("./before", () => ({ beforeRequest: beforeRequestMock }));
vi.mock("./registry", () => ({ resolvePipeline: () => runnerMock }));
vi.mock("@core/error-handler", () => ({ handleError: handleErrorMock }));
vi.mock("./audit", () => ({ auditFailure: vi.fn() }));
vi.mock("@core/rate-limit-policies", () => ({
	rejectedByRateLimitPolicy: policyRejectedMock,
	withRateLimitPolicyHeaders: (response: Response, ctx: { model: string }) => {
		response.headers.set("x-test-policy-ctx", ctx.model);
		return response;
	},
}));
vi.mock("./error-response", () => ({
	buildPipelineExecutionErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
	logPipelineExecutionError: vi.fn(),
}));

import { makeEndpointHandler } from "./index";

function context(model: string, modelFallbacks: string[] = []) {
	return {
		meta: {},
		model,
		routingDiagnostics: { dynamicRoute: { action: { modelFallbacks } } },
	};
}

function autoRouterContext(model: string, fallbackModels: string[] = []) {
	return {
		meta: {},
		model,
		routingDiagnostics: {
			autoRouter: {
				fallbackModels,
				classification: {
					primaryWorkload: "code",
					workloads: [{ workload: "code", weight: 1 }],
					complexity: 0.7,
					confidence: 0.9,
					signals: ["llm_classifier"],
					source: "llm",
					classifierModel: "google/gemini-2.5-flash-lite",
				},
			},
		},
	};
}

describe("dynamic route model fallbacks", () => {
	beforeEach(() => {
		beforeRequestMock.mockReset();
		handleErrorMock.mockClear();
		runnerMock.mockReset();
		policyRejectedMock.mockReset().mockReturnValue(false);
	});

	it("does not try fallback models after a rate limit policy rejection", async () => {
		const primary = { ...context("primary/model", ["fallback/model"]), billingRequestId: "primary-billing" };
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: primary });
		runnerMock.mockResolvedValueOnce(new Response("limited", { status: 429 }));
		policyRejectedMock.mockImplementation((ctx) => ctx === primary);

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "request/model", input: "hello" }),
		}));

		expect(response.status).toBe(429);
		expect(response.headers.get("x-test-policy-ctx")).toBe("primary/model");
		expect(beforeRequestMock).toHaveBeenCalledTimes(1);
		expect(runnerMock).toHaveBeenCalledTimes(1);
	});

	it("counts a model fallback under the primary request's rate limit admission", async () => {
		const fallback: Record<string, unknown> = { ...context("fallback/model"), billingRequestId: "fallback-billing" };
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: { ...context("primary/model", ["fallback/model"]), billingRequestId: "primary-billing" } })
			.mockResolvedValueOnce({ ok: true, ctx: fallback });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "request/model", input: "hello" }),
		}));

		expect(response.status).toBe(200);
		expect(fallback.rateLimitAdmissionId).toBe("primary-billing");
		expect(response.headers.get("x-test-policy-ctx")).toBe("fallback/model");
	});

	it("passes parsed request metadata to before-stage error telemetry", async () => {
		const requestPayload = {
			model: "openai/gpt-5-nano",
			input: "private prompt",
		};
		beforeRequestMock.mockImplementationOnce(async (...args: any[]) => {
			args[4]?.onObservabilitySnapshot?.({
				requestPayload,
				requestedModel: "openai/gpt-5-nano",
				model: "openai/gpt-5-nano",
			});
			return {
				ok: false,
				response: new Response(JSON.stringify({ error: "insufficient_funds" }), { status: 402 }),
			};
		});
		const req = new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: JSON.stringify(requestPayload),
		});

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(req);

		expect(response.status).toBe(402);
		expect(handleErrorMock).toHaveBeenCalledWith(expect.objectContaining({
			req,
			requestBodyReq: undefined,
			requestObservability: {
				requestPayload,
				requestedModel: "openai/gpt-5-nano",
				model: "openai/gpt-5-nano",
			},
		}));
	});

	it("executes auto-router classification as a normal pipeline request", async () => {
		beforeRequestMock
			.mockImplementationOnce(async (...args: any[]) => {
				const classification = await args[4]?.classifyAutoRouterRequest?.({
					endpoint: "responses",
					body: { model: "phaseo/auto", input: "Refactor this parser" },
				});
				expect(classification).toMatchObject({ primaryWorkload: "code", complexity: 0.7, source: "llm" });
				return { ok: true, ctx: autoRouterContext("model/selected") };
			})
			.mockImplementationOnce(async (childRequest: Request) => {
				expect(childRequest.headers.get("authorization")).toBe("Bearer phaseo_test_key");
				expect(childRequest.headers.has("x-phaseo-metadata")).toBe(false);
				return { ok: true, ctx: context("google/gemini-2.5-flash-lite") };
			});
		runnerMock
			.mockResolvedValueOnce(new Response(JSON.stringify({
				output_text: JSON.stringify({
					primary_workload: "code",
					workloads: [{ workload: "code", weight: 1 }],
					complexity: 0.7,
					confidence: 0.9,
				}),
			}), { status: 200, headers: { "content-type": "application/json" } }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { authorization: "Bearer phaseo_test_key", "content-type": "application/json" },
			body: JSON.stringify({ model: "phaseo/auto", input: "Refactor this parser" }),
		}));

		expect(response.status).toBe(200);
		expect(beforeRequestMock).toHaveBeenCalledTimes(2);
		expect(runnerMock).toHaveBeenCalledTimes(2);
	});

	it("reruns the full pipeline with the next model after a retryable failure", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: context("primary/model", ["fallback/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: context("fallback/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "request/model", input: "hello" }),
		}));

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(2);
		expect(beforeRequestMock).toHaveBeenCalledTimes(2);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({
			dynamicRouteModelOverride: "fallback/model",
			onObservabilitySnapshot: expect.any(Function),
		}));
	});

	it("does not switch models for a non-retryable client error", async () => {
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: context("primary/model", ["fallback/model"]) });
		runnerMock.mockResolvedValueOnce(new Response("invalid", { status: 400 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "request/model", input: "hello" }),
		}));

		expect(response.status).toBe(400);
		expect(runnerMock).toHaveBeenCalledTimes(1);
		expect(beforeRequestMock).toHaveBeenCalledTimes(1);
	});

	it("reruns phaseo/auto with the next ranked allow-listed model", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: autoRouterContext("model/primary", ["model/fallback"]) })
			.mockResolvedValueOnce({ ok: true, ctx: autoRouterContext("model/fallback") });
		runnerMock
			.mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(new Request("https://api.phaseo.app/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "phaseo/auto", input: "hello" }),
		}));

		expect(response.status).toBe(200);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({
			autoRouterModelOverride: "model/fallback",
			autoRouterClassificationOverride: expect.objectContaining({ primaryWorkload: "code", complexity: 0.7 }),
		}));
	});
});
