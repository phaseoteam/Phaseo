import { parseAsyncJobFailureDiagnostics } from "./asyncJobFailureDiagnostics";

describe("parseAsyncJobFailureDiagnostics", () => {
	test("parses direct async job failure diagnostics fields", () => {
		const parsed = parseAsyncJobFailureDiagnostics({
			upstreamError: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "Project is not allowed to access this model.",
				param: "model",
				status: 403,
			},
			providerFailureDiagnostics: {
				category: "provider_access_missing",
				provider: "spacex-ai",
				hint: "Enable the model for this project.",
			},
			failureSample: [
				{
					provider: "spacex-ai",
					type: "upstream_non_2xx",
					status: 403,
					retryable: false,
					upstream_error_code: "PERMISSION_DENIED",
					upstream_error_message: "The caller does not have permission.",
					upstream_error_description:
						"Project is not allowed to access this model.",
					upstream_error_param: "model",
				},
			],
			routingDiagnostics: {
				providerCountBefore: 3,
				providerCountAfter: 1,
			},
			providerEnablement: {
				capability: "video.generation",
				providersBefore: 3,
				providersAfter: 1,
			},
			providerCandidateDiagnostics: {
				totalProviders: 3,
				candidateCount: 1,
			},
		});

		expect(parsed).toEqual({
			job_upstream_error: {
				code: "PERMISSION_DENIED",
				type: null,
				message: "The caller does not have permission.",
				description: "Project is not allowed to access this model.",
				param: "model",
				status: 403,
			},
			job_provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "spacex-ai",
				hint: "Enable the model for this project.",
			},
			job_failure_sample: [
				{
					provider: "spacex-ai",
					type: "upstream_non_2xx",
					status: 403,
					retryable: false,
					upstream_error_code: "PERMISSION_DENIED",
					upstream_error_message: "The caller does not have permission.",
					upstream_error_description:
						"Project is not allowed to access this model.",
					upstream_error_param: "model",
				},
			],
			job_routing_diagnostics: {
				providerCountBefore: 3,
				providerCountAfter: 1,
			},
			job_provider_enablement: {
				capability: "video.generation",
				providersBefore: 3,
				providersAfter: 1,
			},
			job_provider_candidate_diagnostics: {
				totalProviders: 3,
				candidateCount: 1,
			},
		});
	});

	test("falls back to nested meta.error diagnostics when direct fields are absent", () => {
		const parsed = parseAsyncJobFailureDiagnostics({
			error: {
				upstream_error: {
					code: "rate_limit_exceeded",
					message: "Rate limit exceeded.",
					description: "Reduce request volume and retry later.",
					status: "429",
				},
				provider_failure_diagnostics: {
					category: "provider_rate_limited",
					provider: "openai",
					hint: "Retry later or reduce concurrency.",
				},
				failure_sample: [
					{
						provider: "openai",
						type: "upstream_non_2xx",
						status: 429,
						retryable: "true",
						upstream_error_code: "rate_limit_exceeded",
						upstream_error_message: "Rate limit exceeded.",
					},
				],
				routing_diagnostics: {
					filterStages: [
						{
							stage: "provider_status_gate",
							beforeCount: 2,
							afterCount: 1,
						},
					],
				},
				provider_enablement: {
					capability: "responses.create",
					providersBefore: 2,
					providersAfter: 1,
				},
				provider_candidate_diagnostics: {
					totalProviders: 2,
					candidateCount: 1,
				},
			},
		});

		expect(parsed.job_upstream_error).toEqual({
			code: "rate_limit_exceeded",
			type: null,
			message: "Rate limit exceeded.",
			description: "Reduce request volume and retry later.",
			param: null,
			status: 429,
		});
		expect(parsed.job_provider_failure_diagnostics).toEqual({
			category: "provider_rate_limited",
			provider: "openai",
			hint: "Retry later or reduce concurrency.",
		});
		expect(parsed.job_failure_sample).toEqual([
			{
				provider: "openai",
				type: "upstream_non_2xx",
				status: 429,
				retryable: true,
				upstream_error_code: "rate_limit_exceeded",
				upstream_error_message: "Rate limit exceeded.",
				upstream_error_description: null,
				upstream_error_param: null,
			},
		]);
		expect(parsed.job_routing_diagnostics).toEqual({
			filterStages: [
				{
					stage: "provider_status_gate",
					beforeCount: 2,
					afterCount: 1,
				},
			],
		});
		expect(parsed.job_provider_enablement).toEqual({
			capability: "responses.create",
			providersBefore: 2,
			providersAfter: 1,
		});
		expect(parsed.job_provider_candidate_diagnostics).toEqual({
			totalProviders: 2,
			candidateCount: 1,
		});
	});
});
