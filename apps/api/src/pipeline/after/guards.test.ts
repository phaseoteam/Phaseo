import { describe, expect, it, vi } from "vitest";
import { guardUpstreamStatus } from "./guards";
import { handleFailureAudit } from "./audit";

vi.mock("./audit", () => ({
	handleFailureAudit: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(overrides?: Partial<any>): any {
	return {
		requestId: "G-AFTER-1",
		endpoint: "responses",
		meta: {},
		providerCapabilitiesBeta: false,
		...overrides,
	};
}

function makeResult(overrides?: Partial<any>): any {
	return {
		provider: "google-ai-studio",
		upstream: new Response(null, { status: 500 }),
		rawResponse: undefined,
		mappedRequest: undefined,
		...overrides,
	};
}

describe("guardUpstreamStatus", () => {
	it("preserves structured provider diagnostics for direct upstream failures", async () => {
		vi.mocked(handleFailureAudit).mockClear();
		const result = await guardUpstreamStatus(
			makeCtx(),
			makeResult({
				provider: "google-ai-studio",
				upstream: new Response(
					JSON.stringify({
						error: {
							code: 403,
							status: "PERMISSION_DENIED",
							message: "The caller does not have permission.",
						},
					}),
					{
						status: 403,
						headers: { "content-type": "application/json" },
					},
				),
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(403);
		expect(result.response.headers.get("X-Gateway-Error-Origin")).toBe("upstream");
		const payload = await result.response.json();
		expect(payload.error).toBe("PERMISSION_DENIED");
		expect(payload.error_type).toBe("system");
		expect(payload.error_origin).toBe("upstream");
		expect(payload.upstream_error).toEqual({
			code: "PERMISSION_DENIED",
			message: "The caller does not have permission.",
			description: "The caller does not have permission.",
			param: null,
		});
		expect(payload.failure_sample).toEqual([
			expect.objectContaining({
				provider: "google-ai-studio",
				status: 403,
				upstream_error_code: "PERMISSION_DENIED",
				upstream_error_message: "The caller does not have permission.",
			}),
		]);
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "provider_access_missing",
			hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
			provider: "google-ai-studio",
		});
		expect(vi.mocked(handleFailureAudit).mock.calls[0]?.[7]).toMatchObject({
			error: "PERMISSION_DENIED",
			description: "The caller does not have permission.",
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "google-ai-studio",
			},
			failure_sample: [
				expect.objectContaining({
					provider: "google-ai-studio",
					upstream_error_code: "PERMISSION_DENIED",
				}),
			],
		});
	});

	it("marks upstream unsupported-parameter rejections as system upstream errors", async () => {
		vi.mocked(handleFailureAudit).mockClear();
		const result = await guardUpstreamStatus(
			makeCtx(),
			makeResult({
				provider: "openai",
				upstream: new Response(
					JSON.stringify({
						error: {
							code: "invalid_request_error",
							message: 'Provider does not support parameter "instructions" on this endpoint.',
						},
					}),
					{
						status: 400,
						headers: { "content-type": "application/json" },
					},
				),
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.error).toBe("invalid_request_error");
		expect(payload.error_type).toBe("system");
		expect(payload.error_origin).toBe("upstream");
		expect(payload.upstream_error).toEqual({
			code: "invalid_request_error",
			message: 'Provider does not support parameter "instructions" on this endpoint.',
			description: 'Provider does not support parameter "instructions" on this endpoint.',
			param: "instructions",
		});
		expect(payload.failure_sample).toEqual([
			expect.objectContaining({
				provider: "openai",
				status: 400,
				upstream_error_code: "invalid_request_error",
				upstream_error_param: "instructions",
			}),
		]);
		expect(vi.mocked(handleFailureAudit).mock.calls[0]?.[7]).toMatchObject({
			error: "invalid_request_error",
			upstream_error: {
				code: "invalid_request_error",
				param: "instructions",
			},
			failure_sample: [
				expect.objectContaining({
					provider: "openai",
					upstream_error_param: "instructions",
				}),
			],
		});
	});
});
