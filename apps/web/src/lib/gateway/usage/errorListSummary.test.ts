import { formatErrorListSummary } from "./errorListSummary";

describe("formatErrorListSummary", () => {
	test("prefers structured provider failure diagnostics", () => {
		expect(
			formatErrorListSummary({
				provider: "spacex-ai",
				error_code: "upstream_error",
				error_message: JSON.stringify({
					error: "upstream_error",
					provider_failure_diagnostics: {
						category: "provider_access_missing",
						provider: "spacex-ai",
						hint: "Enable the model for this project.",
					},
				}),
			}),
		).toBe("provider_access_missing · spacex-ai");
	});

	test("falls back to structured reason when provider failure diagnostics are absent", () => {
		expect(
			formatErrorListSummary({
				provider: "openai",
				error_code: "upstream_error",
				error_message: JSON.stringify({
					error: "upstream_error",
					reason: "all_candidates_failed",
				}),
			}),
		).toBe("all_candidates_failed");
	});

	test("prefers structured error_payload over plain error_message text", () => {
		expect(
			formatErrorListSummary({
				provider: "openai",
				error_code: "upstream_error",
				error_message: "plain text error",
				error_payload: {
					error: "upstream_error",
					provider_failure_diagnostics: {
						category: "provider_access_missing",
						provider: "openai",
					},
				},
			}),
		).toBe("provider_access_missing · openai");
	});

	test("falls back to provider attempt diagnostics when error_message is plain text", () => {
		expect(
			formatErrorListSummary({
				provider: "google-ai-studio",
				error_code: "upstream_error",
				error_message: "plain text error",
				provider_attempts: [
					{
						provider: "google-ai-studio",
						outcome: "error",
						status: 403,
						upstream_error_code: "PERMISSION_DENIED",
						upstream_error_message: "The caller does not have permission.",
					},
				],
			}),
		).toBe("PERMISSION_DENIED · google-ai-studio");
	});

	test("falls back to error_code and provider when no structured data is available", () => {
		expect(
			formatErrorListSummary({
				provider: "anthropic",
				error_code: "rate_limit_exceeded",
				error_message: "plain text error",
			}),
		).toBe("rate_limit_exceeded · anthropic");
	});
});
