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
	});
});
