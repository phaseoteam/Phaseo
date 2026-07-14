// Purpose: Finalize async batch jobs once they reach terminal states.
// Why: Batch routes currently persist status changes but never settle wallet billing.
// How: Reads output JSONL, prices successful responses, applies one idempotent charge, and marks billed.

import { getBindings } from "@/runtime/env";
import { emitGatewayOperationalFailure } from "@/observability/axiom";
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
import { captureWalletReservation, releaseWalletReservation } from "@core/wallet-reservations";
import { BATCH_RESERVATION_PREFIX } from "@core/batch-reservations";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeVideoPricedUsage } from "@core/video-pricing";
import { buildVideoPricingRequestOptions, resolveVideoSeconds } from "@core/video-request-options";

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
	embedding_tokens: number;
	output_image: number;
	output_video_seconds: number;
	cached_read_text_tokens: number;
	cached_write_text_tokens: number;
	cached_write_text_tokens_5m: number;
	cached_write_text_tokens_1h: number;
};

type BatchPricingLineAggregate = {
	dimension: string;
	quantity: number;
	billable_units: number;
	unit_size: unknown;
	unit_price_usd: unknown;
	line_nanos: number;
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

type BatchChargeSettlement = {
	status: string;
	charged: boolean;
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

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function extractPricedTotalNanos(pricedUsage: Record<string, unknown>): number {
	const pricing =
		pricedUsage.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	return Math.max(0, Math.round(toFiniteNumber(pricing?.total_nanos ?? pricedUsage.total_nanos) ?? 0));
}

function hasExplicitEmptyPricingLines(pricedUsage: Record<string, unknown>): boolean {
	const pricing =
		pricedUsage.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	return Array.isArray(pricing?.lines) && pricing.lines.length === 0;
}

function hasPositivePricingRule(card: Awaited<ReturnType<typeof loadPriceCard>>): boolean {
	const rules = Array.isArray((card as any)?.rules) ? (card as any).rules : [];
	return rules.some((rule: any) => (toFiniteNumber(rule?.price_per_unit) ?? 0) > 0);
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
		if (normalizedPath === "/videos" || normalizedPath === "/video/generations") {
			candidates.push("video.generate", "video.generation");
		}
		if (normalizedPath === "/images/generations") {
			candidates.push("image.generate", "image.generations", "images.generations", "images.generate");
		}
		if (normalizedPath === "/images/edits") {
			candidates.push("image.edit", "images.edits");
		}
		if (normalizedPath === "/moderations") {
			candidates.push("text.moderate", "moderations.create", "moderation");
		}
	}
	if (
		!normalizedPath ||
		normalizedPath === "/responses" ||
		normalizedPath === "/chat/completions" ||
		normalizedPath === "/messages" ||
		normalizedPath === "/completions"
	) {
		candidates.push("batch");
	}
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
		embedding_tokens: 0,
		output_image: 0,
		output_video_seconds: 0,
		cached_read_text_tokens: 0,
		cached_write_text_tokens: 0,
		cached_write_text_tokens_5m: 0,
		cached_write_text_tokens_1h: 0,
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
	target.embedding_tokens += pickFirstFiniteNumber(usageRaw, ["embedding_tokens"]) ?? 0;
	target.output_image += pickFirstFiniteNumber(usageRaw, ["output_image", "output_images", "images"]) ?? 0;
	target.output_video_seconds += pickFirstFiniteNumber(usageRaw, [
		"output_video_seconds",
		"video_seconds",
		"duration_seconds",
		"seconds",
	]) ?? 0;
	target.cached_read_text_tokens += pickFirstFiniteNumber(usageRaw, [
		"cached_read_text_tokens",
		"cache_read_input_tokens",
		"cached_tokens",
		"prompt_cache_hit_tokens",
		"input_tokens_details.cached_tokens",
		"input_details.cached_tokens",
		"prompt_tokens_details.cached_tokens",
	]) ?? 0;
	const cachedWriteTokens = pickFirstFiniteNumber(usageRaw, [
		"cached_write_text_tokens",
		"cache_creation_input_tokens",
		"input_tokens_details.cache_creation_input_tokens",
		"prompt_tokens_details.cache_creation_input_tokens",
		"input_tokens_details.cache_creation_tokens",
		"prompt_tokens_details.cache_creation_tokens",
		"output_tokens_details.cached_tokens",
		"completion_tokens_details.cached_tokens",
	]);
	const cachedWriteTokens5m = pickFirstFiniteNumber(usageRaw, [
		"cached_write_text_tokens_5m",
		"_ext.cachedWriteTokens5m",
		"cache_creation.ephemeral_5m_input_tokens",
		"cache_creation_5m_input_tokens",
		"cache_creation_ephemeral_5m_input_tokens",
	]);
	const cachedWriteTokens1h = pickFirstFiniteNumber(usageRaw, [
		"cached_write_text_tokens_1h",
		"_ext.cachedWriteTokens1h",
		"cache_creation.ephemeral_1h_input_tokens",
		"cache_creation_1h_input_tokens",
		"cache_creation_ephemeral_1h_input_tokens",
	]);
	target.cached_write_text_tokens += cachedWriteTokens ?? (cachedWriteTokens5m ?? 0) + (cachedWriteTokens1h ?? 0);
	target.cached_write_text_tokens_5m += cachedWriteTokens5m ?? 0;
	target.cached_write_text_tokens_1h += cachedWriteTokens1h ?? 0;
}

function buildAggregatePricedUsage(args: {
	usage: BatchUsageAggregate;
	costNanos: number;
	pricingLines?: Record<string, unknown>[];
}): Record<string, unknown> {
	const costNanos = Math.max(0, Math.round(args.costNanos));
	return {
		requests: args.usage.requests,
		input_tokens: args.usage.input_tokens,
		output_tokens: args.usage.output_tokens,
		total_tokens: args.usage.total_tokens,
		input_text_tokens: args.usage.input_text_tokens,
		output_text_tokens: args.usage.output_text_tokens,
		embedding_tokens: args.usage.embedding_tokens,
		output_image: args.usage.output_image,
		output_video_seconds: args.usage.output_video_seconds,
		cached_read_text_tokens: args.usage.cached_read_text_tokens,
		cached_write_text_tokens: args.usage.cached_write_text_tokens,
		cached_write_text_tokens_5m: args.usage.cached_write_text_tokens_5m,
		cached_write_text_tokens_1h: args.usage.cached_write_text_tokens_1h,
		pricing: {
			total_nanos: costNanos,
			total_usd_str: (costNanos / 1e9).toFixed(9),
			total_cents: Math.trunc(costNanos / 10_000_000),
			currency: "USD",
			lines: args.pricingLines ?? [],
		},
	};
}

function addPricedLines(
	target: Map<string, BatchPricingLineAggregate>,
	priced: Record<string, unknown>,
): void {
	const pricing = priced.pricing && typeof priced.pricing === "object" && !Array.isArray(priced.pricing)
		? priced.pricing as Record<string, unknown>
		: null;
	const lines = Array.isArray(pricing?.lines) ? pricing.lines : [];
	for (const lineRaw of lines) {
		if (!lineRaw || typeof lineRaw !== "object" || Array.isArray(lineRaw)) continue;
		const line = lineRaw as Record<string, unknown>;
		const dimension = normalizeText(line.dimension);
		if (!dimension) continue;
		const key = [
			dimension,
			String(line.unit_size ?? ""),
			String(line.unit_price_usd ?? ""),
		].join("|");
		const current = target.get(key) ?? {
			dimension,
			quantity: 0,
			billable_units: 0,
			unit_size: line.unit_size ?? null,
			unit_price_usd: line.unit_price_usd ?? null,
			line_nanos: 0,
		};
		const quantity = Number(line.quantity ?? 0);
		if (Number.isFinite(quantity)) current.quantity += quantity;
		const billableUnits = Number(line.billable_units ?? 0);
		if (Number.isFinite(billableUnits)) current.billable_units += billableUnits;
		const lineNanos = Number(line.line_nanos ?? 0);
		if (Number.isFinite(lineNanos)) current.line_nanos += lineNanos;
		target.set(key, current);
	}
}

function serializePricingLineAggregates(
	lines: Map<string, BatchPricingLineAggregate>,
): Record<string, unknown>[] {
	return [...lines.values()].map((line) => ({
		dimension: line.dimension,
		quantity: line.quantity,
		billable_units: line.billable_units,
		unit_size: line.unit_size,
		unit_price_usd: line.unit_price_usd,
		line_cost_usd: (line.line_nanos / 1e9).toFixed(9),
		line_nanos: Math.round(line.line_nanos),
		pricing_plan: "batch",
		service_tier: "batch",
	}));
}

function isTerminalBatchStatus(status: string): boolean {
	return status === "completed" || status === "failed" || status === "expired" || status === "cancelled" || status === "canceled";
}

function normalizeBatchStatus(status: unknown): string {
	const normalized = String(status ?? "").trim().toLowerCase();
	return normalized === "canceled" ? "cancelled" : normalized;
}

function isVoidedBatchStatus(status: string): boolean {
	return status === "failed" || status === "expired" || status === "cancelled" || status === "canceled";
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
}): Promise<{ capability: string; pricingPlan: "batch" | "free"; card: Awaited<ReturnType<typeof loadPriceCard>> } | null> {
	for (const capability of resolvePricingCapabilityCandidates(args.endpoint)) {
		const card = await loadPriceCard(args.providerId, args.model, capability);
		if (
			card &&
			Array.isArray((card as any)?.rules) &&
			(card as any).rules.some((rule: any) => {
				const plan = String(rule?.pricing_plan ?? "").trim().toLowerCase();
				return plan === "batch" || plan === "free";
			})
		) {
			const hasBatch = (card as any).rules.some((rule: any) =>
				String(rule?.pricing_plan ?? "").trim().toLowerCase() === "batch"
			);
			return { capability, pricingPlan: hasBatch ? "batch" : "free", card };
		}
		if (card && isImageBatchEndpoint(args.endpoint)) {
			const derived = deriveOpenAiImageBatchPriceCard(card);
			if (derived && Array.isArray((derived as any).rules)) {
				return { capability, pricingPlan: "batch", card: derived };
			}
		}
	}
	return null;
}

function deriveOpenAiImageBatchPriceCard(card: Awaited<ReturnType<typeof loadPriceCard>>): Awaited<ReturnType<typeof loadPriceCard>> {
	if (!card || !Array.isArray((card as any).rules)) return card;
	return {
		...(card as any),
		rules: (card as any).rules.map((rule: any) => {
			const plan = String(rule?.pricing_plan ?? "standard").trim().toLowerCase();
			if (plan !== "standard") return rule;
			const price = Number(rule?.price_per_unit ?? 0);
			return {
				...rule,
				id: rule?.id ? `${rule.id}:batch` : undefined,
				pricing_plan: "batch",
				price_per_unit: Number.isFinite(price) ? String(price / 2) : rule?.price_per_unit,
				note: rule?.note ?? "Derived from OpenAI Batch API 50% discount",
			};
		}),
	};
}

function extractResponseBody(entry: any): any | null {
	if (!entry || typeof entry !== "object") return null;
	const statusCode = Number((entry as any)?.response?.status_code ?? (entry as any)?.status_code ?? 0);
	if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) return null;
	const body = (entry as any)?.response?.body;
	return body && typeof body === "object" ? body : null;
}

function extractCustomId(entry: any): string | null {
	return normalizeText(entry?.custom_id ?? entry?.id ?? entry?.request?.custom_id);
}

function extractRequestBody(entry: any): Record<string, unknown> | null {
	const body = entry?.body ?? entry?.request?.body;
	return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

function extractRequestEndpoint(entry: any, fallback: unknown): unknown {
	return entry?.url ?? entry?.request?.url ?? fallback;
}

function isVideoBatchEndpoint(endpoint: unknown): boolean {
	return resolvePricingCapabilityCandidates(endpoint).some((capability) =>
		capability === "video.generate" || capability === "video.generation" || capability === "video.generations"
	);
}

function isImageBatchEndpoint(endpoint: unknown): boolean {
	return resolvePricingCapabilityCandidates(endpoint).some((capability) =>
		capability === "image.generate" ||
		capability === "image.generations" ||
		capability === "images.generations" ||
		capability === "images.generate" ||
		capability === "image.edit" ||
		capability === "images.edits"
	);
}

function isModerationBatchEndpoint(endpoint: unknown): boolean {
	return resolvePricingCapabilityCandidates(endpoint).some((capability) =>
		capability === "text.moderate" || capability === "moderations.create" || capability === "moderation"
	);
}

function responseImageCount(body: any, requestBody?: Record<string, unknown> | null): number {
	const fromData = Array.isArray(body?.data) ? body.data.length : 0;
	if (fromData > 0) return fromData;
	const requested = Number(requestBody?.n ?? body?.n);
	return Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : 1;
}

function responseVideoSeconds(body: any, requestBody?: Record<string, unknown> | null): number | undefined {
	return (
		resolveVideoSeconds(body ?? {}) ??
		resolveVideoSeconds((body as any)?.metadata ?? {}) ??
		resolveVideoSeconds((body as any)?.video_metadata ?? {}) ??
		resolveVideoSeconds((body as any)?.response?.videoMetadata ?? {}) ??
		resolveVideoSeconds(requestBody as any ?? {})
	);
}

function responseVideoSize(body: any, requestBody?: Record<string, unknown> | null): string | undefined {
	const sources = [
		body,
		(body as any)?.metadata,
		(body as any)?.video_metadata,
		(body as any)?.response?.videoMetadata,
		requestBody,
	];
	for (const source of sources) {
		if (!source || typeof source !== "object") continue;
		const value =
			(source as any).size ??
			(source as any).resolution ??
			(source as any).input_resolution ??
			(source as any).video_params?.size ??
			(source as any).video_params?.resolution ??
			(source as any).video_params?.input_resolution;
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function resolveReservationId(batchId: string, meta: BatchJobMeta | null | undefined): string {
	const explicit = normalizeText(meta?.reservationId);
	return explicit ?? `${BATCH_RESERVATION_PREFIX}${batchId}`;
}

function hasReservation(meta: BatchJobMeta | null | undefined): boolean {
	return Boolean(normalizeText(meta?.reservationId) || (typeof meta?.reservedNanos === "number" && meta.reservedNanos > 0));
}

async function releaseBatchReservation(args: {
	workspaceId: string;
	batchId: string;
	meta: BatchJobMeta | null | undefined;
}): Promise<string> {
	if (!hasReservation(args.meta)) return "not_found";
	const released = await releaseWalletReservation({
		workspaceId: args.workspaceId,
		reservationId: resolveReservationId(args.batchId, args.meta),
		releaseRefId: args.batchId,
	});
	return released.status;
}

async function settleBatchCharge(args: {
	workspaceId: string;
	batchId: string;
	meta: BatchJobMeta | null | undefined;
	costNanos: number;
}): Promise<BatchChargeSettlement> {
	const costNanos = Math.max(0, Math.round(args.costNanos));
	if (costNanos <= 0) {
		const releaseStatus = await releaseBatchReservation(args);
		return {
			status: releaseStatus === "not_found" ? "zero_cost" : `released_${releaseStatus}`,
			charged: false,
		};
	}
	if (!hasReservation(args.meta)) {
		await recordUsageAndCharge({
			requestId: `${BATCH_CAPTURE_REQUEST_ID_PREFIX}:${args.batchId}`,
			workspaceId: args.workspaceId,
			cost_nanos: costNanos,
		});
		return { status: "charged_without_reservation", charged: true };
	}

	const reservationId = resolveReservationId(args.batchId, args.meta);
	const reservedNanos = Math.max(0, Number(args.meta?.reservedNanos ?? 0) || 0);
	if (reservedNanos === costNanos) {
		const captured = await captureWalletReservation({
			workspaceId: args.workspaceId,
			reservationId,
			captureRefId: args.batchId,
		});
		if (captured.status === "captured" && (captured.applied || captured.alreadyApplied)) {
			return { status: "captured", charged: true };
		}
		if (captured.status !== "not_found" && captured.status !== "unknown") {
			return { status: captured.status, charged: false };
		}
	}

	const released = await releaseWalletReservation({
		workspaceId: args.workspaceId,
		reservationId,
		releaseRefId: args.batchId,
	});
	if (released.status !== "released" && released.status !== "not_found" && released.status !== "captured") {
		return { status: released.status, charged: false };
	}
	await recordUsageAndCharge({
		requestId: `${BATCH_CAPTURE_REQUEST_ID_PREFIX}:${args.batchId}`,
		workspaceId: args.workspaceId,
		cost_nanos: costNanos,
	});
	return {
		status: released.status === "not_found" ? "charged_reservation_not_found" : "released_and_charged_actual",
		charged: true,
	};
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
	const inputEntriesByCustomId = new Map<string, any>();
	if ((isVideoBatchEndpoint(meta.endpoint) || isImageBatchEndpoint(meta.endpoint)) && normalizeText(meta.inputFileId)) {
		const inputText = await fetchOpenAiFileText(String(meta.inputFileId));
		for (const inputEntry of parseJsonLines(inputText)) {
			const customId = extractCustomId(inputEntry);
			if (customId) inputEntriesByCustomId.set(customId, inputEntry);
		}
	}
	const usageAggregate = createUsageAggregate();
	let totalNanos = 0;
	let successfulResponses = 0;
	let pricedResponses = 0;
	let missingUsageResponses = 0;
	const pricingLines = new Map<string, BatchPricingLineAggregate>();

	for (const entry of entries) {
		const body = extractResponseBody(entry);
		if (!body) continue;
		successfulResponses += 1;
		const requestEntry = inputEntriesByCustomId.get(extractCustomId(entry) ?? "");
		const requestBody = extractRequestBody(requestEntry);
		const endpoint = extractRequestEndpoint(requestEntry, meta.endpoint);
		const usage = body.usage;
		const videoEndpoint = isVideoBatchEndpoint(endpoint);
		const imageEndpoint = isImageBatchEndpoint(endpoint);
		const moderationEndpoint = isModerationBatchEndpoint(endpoint);
		if ((!usage || typeof usage !== "object") && !videoEndpoint && !imageEndpoint && !moderationEndpoint) {
			missingUsageResponses += 1;
			continue;
		}
		const model = normalizeText(body.model) ?? normalizeText(requestBody?.model) ?? normalizeText(meta.model);
		if (!model) return { ok: false, reason: "missing_model" };
		const priceCard = await resolveBatchPriceCard({
			providerId: OPENAI_PROVIDER_ID,
			model,
			endpoint,
		});
		if (!priceCard?.card) return { ok: false, reason: "price_card_missing" };
		let priced: Record<string, unknown>;
		let usageSample: Record<string, unknown>;
		if (videoEndpoint) {
			const seconds =
				pickFirstFiniteNumber(usage, ["output_video_seconds", "video_seconds", "duration_seconds", "seconds"]) ??
				responseVideoSeconds(body, requestBody);
			if (!seconds || seconds <= 0) {
				missingUsageResponses += 1;
				continue;
			}
			const size = responseVideoSize(body, requestBody);
			const requestOptions = {
				...(requestBody ?? {}),
				...body,
				...buildVideoPricingRequestOptions({
					...(requestBody ?? {}),
					...body,
					size,
					resolution: size,
					seconds,
				} as any),
				pricing_plan: "batch",
				service_tier: "batch",
			};
			priced = computeVideoPricedUsage({
				seconds,
				card: priceCard.card as any,
				model,
				requestOptions,
			}) as Record<string, unknown>;
			usageSample = {
				...(usage && typeof usage === "object" ? usage : {}),
				output_video_seconds: seconds,
				seconds,
			};
		} else {
			const billableUsage = moderationEndpoint && (!usage || typeof usage !== "object")
				? { requests: 1 }
				: imageEndpoint
					? {
						...(usage && typeof usage === "object" ? usage as Record<string, unknown> : {}),
						requests: pickFirstFiniteNumber(usage, ["requests"]) ?? 1,
						output_image: pickFirstFiniteNumber(usage, ["output_image", "output_images", "images"]) ?? responseImageCount(body, requestBody),
					}
					: usage as Record<string, unknown>;
			priced = computeBill(
				billableUsage,
				priceCard.card,
				{
					pricing_plan: priceCard.pricingPlan,
					service_tier: "batch",
					batch_endpoint: normalizeBatchEndpointPath(endpoint),
					batch_capability: priceCard.capability,
					...(imageEndpoint ? buildImagePricingRequestOptions(requestBody ?? body, {
						...body,
						...billableUsage,
					}) : {}),
				},
				priceCard.pricingPlan,
			) as Record<string, unknown>;
			usageSample = billableUsage;
		}
		const rowNanos = extractPricedTotalNanos(priced);
		if (rowNanos <= 0 && hasExplicitEmptyPricingLines(priced) && hasPositivePricingRule(priceCard.card)) {
			return { ok: false, reason: "price_card_missing" };
		}
		totalNanos += rowNanos;
		addPricedLines(pricingLines, priced);
		addUsageSample(usageAggregate, usageSample);
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
		pricedUsage: buildAggregatePricedUsage({
			usage: usageAggregate,
			costNanos,
			pricingLines: serializePricingLineAggregates(pricingLines),
		}),
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
	const currentStatus = normalizeBatchStatus(record?.status);
	let status = normalizeBatchStatus(args.status ?? record?.status);
	if (!record?.meta || !isTerminalBatchStatus(status)) {
		return {
			status,
			charged: false,
			billed: false,
			reason: "non_terminal_status",
		};
	}
	if (isTerminalBatchStatus(currentStatus) && currentStatus !== status) {
		console.warn("batch_finalize_stale_terminal_status_ignored", {
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			currentStatus,
			incomingStatus: status,
		});
		return {
			status: currentStatus,
			charged: false,
			billed: await isBatchJobBilled(args.workspaceId, args.batchId),
			reason: "stale_terminal_status",
		};
	}
	status = status === "canceled" ? "cancelled" : status;

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

	if (isVoidedBatchStatus(status) && !isPartialSuccess(record.meta)) {
		let releaseReason = status;
		try {
			const releaseStatus = await releaseBatchReservation({
				workspaceId: args.workspaceId,
				batchId: args.batchId,
				meta: record.meta,
			});
			releaseReason = releaseStatus === "not_found" ? status : `released_${releaseStatus}`;
		} catch (error) {
			console.error("batch_reservation_release_failed", {
				error,
				workspaceId: args.workspaceId,
				batchId: args.batchId,
				status,
			});
			await setBatchJobStatus(args.workspaceId, args.batchId, status, {
				finalizedAt,
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: "release_failed",
				reservationStatus: "release_failed",
			});
			return {
				status,
				charged: false,
				billed: false,
				reason: "release_failed",
			};
		}
		await setBatchJobStatus(args.workspaceId, args.batchId, status, {
			finalizedAt,
			charged: false,
			costNanos: 0,
			costUsd: 0,
			billingReason: releaseReason,
			reservationStatus: releaseReason,
		});
		await markBatchJobBilled(args.workspaceId, args.batchId);
		return {
			status,
			charged: false,
			billed: true,
			reason: releaseReason,
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

	let settlementReason = settlement.reason;
	let reservationStatus: string | null = null;
	let chargeApplied = settlement.costNanos <= 0;
	try {
		const chargeSettlement = await settleBatchCharge({
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			meta: record.meta,
			costNanos: settlement.costNanos,
		});
		reservationStatus = chargeSettlement.status;
		chargeApplied = settlement.costNanos <= 0 || chargeSettlement.charged;
		if (hasReservation(record.meta) && reservationStatus && reservationStatus !== "not_found") {
			settlementReason = `${settlement.reason}:${reservationStatus}`;
		}
	} catch (error) {
		await setBatchJobStatus(args.workspaceId, args.batchId, status, {
			finalizedAt,
			charged: false,
			billingReason: "settlement_failed",
		});
		console.error("batch_job_settlement_failed", {
			error,
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			status,
		});
		await emitGatewayOperationalFailure({
			workflow: "batch_finalization",
			workspaceId: args.workspaceId,
			resourceId: args.batchId,
			reason: "batch_job_settlement_failed",
			error,
		});
		return {
			status,
			charged: false,
			billed: false,
			reason: "settlement_failed",
		};
	}

	await setBatchJobStatus(args.workspaceId, args.batchId, status, {
		finalizedAt,
		charged: settlement.charged && chargeApplied,
		costNanos: settlement.costNanos,
		costUsd: settlement.costUsd,
		billingReason: settlementReason,
		...(reservationStatus ? { reservationStatus } : {}),
		pricedUsage: settlement.pricedUsage,
		pricingBreakdown: settlement.pricingBreakdown,
	});
	if (chargeApplied) {
		await markBatchJobBilled(args.workspaceId, args.batchId);
	}
	return {
		status,
		charged: settlement.charged && chargeApplied,
		billed: chargeApplied,
		reason: settlementReason,
	};
}
