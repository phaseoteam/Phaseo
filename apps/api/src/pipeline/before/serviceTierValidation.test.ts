import { describe, expect, it } from "vitest";
import { validateSynchronousTextServiceTierRequest } from "./serviceTierValidation";

async function readJson(response: Response): Promise<any> {
	return response.json();
}

describe("validateSynchronousTextServiceTierRequest", () => {
	it("rejects batch service tier on synchronous text endpoints with a Batch API hint", async () => {
		const result = validateSynchronousTextServiceTierRequest({
			endpoint: "chat.completions",
			body: { service_tier: "batch" },
			requestId: "req_test",
			workspaceId: "workspace_test",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const body = await readJson(result.response);
		expect(body.details[0]).toMatchObject({
			message: 'service_tier "batch" is not supported for synchronous requests. Please use the Batch API instead.',
			path: ["service_tier"],
			keyword: "batch_service_tier_not_supported",
			params: {
				use_endpoint: "/v1/batches",
			},
		});
	});

	it("allows standard, priority, and flex on synchronous text endpoints", () => {
		for (const serviceTier of ["standard", "priority", "flex"]) {
			expect(
				validateSynchronousTextServiceTierRequest({
					endpoint: "responses",
					body: { service_tier: serviceTier },
					requestId: "req_test",
					workspaceId: "workspace_test",
				}).ok,
			).toBe(true);
		}
	});

	it("rejects non-standard service tier aliases", async () => {
		for (const serviceTier of ["default", "auto", "standard_only"]) {
			const result = validateSynchronousTextServiceTierRequest({
				endpoint: "messages",
				body: { service_tier: serviceTier },
				requestId: "req_test",
				workspaceId: "workspace_test",
			});

			expect(result.ok).toBe(false);
			if (result.ok) continue;
			const body = await readJson(result.response);
			expect(body.details[0]).toMatchObject({
				path: ["service_tier"],
				keyword: "unsupported_service_tier",
			});
		}
	});

	it("does not apply text service tier validation to non-text endpoints", () => {
		const result = validateSynchronousTextServiceTierRequest({
			endpoint: "audio.speech",
			body: { speed: 1.25 },
			requestId: "req_test",
			workspaceId: "workspace_test",
		});

		expect(result.ok).toBe(true);
	});
});
