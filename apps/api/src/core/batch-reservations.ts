// Purpose: Estimate and reserve batch credits before upstream submission.
// Why: Batch jobs are async and can otherwise spend after the user balance changes.
// How: Reads the uploaded JSONL input, prices a conservative per-row estimate, and records a wallet reservation.

import { getBindings } from "@/runtime/env";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { computeBill } from "@pipeline/pricing/engine";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { resolveProviderKey } from "@providers/keys";
import { reserveWalletCredits } from "@core/wallet-reservations";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeVideoPricedUsage } from "@core/video-pricing";
import { buildVideoPricingRequestOptions, resolveVideoSeconds } from "@core/video-request-options";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_BATCH_OUTPUT_TOKEN_HOLD = 1024;
const MAX_BATCH_ROWS_TO_PRICE = 50_000;
const SUPPORTED_OPENAI_BATCH_ENDPOINTS = new Set([
	"/responses",
	"/chat/completions",
	"/embeddings",
	"/completions",
	"/moderations",
	"/images/generations",
	"/images/edits",
	"/videos",
]);

export const BATCH_RESERVATION_PREFIX = "batch_hold:";

export type BatchReservationResult = {
	reservationId: string;
	held: boolean;
	amountNanos: number;
	status: string;
	estimatedUsage?: Record<string, unknown>;
};

type BatchUsageEstimate = {
	requests: number;
	input_text_tokens: number;
	output_text_tokens: number;
	embedding_tokens: number;
	output_image: number;
	output_video_seconds: number;
	total_tokens: number;
};

type ParsedBatchInput = {
	entries: any[];
	totalRows: number;
	truncated: boolean;
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
		return url.pathname.replace(/\/+$/, "").replace(/^\/v1(?=\/|$)/i, "") || "/";
	} catch {
		return text.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "").replace(/^\/v1(?=\/|$)/i, "") || "/";
	}
}

function isSupportedOpenAiBatchEndpoint(endpoint: unknown): boolean {
	const normalized = normalizeBatchEndpointPath(endpoint);
	return normalized != null && SUPPORTED_OPENAI_BATCH_ENDPOINTS.has(normalized);
}

function resolvePricingCapabilityCandidates(endpoint: unknown): string[] {
	const normalized = normalizeBatchEndpointPath(endpoint);
	const candidates = normalized ? [resolveCapabilityFromEndpoint(normalized)] : [];
	if (normalized === "/videos" || normalized === "/video/generations") {
		candidates.push("video.generate", "video.generation");
	}
	if (normalized === "/images/generations") {
		candidates.push("image.generate", "image.generations", "images.generations", "images.generate");
	}
	if (normalized === "/images/edits") {
		candidates.push("image.edit", "images.edits");
	}
	if (normalized === "/moderations") {
		candidates.push("text.moderate", "moderations.create", "moderation");
	}
	if (
		!normalized ||
		normalized === "/responses" ||
		normalized === "/chat/completions" ||
		normalized === "/messages" ||
		normalized === "/completions"
	) {
		candidates.push("batch");
	}
	return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))];
}

async function fetchOpenAiFileText(fileIdRaw: string): Promise<string> {
	const fileId = normalizeText(fileIdRaw);
	if (!fileId) throw new Error("missing_input_file_id");
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: OPENAI_PROVIDER_ID, byokMeta: [] },
		() => bindings.OPENAI_API_KEY,
	);
	const response = await fetch(`${resolveOpenAiBaseUrl(bindings)}/files/${encodeURIComponent(fileId)}/content`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
		},
	});
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new Error(`openai_batch_input_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
	}
	return response.text();
}

function parseJsonLines(text: string): ParsedBatchInput {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	return {
		entries: lines.slice(0, MAX_BATCH_ROWS_TO_PRICE).map((line) => JSON.parse(line)),
		totalRows: lines.length,
		truncated: lines.length > MAX_BATCH_ROWS_TO_PRICE,
	};
}

function estimateTokensFromText(value: string): number {
	return Math.max(1, Math.ceil(value.length / 4));
}

function collectText(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(collectText).join("\n");
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.text === "string") return record.text;
		if (typeof record.content === "string") return record.content;
		return Object.values(record).map(collectText).join("\n");
	}
	return String(value);
}

function toPositiveInteger(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return Math.trunc(parsed);
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
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

function isEmbeddingBatchEndpoint(endpoint: unknown): boolean {
	return resolvePricingCapabilityCandidates(endpoint).includes("text.embed");
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

function estimateUsageForBody(body: Record<string, unknown>, endpoint: unknown): BatchUsageEstimate {
	const rawInput =
		body.input ??
		body.messages ??
		body.prompt ??
		body.instructions ??
		body.text ??
		body;
	const inputTextTokens = estimateTokensFromText(collectText(rawInput) || JSON.stringify(body));
	const explicitMaxOutput =
		toPositiveInteger(body.max_output_tokens) ??
		toPositiveInteger(body.max_completion_tokens) ??
		toPositiveInteger(body.max_tokens);
	const outputTextTokens = isEmbeddingBatchEndpoint(endpoint)
		? 0
		: explicitMaxOutput ?? DEFAULT_BATCH_OUTPUT_TOKEN_HOLD;
	const outputImageCount = isImageBatchEndpoint(endpoint) ? toPositiveInteger(body.n) ?? 1 : 0;
	const outputVideoSeconds = isVideoBatchEndpoint(endpoint) ? resolveVideoSeconds(body as any) ?? 0 : 0;
	return {
		requests: 1,
		input_text_tokens: inputTextTokens,
		output_text_tokens: isVideoBatchEndpoint(endpoint) || isImageBatchEndpoint(endpoint) ? 0 : outputTextTokens,
		embedding_tokens: isEmbeddingBatchEndpoint(endpoint) ? inputTextTokens : 0,
		output_image: outputImageCount,
		output_video_seconds: outputVideoSeconds,
		total_tokens: inputTextTokens + (isVideoBatchEndpoint(endpoint) || isImageBatchEndpoint(endpoint) ? 0 : outputTextTokens),
	};
}

function addUsage(target: BatchUsageEstimate, sample: BatchUsageEstimate): void {
	target.requests += sample.requests;
	target.input_text_tokens += sample.input_text_tokens;
	target.output_text_tokens += sample.output_text_tokens;
	target.embedding_tokens += sample.embedding_tokens;
	target.output_image += sample.output_image;
	target.output_video_seconds += sample.output_video_seconds;
	target.total_tokens += sample.total_tokens;
}

function scaleUsageEstimate(usage: BatchUsageEstimate, multiplier: number): BatchUsageEstimate {
	if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) return usage;
	return {
		requests: Math.round(usage.requests * multiplier),
		input_text_tokens: Math.round(usage.input_text_tokens * multiplier),
		output_text_tokens: Math.round(usage.output_text_tokens * multiplier),
		embedding_tokens: Math.round(usage.embedding_tokens * multiplier),
		output_image: Math.round(usage.output_image * multiplier),
		output_video_seconds: usage.output_video_seconds * multiplier,
		total_tokens: Math.round(usage.total_tokens * multiplier),
	};
}

function emptyUsage(): BatchUsageEstimate {
	return {
		requests: 0,
		input_text_tokens: 0,
		output_text_tokens: 0,
		embedding_tokens: 0,
		output_image: 0,
		output_video_seconds: 0,
		total_tokens: 0,
	};
}

function modelCandidates(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [];
	const withoutProvider = trimmed.replace(/^openai\//i, "");
	return [...new Set([trimmed, `openai/${withoutProvider}`])];
}

function hasBatchPricingPlan(card: Awaited<ReturnType<typeof loadPriceCard>>): boolean {
	return Array.isArray((card as any)?.rules) &&
		(card as any).rules.some((rule: any) => {
			const plan = String(rule?.pricing_plan ?? "").trim().toLowerCase();
			return plan === "batch" || plan === "free";
		});
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

async function resolveBatchPriceCard(args: {
	model: string;
	endpoint: unknown;
}): Promise<{ model: string; capability: string; pricingPlan: "batch" | "free"; card: Awaited<ReturnType<typeof loadPriceCard>> } | null> {
	for (const model of modelCandidates(args.model)) {
		for (const capability of resolvePricingCapabilityCandidates(args.endpoint)) {
			const card = await loadPriceCard(OPENAI_PROVIDER_ID, model, capability);
			if (card && hasBatchPricingPlan(card)) {
				const hasBatch = (card as any).rules.some((rule: any) =>
					String(rule?.pricing_plan ?? "").trim().toLowerCase() === "batch"
				);
				return { model, capability, pricingPlan: hasBatch ? "batch" : "free", card };
			}
			if (card && isImageBatchEndpoint(args.endpoint)) {
				const derived = deriveOpenAiImageBatchPriceCard(card);
				if (derived && hasBatchPricingPlan(derived)) {
					return { model, capability, pricingPlan: "batch", card: derived };
				}
			}
		}
	}
	return null;
}

function extractRequestBody(entry: any): Record<string, unknown> | null {
	const body = entry?.body ?? entry?.request?.body;
	return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

function extractRequestEndpoint(entry: any, fallback: unknown): unknown {
	return entry?.url ?? entry?.request?.url ?? fallback;
}

function buildEstimatedUsage(
	usage: BatchUsageEstimate,
	totalNanos: number,
	options?: {
		totalRows?: number;
		sampledRows?: number;
		truncated?: boolean;
	},
): Record<string, unknown> {
	const costNanos = Math.max(0, Math.round(totalNanos));
	return {
		...usage,
		estimated: true,
		...(options?.truncated
			? {
				estimation_truncated: true,
				estimation_sample_size: options.sampledRows ?? usage.requests,
				estimation_total_rows: options.totalRows ?? usage.requests,
			}
			: {}),
		pricing: {
			total_nanos: costNanos,
			total_usd_str: (costNanos / 1e9).toFixed(9),
			total_cents: Math.trunc(costNanos / 10_000_000),
			currency: "USD",
			lines: [],
		},
	};
}

export async function reserveBatchCredits(args: {
	workspaceId: string;
	batchId: string;
	inputFileId?: string | null;
	endpoint?: string | null;
	model?: string | null;
}): Promise<BatchReservationResult> {
	const reservationId = `${BATCH_RESERVATION_PREFIX}${args.batchId}`;
	const inputFileId = normalizeText(args.inputFileId);
	if (!inputFileId) {
		return { reservationId, held: false, amountNanos: 0, status: "skip_missing_input_file" };
	}

	let parsedInput: ParsedBatchInput;
	try {
		parsedInput = parseJsonLines(await fetchOpenAiFileText(inputFileId));
	} catch (error) {
		console.warn("batch_reservation_input_read_failed", {
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			inputFileId,
			error,
		});
		return { reservationId, held: false, amountNanos: 0, status: "skip_input_unavailable" };
	}

	const { entries, totalRows, truncated } = parsedInput;
	if (entries.length === 0) {
		return { reservationId, held: false, amountNanos: 0, status: "skip_empty_input" };
	}

	let totalNanos = 0;
	const aggregate = emptyUsage();
	for (const entry of entries) {
		const body = extractRequestBody(entry);
		if (!body) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_invalid_input_row" };
		}
		const model = normalizeText(body.model) ?? normalizeText(args.model);
		if (!model) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_missing_model" };
		}
		const endpoint = extractRequestEndpoint(entry, args.endpoint);
		if (!isSupportedOpenAiBatchEndpoint(endpoint)) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_unsupported_endpoint" };
		}
		const resolved = await resolveBatchPriceCard({ model, endpoint });
		if (!resolved?.card) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_price_card_missing" };
		}
		const usage = estimateUsageForBody(body, endpoint);
		if (isVideoBatchEndpoint(endpoint) && usage.output_video_seconds <= 0) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_missing_video_seconds" };
		}
		const priced = isVideoBatchEndpoint(endpoint)
			? computeVideoPricedUsage({
				seconds: usage.output_video_seconds,
				card: resolved.card as any,
				model: resolved.model,
				requestOptions: {
					...body,
					...buildVideoPricingRequestOptions(body as any),
					pricing_plan: "batch",
					service_tier: "batch",
				},
			})
			: computeBill(
				{
					input_text_tokens: usage.input_text_tokens,
					output_text_tokens: usage.output_text_tokens,
					embedding_tokens: usage.embedding_tokens,
					input_tokens: usage.input_text_tokens,
					output_tokens: usage.output_text_tokens,
					requests: isModerationBatchEndpoint(endpoint) ? usage.requests : undefined,
					output_image: usage.output_image || undefined,
					total_tokens: usage.total_tokens,
				},
				resolved.card,
				{
					pricing_plan: resolved.pricingPlan,
					service_tier: "batch",
					batch_endpoint: normalizeBatchEndpointPath(endpoint),
					batch_capability: resolved.capability,
					model: resolved.model,
					...(isImageBatchEndpoint(endpoint) ? buildImagePricingRequestOptions(body as any, {
						output_image: usage.output_image,
						...body,
					} as any) : {}),
				},
				resolved.pricingPlan,
			);
		const rowNanos = extractPricedTotalNanos(priced as Record<string, unknown>);
		if (rowNanos <= 0 && hasExplicitEmptyPricingLines(priced as Record<string, unknown>) && hasPositivePricingRule(resolved.card)) {
			return { reservationId, held: false, amountNanos: 0, status: "skip_price_card_missing" };
		}
		totalNanos += rowNanos;
		addUsage(aggregate, usage);
	}

	if (truncated && entries.length > 0) {
		const multiplier = totalRows / entries.length;
		totalNanos *= multiplier;
	}
	const estimatedAggregate = truncated && entries.length > 0
		? scaleUsageEstimate(aggregate, totalRows / entries.length)
		: aggregate;
	const amountNanos = Math.max(0, Math.round(totalNanos));
	const estimatedUsage = buildEstimatedUsage(estimatedAggregate, amountNanos, {
		totalRows,
		sampledRows: entries.length,
		truncated,
	});
	if (amountNanos <= 0) {
		return { reservationId, held: false, amountNanos: 0, status: "skip_zero_cost", estimatedUsage };
	}

	const reserved = await reserveWalletCredits({
		workspaceId: args.workspaceId,
		reservationId,
		amountNanos,
		holdRefId: args.batchId,
	});

	return {
		reservationId,
		held: reserved.status === "held" && (reserved.applied || reserved.alreadyApplied),
		amountNanos,
		status: reserved.status,
		estimatedUsage,
	};
}
