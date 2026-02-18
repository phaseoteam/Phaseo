import { describe, expect, it, vi } from "vitest";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "./error-response";

describe("buildPipelineExecutionErrorResponse", () => {
	it("returns a sanitized 500 payload by default", async () => {
		const response = buildPipelineExecutionErrorResponse(new Error("boom"));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload).toEqual({
			error: "pipeline_execution_error",
			description: "Internal pipeline execution error.",
		});
	});

	it("includes request_id when context is available", async () => {
		const response = buildPipelineExecutionErrorResponse(
			new Error("boom"),
			{ requestId: "req_123", meta: {} } as any,
		);
		const payload = await response.json();

		expect(payload.request_id).toBe("req_123");
		expect(payload.message).toBeUndefined();
	});

	it("includes raw message only when debug mode is enabled", async () => {
		const response = buildPipelineExecutionErrorResponse(
			new Error("provider timed out"),
			{
				requestId: "req_debug",
				meta: { debug: { enabled: true } },
			} as any,
		);
		const payload = await response.json();

		expect(payload.request_id).toBe("req_debug");
		expect(payload.message).toBe("provider timed out");
	});
});

describe("logPipelineExecutionError", () => {
	it("logs scoped pipeline failures", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const err = new Error("failure");
			logPipelineExecutionError("adapter", err);
			expect(spy).toHaveBeenCalledWith("adapter pipeline error:", err);
		} finally {
			spy.mockRestore();
		}
	});
});
