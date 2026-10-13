import { beforeEach, describe, expect, it, vi } from "vitest";

const { beforeRequestMock, handleErrorMock, runnerMock, recordMock, dispatchMock } = vi.hoisted(() => ({
	beforeRequestMock: vi.fn(),
	handleErrorMock: vi.fn(async ({ res }: { res: Response }) => res),
	runnerMock: vi.fn(),
	recordMock: vi.fn(),
	dispatchMock: vi.fn(),
}));

vi.mock("./before", () => ({ beforeRequest: beforeRequestMock }));
vi.mock("./registry", () => ({ resolvePipeline: () => runnerMock }));
vi.mock("@core/error-handler", () => ({ handleError: handleErrorMock }));
vi.mock("./audit", () => ({ auditFailure: vi.fn() }));
vi.mock("./before/modelSuccessor", async (importOriginal) => ({
	...await importOriginal<typeof import("./before/modelSuccessor")>(),
	recordModelSubstitution: recordMock,
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...await importOriginal<typeof import("@/runtime/env")>(),
	dispatchBackground: dispatchMock,
}));
vi.mock("./error-response", () => ({
	buildPipelineExecutionErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
	logPipelineExecutionError: vi.fn(),
}));

import { makeEndpointHandler } from "./index";

function requestContext(model: string, routingDiagnostics: Record<string, any> = {}) {
	return { meta: {}, model, requestId: `req_${model}`, rawBody: { model, input: "hello" }, routingDiagnostics };
}

function unservedFailure(models: string[]) {
	return {
		ok: false,
		response: new Response(JSON.stringify({ error: "model_retired" }), { status: 410 }),
		unservedModelFallback: {
			model: "lab/old",
			requestId: "req_old",
			retryRawBody: { model: "lab/old", input: "hello" },
			models,
		},
	};
}

function post() {
	return new Request("https://api.phaseo.app/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ model: "lab/old", models: ["lab/a", "lab/b"], input: "hello" }),
	});
}

describe("model successor routing in the pipeline", () => {
	beforeEach(() => {
		beforeRequestMock.mockReset();
		handleErrorMock.mockClear();
		runnerMock.mockReset();
		recordMock.mockReset();
		dispatchMock.mockReset();
	});

	it("tells the client which model it asked for when a successor served it", async () => {
		beforeRequestMock.mockResolvedValueOnce({
			ok: true,
			ctx: requestContext("lab/new", { modelSubstitution: { from: "lab/old", to: "lab/new", reason: "unserved", chain: ["lab/new"] } }),
		});
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("x-phaseo-requested-model")).toBe("lab/old");
		expect(response.headers.get("x-phaseo-model-substitution")).toBe("reason=unserved; from=lab/old; to=lab/new");
	});

	it("queues the workspace's one-off notice only when the successor answered", async () => {
		const substitution = { from: "lab/old", to: "lab/new", reason: "unserved", chain: ["lab/new"], source: "approved" };
		const recording = Promise.resolve();
		recordMock.mockReturnValue(recording);
		const succeed = (overrides: Record<string, unknown> = {}) => beforeRequestMock.mockResolvedValueOnce({
			ok: true,
			ctx: { ...requestContext("lab/new", { modelSubstitution: substitution }), workspaceId: "ws_1", ...overrides },
		});

		succeed();
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
		await makeEndpointHandler({ endpoint: "responses", schema: null })(post());
		expect(recordMock).toHaveBeenCalledWith("ws_1", substitution);
		expect(dispatchMock).toHaveBeenCalledWith(recording);

		recordMock.mockClear();
		succeed();
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
		await makeEndpointHandler({ endpoint: "responses", schema: null })(post());
		succeed({ testingMode: true });
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
		await makeEndpointHandler({ endpoint: "responses", schema: null })(post());
		expect(recordMock).not.toHaveBeenCalled();
	});

	it("adds no headers to ordinary responses", async () => {
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: requestContext("lab/new") });
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.headers.has("x-phaseo-requested-model")).toBe(false);
	});

	it("tries the request's own models in order when the first model has no provider", async () => {
		beforeRequestMock
			.mockResolvedValueOnce(unservedFailure(["lab/a", "lab/b"]))
			.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 400 }) })
			.mockResolvedValueOnce({ ok: true, ctx: requestContext("lab/b") });
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(200);
		expect(beforeRequestMock.mock.calls[1]?.[4]).toEqual(expect.objectContaining({ requestModelOverride: "lab/a", allowModelSuccessor: false }));
		// Only the last model in the list may be redirected to its successor.
		expect(beforeRequestMock.mock.calls[2]?.[4]).toEqual(expect.objectContaining({ requestModelOverride: "lab/b", allowModelSuccessor: true }));
		expect(runnerMock.mock.calls[0]?.[0].pre.ctx.routingDiagnostics.modelFallback).toMatchObject({
			source: "request",
			primaryModel: "lab/old",
			primaryRequestId: "req_old",
			previousAttempts: [{ model: "lab/old", status: 410, stage: "before" }, { model: "lab/a", status: 400, stage: "before" }],
		});
		const fallbackBody = await (beforeRequestMock.mock.calls[1]?.[0] as Request).json();
		expect(fallbackBody).toEqual({ model: "lab/old", input: "hello" });
	});

	it("returns the original failure when no model in the list can serve the request", async () => {
		beforeRequestMock
			.mockResolvedValueOnce(unservedFailure(["lab/a"]))
			.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 400 }) });

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(410);
		expect(runnerMock).not.toHaveBeenCalled();
	});

	it("returns other before-stage failures straight away", async () => {
		beforeRequestMock.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 410 }) });

		const response = await makeEndpointHandler({ endpoint: "responses", schema: null })(post());

		expect(response.status).toBe(410);
		expect(beforeRequestMock).toHaveBeenCalledTimes(1);
	});
});
