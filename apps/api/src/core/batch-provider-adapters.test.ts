import { describe, expect, it } from "vitest";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../tests/helpers/runtime";

import {
	buildProviderCancelPath,
	buildProviderBatchApiUrl,
	buildProviderFileMetadataPath,
	FILE_BACKED_JSONL_BATCH_PROVIDERS,
	extractGoogleInlineResponses,
	extractGoogleResponseFileName,
	extractMistralInlineOutputs,
	fetchProviderFileContent,
	normalizeProviderBatchPayload,
	normalizeProviderBatchStatus,
	parseProviderBatchInputEntries,
	parseProviderBatchListPage,
} from "./batch-provider-adapters";

describe("batch provider status normalization", () => {
	it("uses Alibaba Cloud's OpenAI-compatible Files and Batch lifecycle", () => {
		setupRuntimeFromEnv({
			DASHSCOPE_API_KEY: "test-dashscope-key",
			ALIBABA_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com",
		} as any);
		expect(FILE_BACKED_JSONL_BATCH_PROVIDERS.has("alibaba-cloud")).toBe(true);
		expect(buildProviderBatchApiUrl("alibaba-cloud", "/files")).toBe(
			"https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/files",
		);
		expect(buildProviderCancelPath("alibaba-cloud", "batch_123")).toBe("/batches/batch_123/cancel");
		teardownTestRuntime();
	});
	it("uses OVHcloud's OpenAI-compatible Files and Batch lifecycle", () => {
		setupRuntimeFromEnv({ OVH_AI_ENDPOINTS_ACCESS_TOKEN: "test-ovh-key" } as any);
		expect(FILE_BACKED_JSONL_BATCH_PROVIDERS.has("ovhcloud")).toBe(true);
		expect(buildProviderBatchApiUrl("ovhcloud", "/files")).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/files");
		expect(buildProviderBatchApiUrl("ovhcloud", "/batches")).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/batches");
		expect(buildProviderCancelPath("ovhcloud", "batch_123")).toBe("/batches/batch_123/cancel");
		expect(normalizeProviderBatchStatus("ovhcloud", "canceled")).toBe("cancelled");
		teardownTestRuntime();
	});
	it("uses Parasail's distinct Batch host and file-backed lifecycle", () => {
		setupRuntimeFromEnv({ PARASAIL_API_KEY: "test-parasail-key" } as any);
		expect(buildProviderBatchApiUrl("parasail", "/batches")).toBe("https://api.saas.parasail.io/v1/batches");
		expect(buildProviderBatchApiUrl("parasail", "/files/file_123/content")).toBe("https://api.saas.parasail.io/v1/files/file_123/content");
		expect(FILE_BACKED_JSONL_BATCH_PROVIDERS.has("parasail")).toBe(true);
		expect(buildProviderCancelPath("parasail", "batch_123")).toBe("/batches/batch_123/cancel");
		teardownTestRuntime();
	});
	it("returns the full error object when the provider key is missing", async () => {
		setupRuntimeFromEnv({} as any);
		const response = await fetchProviderFileContent("google-ai-studio", "files/abc");
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			error: {
				code: "upstream_error",
				message: "No gateway key is configured for this batch provider.",
				type: "server_error",
				param: null,
				reason: "google_ai_studio_key_missing",
				metadata: { reason: "google_ai_studio_key_missing" },
			},
			code: "upstream_error",
		});
		teardownTestRuntime();
	});
	it("extracts Mistral inline result rows without confusing missing outputs", () => {
		expect(extractMistralInlineOutputs({ outputs: [{ custom_id: "row-1", response: { body: {} } }] }))
			.toEqual([{ custom_id: "row-1", response: { body: {} } }]);
		expect(extractMistralInlineOutputs({ output_file: "file-result" })).toBeNull();
	});
	it("uses provider-specific cancellation paths", () => {
		expect(buildProviderCancelPath("x-ai", "batch_123")).toBe("/batches/batch_123:cancel");
		expect(buildProviderCancelPath("openai", "batch_123")).toBe("/batches/batch_123/cancel");
	});
	it("normalizes OpenAI-compatible batch statuses for OpenAI, Groq, and Together", () => {
		const statuses = [
			"validating",
			"failed",
			"in_progress",
			"finalizing",
			"completed",
			"expired",
			"cancelling",
			"cancelled",
		];
		for (const provider of ["openai", "groq", "together", "moonshotai"]) {
			for (const status of statuses) {
				expect(normalizeProviderBatchStatus(provider, status.toUpperCase())).toBe(status);
			}
			expect(normalizeProviderBatchStatus(provider, "canceled")).toBe("cancelled");
			expect(normalizeProviderBatchStatus(provider, "queued")).toBe("queued");
		}
	});

	it("unwraps Together's create envelope while preserving warnings", () => {
		expect(normalizeProviderBatchPayload("together", {
			job: { id: "batch_together", status: "VALIDATING", input_file_id: "file_input" },
			warning: "accepted with warning",
		})).toMatchObject({
			id: "batch_together",
			native_batch_id: "batch_together",
			status: "validating",
			input_file_id: "file_input",
			warning: "accepted with warning",
		});
	});

	it("normalizes Anthropic processing_status values and ended outcomes from request counts", () => {
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "in_progress",
			request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
		}).status).toBe("in_progress");
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "canceling",
			request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
		}).status).toBe("cancelling");
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "ended",
			request_counts: { processing: 0, succeeded: 2, errored: 1, canceled: 0, expired: 0 },
		}).status).toBe("completed");
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "ended",
			request_counts: { processing: 0, succeeded: 0, errored: 2, canceled: 0, expired: 0 },
		}).status).toBe("failed");
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "ended",
			request_counts: { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 2 },
		}).status).toBe("expired");
		expect(normalizeProviderBatchPayload("anthropic", {
			id: "msgbatch_1",
			processing_status: "ended",
			request_counts: { processing: 0, succeeded: 0, errored: 0, canceled: 2, expired: 0 },
		}).status).toBe("cancelled");
	});

	it("normalizes Gemini batch job states", () => {
		const cases: Array<[string, string]> = [
			["JOB_STATE_PENDING", "pending"],
			["JOB_STATE_RUNNING", "in_progress"],
			["JOB_STATE_SUCCEEDED", "completed"],
			["JOB_STATE_FAILED", "failed"],
			["JOB_STATE_CANCELLED", "cancelled"],
			["JOB_STATE_EXPIRED", "expired"],
			["BATCH_STATE_PENDING", "pending"],
			["BATCH_STATE_RUNNING", "in_progress"],
			["BATCH_STATE_SUCCEEDED", "completed"],
			["BATCH_STATE_FAILED", "failed"],
			["BATCH_STATE_CANCELLED", "cancelled"],
			["BATCH_STATE_EXPIRED", "expired"],
		];
		for (const [raw, normalized] of cases) {
			expect(normalizeProviderBatchPayload("google-ai-studio", {
				name: "batches/gemini_1",
				metadata: { state: raw },
			}).status).toBe(normalized);
		}
		expect(normalizeProviderBatchPayload("google-ai-studio", { name: "batches/gemini_1", done: false }).status)
			.toBe("in_progress");
		expect(normalizeProviderBatchPayload("google-ai-studio", { name: "batches/gemini_1", done: true, error: {} }).status)
			.toBe("failed");
		expect(normalizeProviderBatchPayload("google-ai-studio", { name: "batches/gemini_1", done: true }).status)
			.toBe("completed");
		expect(normalizeProviderBatchPayload("google-ai-studio", {
			name: "batches/gemini_1",
			metadata: {
				state: "BATCH_STATE_SUCCEEDED",
				batchStats: { requestCount: "1", successfulRequestCount: "0", failedRequestCount: "1" },
			},
		}).status).toBe("failed");
	});

	it("extracts Gemini inline responses from direct and nested result envelopes", () => {
		const entries = [{ response: { candidates: [] } }];
		expect(extractGoogleInlineResponses({ dest: { inlinedResponses: entries } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ dest: { inlinedEmbedContentResponses: entries } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ response: { inlinedResponses: entries } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ response: { inlinedResponses: { inlinedResponses: entries } } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ metadata: { output: { inlinedResponses: { inlinedResponses: entries } } } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ response: {} })).toBeNull();
	});

	it("extracts current and legacy Gemini result-file names", () => {
		expect(extractGoogleResponseFileName({ dest: { fileName: "files/result-new" } }))
			.toBe("files/result-new");
		expect(extractGoogleResponseFileName({ response: { responsesFile: "files/result-legacy" } }))
			.toBe("files/result-legacy");
		expect(buildProviderFileMetadataPath("google-ai-studio", "files/result-new"))
			.toBe("/files/result-new");
		expect(buildProviderFileMetadataPath("google-ai-studio", "result-new"))
			.toBe("/files/result-new");
	});

	it("preserves Gemini file output metadata for reconciliation", () => {
		expect(normalizeProviderBatchPayload("google-ai-studio", {
			name: "batches/gemini-file",
			state: "JOB_STATE_SUCCEEDED",
			dest: { fileName: "files/result-file" },
			batchStats: { requestCount: 1, successfulRequestCount: 1, failedRequestCount: 0 },
		})).toMatchObject({
			status: "completed",
			output_file_id: "files/result-file",
			request_counts: { total: 1, completed: 1, failed: 0 },
		});
	});

	it("normalizes Mistral batch job statuses", () => {
		const cases: Array<[string, string]> = [
			["QUEUED", "validating"],
			["RUNNING", "in_progress"],
			["SUCCESS", "completed"],
			["FAILED", "failed"],
			["TIMEOUT_EXCEEDED", "expired"],
			["CANCELLATION_REQUESTED", "cancelling"],
			["CANCELLED", "cancelled"],
		];
		for (const [raw, normalized] of cases) {
			expect(normalizeProviderBatchPayload("mistral", {
				id: "batch_mistral",
				status: raw,
			}).status).toBe(normalized);
		}
		const partialFailure = normalizeProviderBatchPayload("mistral", {
			id: "batch_mistral",
			status: "SUCCESS",
			total_requests: 5,
			completed_requests: 5,
			succeeded_requests: 3,
			failed_requests: 2,
		});
		expect(partialFailure.request_counts).toEqual({ total: 5, completed: 3, failed: 2 });
	});

	it("normalizes xAI batch state counters and explicit statuses", () => {
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_pending: 1, num_success: 1, num_error: 0 },
		}).status).toBe("in_progress");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_pending: 0, num_success: 2, num_error: 0 },
		}).status).toBe("completed");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_pending: 0, num_success: 0, num_error: 2 },
		}).status).toBe("failed");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_pending: 0, num_success: 0, num_error: 0, num_cancelled: 2 },
		}).status).toBe("cancelled");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_success: 1, num_error: 1 },
		}).status).toBe("completed");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			state: { num_requests: 2, num_success: 0, num_error: 0 },
		}).status).toBe("in_progress");
		expect(normalizeProviderBatchPayload("x-ai", {
			batch_id: "batch_xai",
			status: "canceled",
			state: { num_requests: 2, num_success: 0, num_error: 0 },
		}).status).toBe("cancelled");
	});

	it("parses Gemini and xAI recovery list schemas and cursors", () => {
		const xaiBatch = { batch_id: "batch_xai" };
		expect(parseProviderBatchListPage("x-ai", {
			batches: [xaiBatch],
			pagination_token: "xai-next",
		})).toEqual({ candidates: [xaiBatch], nextCursor: "xai-next" });

		const geminiOperation = { name: "batches/batch_gemini" };
		expect(parseProviderBatchListPage("google-ai-studio", {
			operations: [geminiOperation],
			nextPageToken: "gemini-next",
		})).toEqual({ candidates: [geminiOperation], nextCursor: "gemini-next" });
	});

	it("parses Kimi's OpenAI-compatible batch list cursor", () => {
		const batch = { id: "batch_kimi" };
		expect(parseProviderBatchListPage("moonshotai", {
			data: [batch],
			has_more: true,
		})).toEqual({ candidates: [batch], nextCursor: "batch_kimi" });
	});

	it("preserves OpenAI JSONL request invariants for pre-dispatch validation", () => {
		expect(parseProviderBatchInputEntries([
			JSON.stringify({ custom_id: "row-1", method: "POST", url: "/v1/moderations", body: { model: "omni-moderation-latest", input: "hello" } }),
			JSON.stringify({ custom_id: "row-2", method: "POST", url: "/v1/moderations", body: { model: "omni-moderation-latest", input: "world" } }),
		].join("\n"))).toEqual([
			{ customId: "row-1", method: "POST", endpoint: "/v1/moderations", body: { model: "omni-moderation-latest", input: "hello" } },
			{ customId: "row-2", method: "POST", endpoint: "/v1/moderations", body: { model: "omni-moderation-latest", input: "world" } },
		]);
	});

});
