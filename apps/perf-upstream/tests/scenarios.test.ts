import { describe, expect, it } from "vitest";
import worker, { resolveScenario } from "../src/index";

const env = {
	PERF_MAX_FIRST_FRAME_MS: "100",
	PERF_MAX_FRAME_INTERVAL_MS: "20",
	PERF_MAX_FRAMES: "10",
};

describe("synthetic upstream scenarios", () => {
	it("selects a named path preset", () => {
		const request = new Request("https://perf.example/scenarios/rate-limit/v1/chat/completions");
		expect(resolveScenario(request, env)).toMatchObject({ name: "rate-limit", status: 429 });
	});

	it("accepts bounded controls only through a perf test id", () => {
		const request = new Request("https://perf.example/scenarios/fast/v1/responses", {
			headers: { "x-test-id": "perf:first=999;interval=999;frames=999;status=503;truncate=1" },
		});
		expect(resolveScenario(request, env)).toEqual({
			name: "fast",
			status: 503,
			firstFrameMs: 100,
			frameIntervalMs: 20,
			frames: 10,
			truncate: true,
			failureRate: 0,
		});
	});

	it("ignores arbitrary test ids", () => {
		const request = new Request("https://perf.example/scenarios/fast/v1/chat/completions", {
			headers: { "x-test-id": "status=503" },
		});
		expect(resolveScenario(request, env).status).toBe(200);
	});

	it("fails closed when the upstream token is absent", async () => {
		const response = await worker.fetch(
			new Request("https://perf.example/scenarios/fast/v1/chat/completions", { method: "POST", body: "{}" }),
			env,
			{ waitUntil() {} } as unknown as ExecutionContext,
		);
		expect(response.status).toBe(401);
	});

	it("emits a complete authenticated chat stream", async () => {
		const pending: Promise<unknown>[] = [];
		const response = await worker.fetch(
			new Request("https://perf.example/scenarios/fast/v1/chat/completions", {
				method: "POST",
				headers: { Authorization: "Bearer test-secret" },
				body: JSON.stringify({ model: "phaseo-perf", stream: true }),
			}),
			{ ...env, PERF_UPSTREAM_TOKEN: "test-secret" },
			{ waitUntil(promise: Promise<unknown>) { pending.push(promise); } } as unknown as ExecutionContext,
		);
		const body = await response.text();
		await Promise.all(pending);
		expect(response.status).toBe(200);
		expect(body).toContain('"object":"chat.completion.chunk"');
		expect(body).toContain("data: [DONE]");
	});
});
