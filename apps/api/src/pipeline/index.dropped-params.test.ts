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
import { recordDroppedParams } from "./execute/unsupportedParams";

function post() {
	return new Request("https://api.phaseo.app/v1/chat/completions", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ model: "openai/gpt-5.4", top_k: 40, messages: [{ role: "user", content: "hi" }] }),
	});
}

function ctx() {
	return {
		meta: {},
		model: "openai/gpt-5.4",
		requestId: "req_1",
		endpoint: "chat.completions",
		requestedParams: ["top_k"],
		rawBody: { model: "openai/gpt-5.4", top_k: 40 },
		routingDiagnostics: {},
	};
}

describe("X-Phaseo-Dropped-Params", () => {
	beforeEach(() => {
		beforeRequestMock.mockReset();
		runnerMock.mockReset();
	});

	it("names the client parameters the serving provider did not get", async () => {
		const context = ctx();
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: context });
		runnerMock.mockImplementationOnce(async () => {
			// The execute stage records the drops for the provider it called.
			recordDroppedParams(context, "openai", [{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" }]);
			return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
		});

		const response = await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(post());

		expect(response.status).toBe(200);
		expect(response.headers.get("x-phaseo-dropped-params")).toBe("top_k");
		expect(response.headers.get("content-type")).toBe("application/json");
	});

	it("adds nothing when no parameter was dropped or the request failed", async () => {
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: ctx() });
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
		expect((await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(post())).headers.has("x-phaseo-dropped-params")).toBe(false);

		const failed = ctx();
		recordDroppedParams(failed, "openai", [{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" }]);
		beforeRequestMock.mockResolvedValueOnce({ ok: true, ctx: failed });
		runnerMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
		expect((await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(post())).headers.has("x-phaseo-dropped-params")).toBe(false);
	});
});
