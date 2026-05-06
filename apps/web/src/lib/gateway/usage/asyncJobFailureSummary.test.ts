import { formatAsyncJobFailureSummary } from "./asyncJobFailureSummary";

describe("formatAsyncJobFailureSummary", () => {
	test("prefers category and provider when present", () => {
		expect(
			formatAsyncJobFailureSummary({
				job_failure_category: "provider_access_missing",
				job_failure_provider: "x-ai",
				job_failure_hint: "Enable the model for this project.",
			}),
		).toBe("provider_access_missing · x-ai");
	});

	test("falls back to the hint when structured category/provider are absent", () => {
		expect(
			formatAsyncJobFailureSummary({
				job_failure_category: null,
				job_failure_provider: null,
				job_failure_hint: "Retry later or reduce concurrency.",
			}),
		).toBe("Retry later or reduce concurrency.");
	});

	test("returns null when no compact summary fields are present", () => {
		expect(
			formatAsyncJobFailureSummary({
				job_failure_category: null,
				job_failure_provider: null,
				job_failure_hint: null,
			}),
		).toBeNull();
	});
});
