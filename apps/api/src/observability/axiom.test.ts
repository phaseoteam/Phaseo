import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadModules() {
	vi.resetModules();
	const runtime = await import("@/runtime/env");
	const axiom = await import("./axiom");
	return {
		clearRuntime: runtime.clearRuntime,
		configureRuntime: runtime.configureRuntime,
		sendAxiomWideEvent: axiom.sendAxiomWideEvent,
	};
}

describe("sendAxiomWideEvent", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("disables wide event ingestion in local testing mode after an auth failure", async () => {
		const { configureRuntime, clearRuntime, sendAxiomWideEvent } = await loadModules();
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response('{"code":403,"message":"forbidden"}', { status: 403 })
			);
		vi.stubGlobal("fetch", fetchMock);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			GATEWAY_LOCAL_TESTING_MODE: "true",
		} as any);

		await sendAxiomWideEvent({ event_type: "gateway.request", request_id: "req_1" });
		await sendAxiomWideEvent({ event_type: "gateway.request", request_id: "req_2" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(
			"[observability] Axiom wide event ingestion disabled in local testing mode after auth failure.",
			{ status: 403 }
		);
		expect(errorSpy).not.toHaveBeenCalled();
		clearRuntime();
	});

	it("logs non-local ingest failures without disabling subsequent attempts", async () => {
		const { configureRuntime, clearRuntime, sendAxiomWideEvent } = await loadModules();
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('{"code":403,"message":"forbidden"}', { status: 403 })
			);
		vi.stubGlobal("fetch", fetchMock);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
		} as any);

		await sendAxiomWideEvent({ event_type: "gateway.request", request_id: "req_3" });
		await sendAxiomWideEvent({ event_type: "gateway.request", request_id: "req_4" });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(errorSpy).toHaveBeenCalledWith(
			"[observability] Axiom wide event ingest failed",
			{ status: 403, response: '{"code":403,"message":"forbidden"}' }
		);
		clearRuntime();
	});
});
