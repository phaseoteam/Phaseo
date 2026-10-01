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
	it("returns 429 and the earliest reset when every provider is locally capacity limited", async () => {
		const ctx: any = {
			model: "openai/gpt-4.1-mini",
			endpoint: "responses",
			requestId: "req_capacity",
			attemptErrors: [
				{ provider: "openai", type: "provider_rate_limited", status: 429, upstream_rate_limit_headers: { "Retry-After": "40" } },
				{ provider: "azure", type: "provider_rate_limited", status: 429, upstream_rate_limit_headers: { "Retry-After": "12" } },
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(result.response.headers.get("Retry-After")).toBe("12");
		expect(await result.response.json()).toMatchObject({
			error: "provider_capacity_exhausted",
			reason: "all_candidates_rate_limited",
			failed_providers: ["openai", "azure"],
		});
	});

	it("does not expose provider identities for stealth capacity limits", async () => {
		const ctx: any = {
			model: "stealth/test-model-20260827",
			requestedModel: "stealth/test-model-20260827",
			endpoint: "responses",
			requestId: "req_stealth_capacity",
			attemptErrors: [{ provider: "secret-provider", type: "provider_rate_limited", status: 429 }],
		};
		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const payload = await result.response.json();
		expect(result.response.status).toBe(429);
		expect(JSON.stringify(payload)).not.toContain("secret-provider");
	});

	it("hides every provider failure detail for stealth models", async () => {
		const ctx: any = {
			model: "stealth/test-model-20260827",
			requestedModel: "stealth/test-model-20260827",
			endpoint: "responses",
			requestId: "req_stealth_failed",
			attemptErrors: [{
				provider: "openai",
				status: 402,
				upstream_error_code: "billing_secret",
				upstream_error_message: "OpenAI billing failed",
				upstream_payload_preview: "api.openai.com",
			}],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload).toEqual({
			error: "upstream_billing_required",
			status_code: 402,
			error_origin: "upstream",
			responsibility: "phaseo",
			retryable: false,
			description: "The upstream service rejected the request because its billing requirements were not met.",
			action: "Contact Phaseo support, or verify provider billing if you are using BYOK.",
			request_id: "req_stealth_failed",
			model: "stealth/test-model-20260827",
			endpoint: "responses",
			failed_statuses: [402],
		});
		expect(JSON.stringify(payload)).not.toMatch(/openai|billing_secret|failure_sample|provider_payment/i);
	});

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

	it("uses retry metadata from the final attempted provider without exposing it in the body", async () => {
		const ctx: any = {
			model: "minimax/minimax-m2.7:free",
			endpoint: "chat.completions",
			requestId: "req_rate_limited",
			attemptErrors: [
				{
					provider: "first",
					type: "upstream_non_2xx",
					status: 429,
					upstream_rate_limit_headers: { "Retry-After": "5" },
				},
				{
					provider: "gmicloud",
					type: "upstream_non_2xx",
					status: 429,
					upstream_rate_limit_headers: { "Retry-After": "20" },
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.headers.get("Retry-After")).toBe("20");
		const payload = await result.response.json();
		expect(JSON.stringify(payload)).not.toContain("upstream_rate_limit_headers");
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

	it("emits provider failure diagnostics for missing credential configuration", async () => {
		const ctx: any = {
			model: "google/gemini-3.1-pro-preview",
			endpoint: "responses",
			requestId: "req_missing_config",
			attemptErrors: [
				{
					provider: "google-vertex",
					type: "error",
					upstream_error_code: "google-vertex_project_missing",
					upstream_error_message: "google-vertex_project_missing",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "credentials_not_configured",
			hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
			provider: "google-vertex",
		});
	});

	it("emits provider failure diagnostics for region or project restrictions", async () => {
		const ctx: any = {
			model: "google/veo-3.1-preview",
			endpoint: "video.generate",
			requestId: "req_region_restricted",
			attemptErrors: [
				{
					provider: "google-vertex",
					type: "upstream_non_2xx",
					status: 403,
					upstream_error_message: "Model is not available in your region or project.",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "region_or_project_restriction",
			hint: "The provider appears to be restricted by region, location, or project configuration. Verify the provider region and project access for this model.",
			provider: "google-vertex",
		});
	});

	it("treats generic provider key-missing codes as credential configuration failures", async () => {
		const ctx: any = {
			model: "openai/gpt-4.1-mini",
			endpoint: "responses",
			requestId: "req_openai_key_missing",
			attemptErrors: [
				{
					provider: "openai",
					type: "error",
					upstream_error_code: "openai_key_missing",
					upstream_error_message: "openai_key_missing",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "credentials_not_configured",
			hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
			provider: "openai",
		});
	});

	it("treats provider base-url-missing codes as configuration failures", async () => {
		const ctx: any = {
			model: "x-ai/grok-4",
			endpoint: "responses",
			requestId: "req_xai_base_url_missing",
			attemptErrors: [
				{
					provider: "x-ai",
					type: "error",
					upstream_error_code: "x-ai_base_url_missing",
					upstream_error_message: "x-ai_base_url_missing",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "credentials_not_configured",
			hint: "Provider configuration is incomplete for this route. Verify the provider base URL and related gateway settings before retrying.",
			provider: "x-ai",
		});
	});

	it("treats explicit Bedrock access-denied codes as provider access failures", async () => {
		const ctx: any = {
			model: "anthropic.claude-3-5-sonnet-v1:0",
			endpoint: "chat.completions",
			requestId: "req_bedrock_access_denied",
			attemptErrors: [
				{
					provider: "amazon-bedrock",
					type: "upstream_non_2xx",
					status: 403,
					upstream_error_code: "AccessDeniedException",
					upstream_error_message: "You don't have access to invoke this model.",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "provider_access_missing",
			hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
			provider: "amazon-bedrock",
		});
	});

	it("treats explicit Bedrock signature failures as credential errors", async () => {
		const ctx: any = {
			model: "anthropic.claude-3-5-sonnet-v1:0",
			endpoint: "chat.completions",
			requestId: "req_bedrock_signature_invalid",
			attemptErrors: [
				{
					provider: "amazon-bedrock",
					type: "upstream_non_2xx",
					status: 403,
					upstream_error_code: "InvalidSignatureException",
					upstream_error_message: "The request signature we calculated does not match.",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "credentials_invalid_or_forbidden",
			hint: "The provider rejected the supplied credentials or permissions. Verify the gateway key or BYOK secret and retry.",
			provider: "amazon-bedrock",
		});
	});

	it("treats explicit Google-style permission-denied codes as provider access failures", async () => {
		const ctx: any = {
			model: "google/gemini-2.5-pro",
			endpoint: "responses",
			requestId: "req_google_permission_denied",
			attemptErrors: [
				{
					provider: "google-ai-studio",
					type: "upstream_non_2xx",
					status: 403,
					upstream_error_code: "PERMISSION_DENIED",
					upstream_error_message: "The caller does not have permission.",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "provider_access_missing",
			hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
			provider: "google-ai-studio",
		});
	});

	it("treats explicit Google-style resource exhaustion codes as rate limits", async () => {
		const ctx: any = {
			model: "google/gemini-2.5-pro",
			endpoint: "responses",
			requestId: "req_google_resource_exhausted",
			attemptErrors: [
				{
					provider: "google-ai-studio",
					type: "upstream_non_2xx",
					status: 429,
					upstream_error_code: "RESOURCE_EXHAUSTED",
					upstream_error_message: "Quota exceeded.",
				},
			],
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		const payload = await result.response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "rate_limited",
			hint: "The provider is rate limiting this request. Retry with backoff or another provider.",
			provider: "google-ai-studio",
		});
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

	it("returns a 403 when geographic availability removes every route", async () => {
		const ctx: any = {
			model: "openai/gpt-4.1-mini",
			endpoint: "responses",
			requestId: "req_region_blocked",
			meta: { edgeCountry: "CN" },
			attemptErrors: [],
			routingDiagnostics: {
				filterStages: [{
					stage: "geographic_availability_gate",
					beforeCount: 1,
					afterCount: 0,
					droppedProviders: [{ providerId: "openai", reason: "request_country_not_allowed" }],
				}],
			},
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.response.status).toBe(403);
		const payload = await result.response.json();
		expect(payload).toMatchObject({
			error: "model_region_unavailable",
			reason: "all_routes_unavailable_in_request_country",
			request_country: "CN",
		});
	});

	it("hides route diagnostics when a stealth model is region unavailable", async () => {
		const ctx: any = {
			model: "stealth/test-model-20260827",
			requestedModel: "stealth/test-model-20260827",
			endpoint: "responses",
			requestId: "req_stealth_region",
			meta: { edgeCountry: "CN" },
			attemptErrors: [],
			routingDiagnostics: {
				filterStages: [{
					stage: "geographic_availability_gate",
					beforeCount: 1,
					afterCount: 0,
					droppedProviders: [{
						providerId: "openai",
						apiModelId: "pam_openai_secret",
						providerModelSlug: "oai-stealth-test-model-internal",
					}],
				}],
			},
		};

		const result = await guardAllFailed(ctx, makeTiming());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(403);
		const payload = await result.response.json();
		expect(payload).toMatchObject({
			error: "model_region_unavailable",
			status_code: 403,
			error_origin: "gateway",
			responsibility: "user",
			request_country: "CN",
		});
		expect(JSON.stringify(payload)).not.toMatch(/openai|pam_openai_secret|oai-stealth|routing_diagnostics/i);
	});
});
