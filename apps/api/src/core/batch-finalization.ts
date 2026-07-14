// Purpose: Finalize async batch jobs once they reach terminal states.
// Why: Batch routes currently persist status changes but never settle wallet billing.
// How: Reads output JSONL, prices successful responses, applies one idempotent charge, and marks billed.

import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { pickFirstFiniteNumber, resolveCanonicalTokenUsage } from "@core/usage-normalization";
import {
	getBatchJobRecord,
	isBatchJobBilled,
	markBatchJobBilled,
	setBatchJobStatus,
	type BatchJobMeta,
} from "@core/batch-jobs";
import {
	resolveBatchPricingModelCandidates,
	resolveBatchPricingProviderCandidates,
} from "@core/batch-model-aliases";
import { saveBatchRequestRows, type BatchRequestRowInput } from "@core/batch-requests";
import { computeBill } from "@pipeline/pricing/engine";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { settleWalletReservation } from "@core/wallet-reservations";
import {
	batchText,
	fetchProviderBatchOutputEntries,
	OPENAI_BATCH_PROVIDER_ID,
} from "@core/batch-provider-adapters";

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
			outputEntries: any[];
			rowCostsByIndex: Array<number | null>;
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
	return batchText(value);
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
	candidates.push("text.generate");
	candidates.push("batch");
	return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))];
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
	lines?: Record<string, unknown>[];
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
			lines: args.lines ?? [],
		},
	};
}

function mergePricingLines(target: Map<string, Record<string, unknown>>, priced: Record<string, any>): void {
	const lines = Array.isArray(priced?.pricing?.lines) ? priced.pricing.lines : [];
	for (const line of lines) {
		if (!line || typeof line !== "object" || Array.isArray(line)) continue;
		const dimension = normalizeText(line.dimension);
		if (!dimension) continue;
		const unitSize = typeof line.unit_size === "number" ? line.unit_size : null;
		const unitPriceUsd =
			typeof line.unit_price_usd === "number" || typeof line.unit_price_usd === "string"
				? String(line.unit_price_usd)
				: null;
		const key = `${dimension}:${unitSize ?? ""}:${unitPriceUsd ?? ""}`;
		const existing = target.get(key);
		const quantity = typeof line.quantity === "number" ? line.quantity : 0;
		const lineNanos = typeof line.line_nanos === "number" ? line.line_nanos : 0;
		if (existing) {
			existing.quantity = (typeof existing.quantity === "number" ? existing.quantity : 0) + quantity;
			existing.line_nanos = (typeof existing.line_nanos === "number" ? existing.line_nanos : 0) + lineNanos;
			const totalNanos = typeof existing.line_nanos === "number" ? existing.line_nanos : 0;
			existing.line_cost_usd = totalNanos / 1_000_000_000;
			continue;
		}
		target.set(key, {
			...line,
			dimension,
			quantity,
			line_nanos: lineNanos,
			line_cost_usd: lineNanos / 1_000_000_000,
		});
	}
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
	const models = resolvePricingModelCandidates(args.providerId, args.model);
	for (const capability of resolvePricingCapabilityCandidates(args.endpoint)) {
		for (const pricingProvider of resolveBatchPricingProviderCandidates(args.providerId)) {
			for (const model of models) {
				const card = await loadPriceCard(pricingProvider, model, capability);
				if (card) return { capability, card };
			}
		}
	}
	return null;
}

function resolvePricingModelCandidates(providerId: string, model: string): string[] {
	return resolveBatchPricingModelCandidates(providerId, model);
}

function extractResponseBody(entry: any): any | null {
	if (!entry || typeof entry !== "object") return null;
	const statusCode = Number((entry as any)?.response?.status_code ?? (entry as any)?.status_code ?? 0);
	if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) return null;
	const body = (entry as any)?.response?.body;
	return body && typeof body === "object" ? body : null;
}

function extractCustomId(entry: any, fallbackIndex: number): string {
	return normalizeText(entry?.custom_id ?? entry?.customId) ?? `response-${fallbackIndex + 1}`;
}

function extractErrorBody(entry: any): Record<string, unknown> | null {
	const candidate = entry?.error ?? entry?.response?.body?.error ?? entry?.response?.error;
	return candidate && typeof candidate === "object" && !Array.isArray(candidate)
		? candidate as Record<string, unknown>
		: null;
}

async function computeBatchSettlement(meta: BatchJobMeta, status: string): Promise<BatchSettlementComputation> {
	const completedCount = meta.requestCounts?.completed ?? null;
	const outputFileId = normalizeText(meta.outputFileId);
	const providerId = normalizeText(meta.provider) ?? OPENAI_BATCH_PROVIDER_ID;
	const supportsNativeResults =
		providerId === "anthropic" ||
		providerId === "google-ai-studio" ||
		providerId === "x-ai";
	if (!outputFileId && (completedCount ?? 0) <= 0 && status !== "completed") {
		return {
			ok: true,
			costNanos: 0,
			costUsd: 0,
			charged: false,
			reason: status,
			pricedUsage: buildAggregatePricedUsage({ usage: createUsageAggregate(), costNanos: 0 }),
			pricingBreakdown: {
				total_nanos: 0,
				total_usd_str: "0.000000000",
				total_cents: 0,
			},
			outputEntries: [],
			rowCostsByIndex: [],
		};
	}
	if (!outputFileId && !supportsNativeResults) {
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
			outputEntries: [],
			rowCostsByIndex: [],
		};
	}

	const entries = await fetchProviderBatchOutputEntries(meta);
	const usageAggregate = createUsageAggregate();
	const pricingLines = new Map<string, Record<string, unknown>>();
	const rowCostsByIndex: Array<number | null> = [];
	let totalNanos = 0;
	let successfulResponses = 0;
	let pricedResponses = 0;
	let missingUsageResponses = 0;

	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		const body = extractResponseBody(entry);
		if (!body) {
			continue;
		}
		successfulResponses += 1;
		const usage = body.usage;
		if (!usage || typeof usage !== "object") {
			missingUsageResponses += 1;
			continue;
		}
		const model = normalizeText(body.model) ?? normalizeText(body.modelVersion) ?? normalizeText(body.model_version) ?? normalizeText(meta.model);
		if (!model) return { ok: false, reason: "missing_model" };
		const priceCard = await resolveBatchPriceCard({
			providerId,
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
		const rowNanos = Math.max(0, Number((priced as any)?.pricing?.total_nanos ?? 0) || 0);
		totalNanos += rowNanos;
		rowCostsByIndex[index] = rowNanos;
		mergePricingLines(pricingLines, priced);
		addUsageSample(usageAggregate, usage);
		pricedResponses += 1;
	}

	if (successfulResponses > 0 && pricedResponses !== successfulResponses) {
		return {
			ok: false,
			reason: missingUsageResponses > 0 ? "missing_usage" : "unpriced_successful_responses",
		};
	}
	if (completedCount != null && successfulResponses !== completedCount) {
		return { ok: false, reason: "successful_output_count_mismatch" };
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
		pricedUsage: buildAggregatePricedUsage({
			usage: usageAggregate,
			costNanos,
			lines: Array.from(pricingLines.values()),
		}),
		pricingBreakdown: {
			total_nanos: costNanos,
			total_usd_str: (costNanos / 1e9).toFixed(9),
			total_cents: Math.trunc(costNanos / 10_000_000),
			completed_requests: successfulResponses,
			failed_requests: meta.requestCounts?.failed ?? null,
			total_requests: meta.requestCounts?.total ?? null,
		},
		outputEntries: entries,
		rowCostsByIndex,
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
		const existingLines = Array.isArray((record.meta.pricedUsage as any)?.pricing?.lines)
			? (record.meta.pricedUsage as any).pricing.lines
			: [];
		const metaPatch: Record<string, unknown> = {
			finalizedAt,
		};
		if (existingLines.length === 0) {
			const settlement = await computeBatchSettlement(record.meta, status).catch(() => null);
			if (settlement?.ok) {
				metaPatch.charged = settlement.charged;
				metaPatch.costNanos = settlement.costNanos;
				metaPatch.costUsd = settlement.costUsd;
				metaPatch.billingReason = settlement.reason;
				metaPatch.pricedUsage = settlement.pricedUsage;
				metaPatch.pricingBreakdown = settlement.pricingBreakdown;
			}
		}
		await setBatchJobStatus(args.workspaceId, args.batchId, status, metaPatch);
		return {
			status,
			charged: Boolean(record.meta.charged),
			billed: true,
			reason: record.meta.billingReason ?? "already_billed",
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

	if (record.meta.reservationId) {
		const settled = await settleWalletReservation({
			workspaceId: args.workspaceId,
			reservationId: record.meta.reservationId,
			actualNanos: settlement.costNanos,
			settleRefId: args.batchId,
		});
		if (settled.status !== "captured" || (!settled.applied && !settled.alreadyApplied)) {
			await setBatchJobStatus(args.workspaceId, args.batchId, status, {
				finalizedAt,
				charged: false,
				billingReason: `reservation_${settled.status}`,
			});
			return { status, charged: false, billed: false, reason: `reservation_${settled.status}` };
		}
	} else if (settlement.costNanos > 0) {
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
	if (settlement.outputEntries.length > 0) {
		const completedAt = new Date().toISOString();
		const providerId = normalizeText(record.meta.provider) ?? OPENAI_BATCH_PROVIDER_ID;
		const rows = settlement.outputEntries.map((entry, index): BatchRequestRowInput => {
			const body = extractResponseBody(entry);
			const responseStatus = Number(entry?.response?.status_code ?? entry?.status_code ?? 0);
			const errorBody = extractErrorBody(entry);
			return {
				provider: providerId,
				nativeBatchId: record.meta?.nativeBatchId ?? args.batchId,
				customId: extractCustomId(entry, index),
				requestIndex: index,
				model: normalizeText(body?.model) ?? normalizeText(record.meta?.model),
				status: body ? "completed" : errorBody ? "failed" : status,
				responseStatus: Number.isFinite(responseStatus) && responseStatus > 0 ? responseStatus : null,
				responseBody: null,
				errorBody,
				usage: body?.usage && typeof body.usage === "object" ? body.usage as Record<string, unknown> : null,
				costNanos: settlement.rowCostsByIndex[index] ?? null,
				costUsd:
					typeof settlement.rowCostsByIndex[index] === "number"
						? (settlement.rowCostsByIndex[index] as number) / 1_000_000_000
						: null,
				meta: { finalized_from_output_file: true, response_body_omitted: true },
				completedAt,
			};
		});
		await saveBatchRequestRows({
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			rows,
		}).catch((error) => {
			console.error("batch_request_rows_finalize_failed", {
				error,
				workspaceId: args.workspaceId,
				batchId: args.batchId,
			});
		});
	}
	await markBatchJobBilled(args.workspaceId, args.batchId);
	return {
		status,
		charged: settlement.charged,
		billed: true,
		reason: settlement.reason,
	};
}
