import { beforeEach, describe, expect, it, vi } from "vitest";

const { beforeRequestMock, handleErrorMock, runnerMock } = vi.hoisted(() => ({
	beforeRequestMock: vi.fn(),
	handleErrorMock: vi.fn(async ({ res }: { res: Response }) => res),
	runnerMock: vi.fn(),
}));

vi.mock("./before", () => ({ beforeRequest: beforeRequestMock }));
vi.mock("./registry", () => ({ resolvePipeline: () => runnerMock }));
vi.mock("@core/error-handler", () => ({ handleError: handleErrorMock }));
vi.mock("./audit", () => ({ auditFailure: vi.fn() }));
vi.mock("./error-response", () => ({
	buildPipelineExecutionErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
	logPipelineExecutionError: vi.fn(),
}));

import { makeEndpointHandler } from "./index";

function requestContext(model: string, models: string[] = [], extra: Record<string, any> = {}) {
	return {
		meta: {},
		model,
		requestId: `req_${model}`,
		rawBody: { model, input: "hello" },
		routingDiagnostics: models.length ? { requestModelFallbacks: { requested: models, models } } : {},
		...extra,
	};
}

// Every endpoint served through makeEndpointHandler (see routes/v1/data).
const PIPELINE_ENDPOINTS = [
	"chat.completions",
	"responses",
	"messages",
	"embeddings",
	"images.generations",
	"images.edits",
	"audio.speech",
	"audio.transcription",
	"audio.translations",
	"video.generation",
	"music.generate",
	"rerank",
	"moderations",
	"ocr",
	"parse",
	"decisions",
] as const;

function post(path = "responses", body: unknown = { model: "primary/model", models: ["fallback/model"], input: "hello" }) {
	return new Request(`https://api.phaseo.app/v1/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("request-level models fallbacks", () => {
	beforeEach(() => {
		beforeRequestMock.mockReset();
		handleErrorMock.mockClear();
		runnerMock.mockReset();
	});

	it.each(PIPELINE_ENDPOINTS)("falls back to the next request model on %s", async (endpoint) => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["fallback/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("fallback/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ model: "fallback/model" }), { status: 200 }));

		const response = await makeEndpointHandler({ endpoint, schema: null })(post());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ model: "fallback/model" });
		expect(beforeRequestMock.mock.calls[1]?.[1]).toBe(endpoint);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({ requestModelOverride: "fallback/model" }));
		expect(beforeRequestMock.mock.calls[1]?.[4]).not.toHaveProperty("dynamicRouteModelOverride");
		expect(runnerMock.mock.calls[1]?.[0].pre.ctx.model).toBe("fallback/model");
	});

	it.each([429, 500, 502, 503, 504])("treats %s as a fallback trigger", async (status) => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["fallback/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("fallback/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("failed", { status }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "embeddings", schema: null })(post("embeddings"));

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(2);
	});

	it.each([400, 401, 402, 403, 404, 408, 413, 422])("returns %s without trying fallbacks", async (status) => {
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["fallback/model"]) });
		runnerMock.mockResolvedValueOnce(new Response("client error", { status }));

		const response = await makeEndpointHandler({ endpoint: "images.generations", schema: null })(post("images/generations"));

		expect(response.status).toBe(status);
		expect(beforeRequestMock).toHaveBeenCalledTimes(1);
	});

	it("never retries a stream that has already started", async () => {
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["fallback/model"]) });
		runnerMock.mockResolvedValueOnce(new Response('data: {"error":"upstream reset"}\n\n', {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		}));

		const response = await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(post("chat/completions"));

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(1);
	});

	it("tries fallbacks in order and records every previous attempt on the serving request", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["first/model", "second/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("first/model") })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("second/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
			.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "audio.speech", schema: null })(post("audio/speech"));

		expect(response.status).toBe(200);
		expect(beforeRequestMock.mock.calls.map((call) => call[4]?.requestModelOverride)).toEqual([
			undefined,
			"first/model",
			"second/model",
		]);
		expect(runnerMock.mock.calls[2]?.[0].pre.ctx.routingDiagnostics.modelFallback).toEqual({
			source: "request",
			primaryModel: "primary/model",
			primaryRequestId: "req_primary/model",
			models: ["first/model", "second/model"],
			attempt: 2,
			previousAttempts: [
				{ model: "primary/model", status: 429, stage: "execute" },
				{ model: "first/model", status: 502, stage: "execute" },
			],
		});
	});

	it("submits async video jobs once per model and stops at the first accepted submission", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/video", ["fallback/video", "unused/video"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("fallback/video") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: "video_1", status: "queued" }), { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "video.generation", schema: null })(post("videos"));

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(2);
	});

	it("skips a fallback that cannot serve the request and keeps the upstream failure", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["unsupported/model"]) })
			.mockResolvedValueOnce({
				ok: false,
				response: new Response(JSON.stringify({ error: "validation_error" }), { status: 400 }),
			});
		runnerMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

		const response = await makeEndpointHandler({ endpoint: "rerank", schema: null })(post("rerank"));

		expect(response.status).toBe(503);
		expect(runnerMock).toHaveBeenCalledTimes(1);
		expect(handleErrorMock).toHaveBeenCalledWith(expect.objectContaining({ stage: "before" }));
	});

	it("skips a fallback that resolves to a model already attempted", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["alias/of-primary", "other/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model") })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("other/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "moderations", schema: null })(post("moderations"));

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(2);
		expect(runnerMock.mock.calls[1]?.[0].pre.ctx.model).toBe("other/model");
	});

	it("tries a provider-pinned fallback for the same model on a different provider", async () => {
		const pinned = (providerId: string) => ({ providers: [{ providerId }] });
		beforeRequestMock
			.mockResolvedValueOnce({
				ok: true,
				ctx: requestContext("openai/gpt-5", ["azure:openai/gpt-5"], pinned("openai")),
			})
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("openai/gpt-5", [], pinned("azure")) });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(post("chat/completions"));

		expect(response.status).toBe(200);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({ requestModelOverride: "azure:openai/gpt-5" }));
		expect(runnerMock).toHaveBeenCalledTimes(2);
	});

	it("tries a preset fallback that resolves to the same model and providers", async () => {
		const openai = { providers: [{ providerId: "openai" }] };
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("openai/gpt-5", ["@support"], openai) })
			.mockResolvedValueOnce({
				ok: true,
				ctx: requestContext("openai/gpt-5", [], { ...openai, preset: { id: "preset_support", name: "support" } }),
			});
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(200);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({ requestModelOverride: "@support" }));
		expect(runnerMock).toHaveBeenCalledTimes(2);
	});

	it("re-sends the body as received rather than the guardrail-redacted copy", async () => {
		const primary = requestContext("primary/model", ["fallback/model"], {
			rawBody: { model: "primary/model", input: "call [REDACTED]" },
		});
		Object.defineProperty(primary, "retryRawBody", {
			value: { model: "primary/model", input: "call 555-0100" },
			enumerable: false,
		});
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: primary })
			.mockImplementationOnce(async (fallbackReq: Request) => {
				await expect(fallbackReq.json()).resolves.toEqual({ model: "primary/model", input: "call 555-0100" });
				return { ok: true, ctx: requestContext("fallback/model") };
			});
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(200);
		expect(beforeRequestMock).toHaveBeenCalledTimes(2);
	});

	it("tries every request fallback beyond the dynamic-route limit of eight", async () => {
		const fallbacks = Array.from({ length: 12 }, (_, i) => `fallback/model-${i}`);
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", fallbacks) });
		for (const model of fallbacks) beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext(model) });
		for (let i = 0; i < 12; i += 1) runnerMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
		runnerMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(200);
		expect(runnerMock).toHaveBeenCalledTimes(13);
		expect(runnerMock.mock.calls[12]?.[0].pre.ctx.model).toBe("fallback/model-11");
	});

	it("keeps dynamic-route fallbacks capped at eight", async () => {
		const routeFallbacks = Array.from({ length: 12 }, (_, i) => `route/model-${i}`);
		beforeRequestMock.mockResolvedValueOnce({
			ok: true,
			ctx: requestContext("primary/model", [], {
				routingDiagnostics: { dynamicRoute: { action: { modelFallbacks: routeFallbacks } } },
			}),
		});
		for (const model of routeFallbacks) beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext(model) });
		runnerMock.mockResolvedValue(new Response("unavailable", { status: 503 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(503);
		expect(runnerMock).toHaveBeenCalledTimes(9);
	});

	it("returns the last failure once every fallback is exhausted", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("primary/model", ["fallback/model"]) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("fallback/model") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("timeout", { status: 504 }));

		const response = await makeEndpointHandler({ endpoint: "ocr", schema: null })(post("ocr"));

		expect(response.status).toBe(504);
	});

	it("lets dynamic-route fallbacks take precedence over request models", async () => {
		beforeRequestMock
			.mockResolvedValueOnce({
				ok: true,
				ctx: requestContext("primary/model", [], {
					routingDiagnostics: {
						dynamicRoute: { action: { modelFallbacks: ["route/fallback"] } },
						requestModelFallbacks: { requested: ["request/fallback"], models: ["request/fallback"] },
					},
				}),
			})
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("route/fallback") });
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(beforeRequestMock).toHaveBeenCalledTimes(2);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({ dynamicRouteModelOverride: "route/fallback" }));
		expect(runnerMock.mock.calls[1]?.[0].pre.ctx.routingDiagnostics.modelFallback.source).toBe("dynamic_route");
	});

	it.each([
		["audio.transcription", "audio/transcriptions", "file"],
		["audio.translations", "audio/translations", "file"],
		["images.edits", "images/edits", "image"],
	] as const)("re-sends multipart uploads for %s fallbacks", async (endpoint, path, fileField) => {
		const file = new File([new Uint8Array([1, 2, 3])], "upload.bin", { type: "application/octet-stream" });
		beforeRequestMock
			.mockResolvedValueOnce({
				ok: true,
				ctx: requestContext("primary/model", ["fallback/model"], {
					rawBody: { model: "primary/model", [fileField]: file, include: ["logprobs"], prompt: "hi" },
				}),
			})
			.mockImplementationOnce(async (fallbackReq: Request) => {
				expect(fallbackReq.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
				const form = await fallbackReq.formData();
				const uploaded = form.get(fileField) as File;
				expect(uploaded.name).toBe("upload.bin");
				expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
				expect(form.getAll("include[]")).toEqual(["logprobs"]);
				expect(form.get("prompt")).toBe("hi");
				return { ok: true, ctx: requestContext("fallback/model") };
			});
		runnerMock
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));
		const form = new FormData();
		form.append("model", "primary/model");
		form.append("models", "fallback/model");
		form.append(fileField, file);

		const response = await makeEndpointHandler({ endpoint, schema: null })(new Request(`https://api.phaseo.app/v1/${path}`, {
			method: "POST",
			body: form,
		}));

		expect(response.status).toBe(200);
		expect(beforeRequestMock).toHaveBeenCalledTimes(2);
	});
});
