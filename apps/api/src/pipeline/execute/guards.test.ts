import { describe, expect, it } from "vitest";
import { Timer } from "../telemetry/timer";
import { guardAllFailed } from "./guards";

function makeTiming() {
	return {
		timer: new Timer(),
		internal: {
			adapterMarked: false,
		},
	};
}

describe("guardAllFailed", () => {
	it("returns provider_payment_required when any upstream attempt failed with 402", async () => {
		const ctx: any = {
			model: "openai/gpt-4.1-mini",
			endpoint: "responses",
			requestId: "req_provider_402",
			attemptErrors: [
				{
					provider: "openai",
					type: "upstream_non_2xx",
					status: 402,
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(502);
		const payload = await result.response.json();
		expect(payload.error).toBe("provider_payment_required");
		expect(payload.reason).toBe("upstream_provider_payment_required");
		expect(String(payload.description)).toContain("forgot to pay our provider bills");
		expect(String(payload.description)).toContain("openai");
		expect(String(payload.description)).toContain("GitHub or Discord");
		expect(payload.provider_payment_required_provider).toBe("openai");
		expect(String(payload.provider_payment_required_support_notice)).toContain("GitHub or Discord");
		expect(payload.failed_statuses).toEqual([402]);
	});

	it("keeps upstream_error when failures do not include upstream 402", async () => {
		const ctx: any = {
			model: "openai/gpt-4.1-mini",
			endpoint: "responses",
			requestId: "req_provider_500",
			attemptErrors: [
				{
					provider: "openai",
					type: "upstream_non_2xx",
					status: 500,
					upstream_error_message: "provider overloaded",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(502);
		const payload = await result.response.json();
		expect(payload.error).toBe("upstream_error");
		expect(payload.reason).toBe("all_candidates_failed");
		expect(String(payload.description)).toContain('Provider "openai" failed with HTTP 500');
		expect(String(payload.description)).toContain("Upstream message: provider overloaded");
		expect(String(payload.description)).toContain("Hint: The provider returned a server error");
		expect(String(payload.description)).toContain("failure_sample");
	});

	it("summarizes multi-provider failures in the description", async () => {
		const ctx: any = {
			model: "xiaomi/mimo-v2-tts:free",
			endpoint: "audio.speech",
			requestId: "req_multi_provider",
			attemptErrors: [
				{
					provider: "xiaomi",
					type: "upstream_non_2xx",
					status: 404,
					upstream_error_code: "not_found",
					upstream_error_message: "model not available for endpoint",
				},
				{
					provider: "openai",
					type: "upstream_non_2xx",
					status: 429,
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(502);
		const payload = await result.response.json();
		expect(payload.error).toBe("upstream_error");
		expect(payload.reason).toBe("all_candidates_failed");
		expect(String(payload.description)).toContain("All 2 provider attempts failed");
		expect(String(payload.description)).toContain("Provider/status summary: xiaomi:404, openai:429");
		expect(String(payload.description)).toContain("Upstream code: not_found");
		expect(String(payload.description)).toContain("Hint: The provider may not expose this model on this endpoint yet.");
	});

	it("surfaces upstream param details when provider returns generic 400 message", async () => {
		const ctx: any = {
			model: "xiaomi/mimo-v2-tts:free",
			endpoint: "audio.speech",
			requestId: "req_param_detail",
			attemptErrors: [
				{
					provider: "xiaomi",
					type: "upstream_non_2xx",
					status: 400,
					upstream_error_code: "400",
					upstream_error_message: "Param Incorrect",
					upstream_error_description:
						"Unknown voice: mimo_Default. Available voices: [mimo_default, default_zh, default_en]",
					upstream_error_param:
						"Unknown voice: mimo_Default. Available voices: [mimo_default, default_zh, default_en]",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(String(payload.description)).toContain("Upstream message: Param Incorrect");
		expect(String(payload.description)).toContain("Unknown voice: mimo_Default");
		expect(payload.failure_sample?.[0]?.upstream_error_param).toContain("Unknown voice");
	});

	it("does not reference failure_sample when no attempt diagnostics were captured", async () => {
		const ctx: any = {
			model: "xiaomi/mimo-v2-tts:free",
			endpoint: "audio.speech",
			requestId: "req_no_attempts",
			attemptErrors: [],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(String(payload.description)).toContain("No per-attempt diagnostics were captured.");
		expect(String(payload.description)).not.toContain("failure_sample");
	});
});
