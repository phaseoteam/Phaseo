import { describe, expect, it, vi } from "vitest";

import { runGatewayTelemetryPipelines } from "./gateway-telemetry";

describe("runGatewayTelemetryPipelines", () => {
	it("delivers Supabase and Axiom independently", async () => {
		const writeSupabase = vi.fn(async () => undefined);
		const writeAxiom = vi.fn(async () => undefined);

		const deliveries = await runGatewayTelemetryPipelines({
			requestId: "req_1",
			workspaceId: "ws_1",
			writeSupabase,
			writeAxiom,
		});

		expect(writeSupabase).toHaveBeenCalledOnce();
		expect(writeAxiom).toHaveBeenCalledOnce();
		expect(deliveries).toEqual([
			{ sink: "supabase", delivered: true, error: null },
			{ sink: "axiom", delivered: true, error: null },
		]);
	});

	it("still delivers Axiom and reports when Supabase fails", async () => {
		const writeAxiom = vi.fn(async () => undefined);
		const onDeliveryFailure = vi.fn(async () => undefined);
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const deliveries = await runGatewayTelemetryPipelines({
			requestId: "req_2",
			workspaceId: "ws_2",
			writeSupabase: async () => {
				throw new Error("database unavailable");
			},
			writeAxiom,
			onDeliveryFailure,
		});

		expect(writeAxiom).toHaveBeenCalledOnce();
		expect(onDeliveryFailure).toHaveBeenCalledWith({
			sink: "supabase",
			requestId: "req_2",
			workspaceId: "ws_2",
			error: "database unavailable",
		});
		expect(deliveries[0]).toEqual({
			sink: "supabase",
			delivered: false,
			error: "database unavailable",
		});

		consoleError.mockRestore();
	});

	it("does not attempt Supabase persistence for testing-mode requests", async () => {
		const writeAxiom = vi.fn(async () => undefined);

		const deliveries = await runGatewayTelemetryPipelines({
			requestId: "req_perf",
			writeSupabase: null,
			writeAxiom,
		});

		expect(deliveries).toEqual([
			{ sink: "axiom", delivered: true, error: null },
		]);
	});

	it("records a non-throwing Axiom delivery failure", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const deliveries = await runGatewayTelemetryPipelines({
			requestId: "req_3",
			writeAxiom: async () => false,
		});

		expect(deliveries).toEqual([
			{
				sink: "axiom",
				delivered: false,
				error: "sink reported delivery failure",
			},
		]);

		consoleError.mockRestore();
	});
});
