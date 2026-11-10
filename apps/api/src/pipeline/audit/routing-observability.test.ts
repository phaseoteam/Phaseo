import { describe, expect, it } from "vitest";
import { buildRoutingObservability } from "./routing-observability";

describe("buildRoutingObservability attempts", () => {
    it("carries the request-detail fields that replace gateway_upstream_requests", () => {
        const { normalizedAttempts } = buildRoutingObservability({
            requestedModel: "openai/gpt-5-nano",
            endpoint: "chat.completions",
            provider: "openai",
            providerAttempts: [
                {
                    attempt_number: 1,
                    provider: "provider-a",
                    provider_model_slug: "gpt-5-nano",
                    outcome: "upstream_non_2xx",
                    type: "upstream_non_2xx",
                    status: 429,
                    status_text: " Too Many Requests ",
                    duration_ms: 35,
                    started_at_unix_ms: 1_762_682_400_000,
                    retryable: true,
                    upstream_error_code: "rate_limit_exceeded",
                    upstream_error_type: "rate_limit",
                    upstream_error_message: "Rate limit reached",
                    upstream_error_description: "requests per minute",
                    upstream_payload_preview: "{\"error\":\"raw body\"}",
                },
                {
                    attempt_number: 2,
                    provider: "openai",
                    api_model_id: "gpt-5-nano",
                    outcome: "success",
                    status: 200,
                    status_text: "",
                    duration_ms: 42,
                    fallback_attempted: true,
                    // Older attempt shape: the error sits in a nested object.
                    error: { code: "nested_code", type: "nested_type", message: "nested message", description: "nested description" },
                },
            ],
        });

        expect(normalizedAttempts[0]).toMatchObject({
            attempt_number: 1,
            provider: "provider-a",
            provider_api_model_id: "gpt-5-nano",
            status_code: 429,
            error_code: "upstream_non_2xx",
            status_text: "Too Many Requests",
            upstream_error_code: "rate_limit_exceeded",
            upstream_error_type: "rate_limit",
            upstream_error_message: "Rate limit reached",
            upstream_error_description: "requests per minute",
            started_at_unix_ms: 1_762_682_400_000,
            latency_ms: 35,
            fallback_attempted: false,
        });
        expect(normalizedAttempts[1]).toMatchObject({
            attempt_number: 2,
            status_text: null,
            upstream_error_code: "nested_code",
            upstream_error_type: "nested_type",
            upstream_error_message: "nested message",
            upstream_error_description: "nested description",
            started_at_unix_ms: null,
            fallback_attempted: true,
        });
        // The raw provider payload preview never reaches the v2 attempt row.
        expect(JSON.stringify(normalizedAttempts)).not.toContain("raw body");
    });
});
