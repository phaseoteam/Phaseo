import { describe, expect, it } from "vitest";

import {
	buildProviderCancelPath,
	extractGoogleInlineResponses,
	normalizeProviderBatchPayload,
	normalizeProviderBatchStatus,
	parseProviderBatchListPage,
} from "./batch-provider-adapters";

describe("batch provider status normalization", () => {
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
		for (const provider of ["openai", "groq", "together"]) {
			for (const status of statuses) {
				expect(normalizeProviderBatchStatus(provider, status.toUpperCase())).toBe(status);
			}
			expect(normalizeProviderBatchStatus(provider, "canceled")).toBe("cancelled");
			expect(normalizeProviderBatchStatus(provider, "queued")).toBe("queued");
		}
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
		expect(extractGoogleInlineResponses({ response: { inlinedResponses: entries } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ response: { inlinedResponses: { inlinedResponses: entries } } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ metadata: { output: { inlinedResponses: { inlinedResponses: entries } } } })).toEqual(entries);
		expect(extractGoogleInlineResponses({ response: {} })).toBeNull();
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
});
