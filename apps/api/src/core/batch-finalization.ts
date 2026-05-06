// Purpose: Finalize async batch jobs once they reach terminal states.
// Why: Batch routes currently persist status changes but never settle wallet billing.
// How: Reads output JSONL, prices successful responses, applies one idempotent charge, and marks billed.

import { getBindings } from "@/runtime/env";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { pickFirstFiniteNumber, resolveCanonicalTokenUsage } from "@core/usage-normalization";
import {
	getBatchJobRecord,
	isBatchJobBilled,
	markBatchJobBilled,
	setBatchJobStatus,
	type BatchJobMeta,
} from "@core/batch-jobs";
import { computeBill } from "@pipeline/pricing/engine";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { resolveProviderKey } from "@providers/keys";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";
const BATCH_CAPTURE_REQUEST_ID_PREFIX = "batch_capture";

type BatchUsageAggregate = {
	requests: number;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	input_text_tokens: number;
	output_text_tokens: number;
	cached_read_text_tokens: number;
	cached_write_text_tokens: number;
};

type BatchSettlementComputation =
	| {
			ok: true;
			costNanos: number;
			costUsd: number;
			charged: boolean;
			reason: string;
			pricedUsage: Record<string, unknown>;
			pricingBreakdown: Record<string, unknown>;
	  }
	| {
			ok: false;
			reason: string;
	  };

export type FinalizeBatchJobArgs = {
	workspaceId: string;
	batchId: string;
	status?: string | null;
};

export type FinalizeBatchJobResult = {
	status: string;
	charged: boolean;
	billed: boolean;
	reason: string;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function normalizeBatchEndpointPath(endpoint: unknown): string | null {
	const text = normalizeText(endpoint);
	if (!text) return null;
	try {
		const url = new URL(text, "https://gateway.local");
		const path = url.pathname.replace(/\/+$/, "") || "/";
		return path.replace(/^\/v1(?=\/|$)/i, "") || "/";
	} catch {
		return text.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "").replace(/^\/v1(?=\/|$)/i, "") || "/";
	}
}

function resolvePricingCapabilityCandidates(endpoint: unknown): string[] {
	const normalizedPath = normalizeBatchEndpointPath(endpoint);
	const candidates: string[] = [];
	if (normalizedPath) {
		candidates.push(resolveCapabilityFromEndpoint(normalizedPath));
	}
	candidates.push("batch");
	return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))];
}

async function fetchOpenAiFileText(fileIdRaw: string): Promise<string> {
	const fileId = normalizeText(fileIdRaw);
	if (!fileId) throw new Error("missing_output_file_id");
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: OPENAI_PROVIDER_ID, byokMeta: [] },
		() => bindings.OPENAI_API_KEY,
	);
	const response = await fetch(
		`${resolveOpenAiBaseUrl(bindings)}/files/${encodeURIComponent(fileId)}/content`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
			},
		},
	);
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new Error(`openai_batch_output_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
	}
	return response.text();
}

function parseJsonLines(text: string): any[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function createUsageAggregate(): BatchUsageAggregate {
	return {
		requests: 0,
		input_tokens: 0,
		output_tokens: 0,
		total_tokens: 0,
		input_text_tokens: 0,
		output_text_tokens: 0,
		cached_read_text_tokens: 0,
		cached_write_text_tokens: 0,
	};
}

function addUsageSample(target: BatchUsageAggregate, usageRaw: any): void {
	const canonical = resolveCanonicalTokenUsage(usageRaw);
	target.requests += 1;
	target.input_tokens += canonical.inputTokens;
	target.output_tokens += canonical.outputTokens;
	target.total_tokens += canonical.totalTokens;
	target.input_text_tokens += pickFirstFiniteNumber(usageRaw, ["input_text_tokens", "input_tokens", "prompt_tokens"]) ?? canonical.inputTokens;
	target.output_text_tokens += pickFirstFiniteNumber(usageRaw, ["output_text_tokens", "output_tokens", "completion_tokens"]) ?? canonical.outputTokens;
	target.cached_read_text_tokens += pickFirstFiniteNumber(usageRaw, [
		"cached_read_text_tokens",
		"cache_read_input_tokens",
		"input_tokens_details.cached_tokens",
		"input_details.cached_tokens",
		"prompt_tokens_details.cached_tokens",
	]) ?? 0;
	target.cached_write_text_tokens += pickFirstFiniteNumber(usageRaw, [
		"cached_write_text_tokens",
		"cache_creation_input_tokens",
		"output_tokens_details.cached_tokens",
		"completion_tokens_details.cached_tokens",
	]) ?? 0;
}

function buildAggregatePricedUsage(args: {
	usage: BatchUsageAggregate;
	costNanos: number;
}): Record<string, unknown> {
	const costNanos = Math.max(0, Math.round(args.costNanos));
	return {
		requests: args.usage.requests,
		input_tokens: args.usage.input_tokens,
		output_tokens: args.usage.output_tokens,
		total_tokens: args.usage.total_tokens,
		input_text_tokens: args.usage.input_text_tokens,
		output_text_tokens: args.usage.output_text_tokens,
		cached_read_text_tokens: args.usage.cached_read_text_tokens,
		cached_write_text_tokens: args.usage.cached_write_text_tokens,
		pricing: {
			total_nanos: costNanos,
			total_usd_str: (costNanos / 1e9).toFixed(9),
			total_cents: Math.trunc(costNanos / 10_000_000),
			currency: "USD",
			lines: [],
		},
	};
}

function isTerminalBatchStatus(status: string): boolean {
	return status === "completed" || status === "failed" || status === "expired" || status === "cancelled" || status === "canceled";
}

function isPartialSuccess(meta: BatchJobMeta | null | undefined): boolean {
	const counts = meta?.requestCounts;
	return Boolean(
		typeof counts?.completed === "number" &&
		counts.completed > 0 &&
		typeof counts?.failed === "number" &&
		counts.failed > 0,
	);
}

async function resolveBatchPriceCard(args: {
	providerId: string;
	model: string;
	endpoint: unknown;
}): Promise<{ capability: string; card: Awaited<ReturnType<typeof loadPriceCard>> } | null> {
	for (const capability of resolvePricingCapabilityCandidates(args.endpoint)) {
		const card = await loadPriceCard(args.providerId, args.model, capability);
		if (card) return { capability, card };
	}
	return null;
}

function extractResponseBody(entry: any): any | null {
	if (!entry || typeof entry !== "object") return null;
	const statusCode = Number((entry as any)?.response?.status_code ?? (entry as any)?.status_code ?? 0);
	if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) return null;
	const body = (entry as any)?.response?.body;
	return body && typeof body === "object" ? body : null;
}

async function computeBatchSettlement(meta: BatchJobMeta, status: string): Promise<BatchSettlementComputation> {
	const completedCount = meta.requestCounts?.completed ?? null;
	const outputFileId = normalizeText(meta.outputFileId);
	if (!outputFileId) {
		if (status === "completed") return { ok: false, reason: "missing_output_file" };
		if ((completedCount ?? 0) > 0) return { ok: false, reason: "missing_output_file" };
		return {
			ok: true,
			costNanos: 0,
			costUsd: 0,
			charged: false,
			reason: status === "completed" ? "zero_cost" : status,
			pricedUsage: buildAggregatePricedUsage({ usage: createUsageAggregate(), costNanos: 0 }),
			pricingBreakdown: {
				total_nanos: 0,
				total_usd_str: "0.000000000",
				total_cents: 0,
			},
		};
	}

	const text = await fetchOpenAiFileText(outputFileId);
	const entries = parseJsonLines(text);
	const usageAggregate = createUsageAggregate();
	let totalNanos = 0;
	let successfulResponses = 0;
	let pricedResponses = 0;
	let missingUsageResponses = 0;

	for (const entry of entries) {
		const body = extractResponseBody(entry);
		if (!body) continue;
		successfulResponses += 1;
		const usage = body.usage;
		if (!usage || typeof usage !== "object") {
			missingUsageResponses += 1;
			continue;
		}
		const model = normalizeText(body.model) ?? normalizeText(meta.model);
		if (!model) return { ok: false, reason: "missing_model" };
		const priceCard = await resolveBatchPriceCard({
			providerId: OPENAI_PROVIDER_ID,
			model,
			endpoint: meta.endpoint,
		});
		if (!priceCard?.card) return { ok: false, reason: "price_card_missing" };
		const priced = computeBill(
			usage as Record<string, unknown>,
			priceCard.card,
			{
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: normalizeBatchEndpointPath(meta.endpoint),
				batch_capability: priceCard.capability,
			},
			"batch",
		);
		totalNanos += Math.max(0, Number((priced as any)?.pricing?.total_nanos ?? 0) || 0);
		addUsageSample(usageAggregate, usage);
		pricedResponses += 1;
	}

	if (successfulResponses > 0 && pricedResponses !== successfulResponses) {
		return {
			ok: false,
			reason: missingUsageResponses > 0 ? "missing_usage" : "unpriced_successful_responses",
		};
	}

	if ((completedCount ?? 0) > 0 && successfulResponses === 0) {
		return { ok: false, reason: "missing_successful_output_rows" };
	}
	if (status === "completed" && successfulResponses === 0) {
		return { ok: false, reason: "missing_successful_output_rows" };
	}

	const costNanos = Math.max(0, Math.round(totalNanos));
	const partialSuccess = isPartialSuccess(meta);
	const reason =
		costNanos > 0
			? partialSuccess
				? "charged_partial_success"
				: "charged"
			: status === "completed"
				? partialSuccess
					? "partial_success_zero_cost"
					: "zero_cost"
				: partialSuccess
					? `partial_success_${status}`
					: status;
	return {
		ok: true,
		costNanos,
		costUsd: costNanos / 1e9,
		charged: costNanos > 0,
		reason,
		pricedUsage: buildAggregatePricedUsage({ usage: usageAggregate, costNanos }),
		pricingBreakdown: {
			total_nanos: costNanos,
			total_usd_str: (costNanos / 1e9).toFixed(9),
			total_cents: Math.trunc(costNanos / 10_000_000),
			completed_requests: successfulResponses,
			failed_requests: meta.requestCounts?.failed ?? null,
			total_requests: meta.requestCounts?.total ?? null,
		},
	};
}

export async function finalizeBatchJob(args: FinalizeBatchJobArgs): Promise<FinalizeBatchJobResult> {
	const record = await getBatchJobRecord(args.workspaceId, args.batchId);
	const status = String(args.status ?? record?.status ?? "").trim().toLowerCase();
	if (!record?.meta || !isTerminalBatchStatus(status)) {
		return {
			status,
			charged: false,
			billed: false,
			reason: "non_terminal_status",
		};
	}

	const finalizedAt = new Date().toISOString();
	const alreadyBilled = await isBatchJobBilled(args.workspaceId, args.batchId);
	if (alreadyBilled) {
		await setBatchJobStatus(args.workspaceId, args.batchId, status, {
			finalizedAt,
			billingReason: "already_billed",
		});
		return {
			status,
			charged: false,
			billed: true,
			reason: "already_billed",
		};
	}

	const settlement = await computeBatchSettlement(record.meta, status);
	if (!settlement.ok) {
		await setBatchJobStatus(args.workspaceId, args.batchId, status, {
			finalizedAt,
			charged: false,
			billingReason: settlement.reason,
		});
		return {
			status,
			charged: false,
			billed: false,
			reason: settlement.reason,
		};
	}

	if (settlement.costNanos > 0) {
		await recordUsageAndCharge({
			requestId: `${BATCH_CAPTURE_REQUEST_ID_PREFIX}:${args.batchId}`,
			workspaceId: args.workspaceId,
			cost_nanos: settlement.costNanos,
		});
	}

	await setBatchJobStatus(args.workspaceId, args.batchId, status, {
		finalizedAt,
		charged: settlement.charged,
		costNanos: settlement.costNanos,
		costUsd: settlement.costUsd,
		billingReason: settlement.reason,
		pricedUsage: settlement.pricedUsage,
		pricingBreakdown: settlement.pricingBreakdown,
	});
	await markBatchJobBilled(args.workspaceId, args.batchId);
	return {
		status,
		charged: settlement.charged,
		billed: true,
		reason: settlement.reason,
	};
}
