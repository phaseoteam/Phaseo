import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ModelUsageDailyBreakdownRow = {
	dayBucket: string;
	modelId: string;
	providerId: string;
	endpoint: string;
	requests: number;
	successRequests: number;
	failedRequests: number;
	neutralRequests: number;
	rateLimitedRequests: number;
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	inputTextTokens: number;
	outputTextTokens: number;
	inputImageTokens: number;
	outputImageTokens: number;
	inputAudioTokens: number;
	outputAudioTokens: number;
	inputVideoTokens: number;
	outputVideoTokens: number;
	imageInputs: number;
	imageOutputs: number;
	audioInputs: number;
	audioOutputs: number;
	videoInputs: number;
	videoOutputs: number;
	cachedReadTokens: number;
	cachedWriteTokens: number;
	cachedReadTextTokens: number;
	cachedWriteTextTokens: number;
	cachedWriteTextTokens5m: number;
	cachedWriteTextTokens1h: number;
	cachedReadImageTokens: number;
	cachedWriteImageTokens: number;
	cachedReadAudioTokens: number;
	cachedWriteAudioTokens: number;
	cachedReadVideoTokens: number;
	cachedWriteVideoTokens: number;
	inputQuadTokens: number;
	outputQuadTokens: number;
	totalQuadTokens: number;
	textQuadTokens: number;
	rerankQuadTokens: number;
	embeddingQuadTokens: number;
	moderationQuadTokens: number;
	ocrQuadTokens: number;
	imageMegapixels: number;
	audioSeconds: number;
	videoPixelSeconds: number;
	inputCharacters: number;
	outputCharacters: number;
	totalCharacters: number;
	totalCostNanos: number;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	avgThroughput: number | null;
};

type RpcModelUsageDailyBreakdownRow = {
	day_bucket: string | null;
	model_id: string | null;
	provider_id: string | null;
	endpoint: string | null;
	requests: number | string | null;
	success_requests: number | string | null;
	failed_requests: number | string | null;
	neutral_requests: number | string | null;
	rate_limited_requests: number | string | null;
	total_tokens: number | string | null;
	input_tokens: number | string | null;
	output_tokens: number | string | null;
	reasoning_tokens: number | string | null;
	input_text_tokens: number | string | null;
	output_text_tokens: number | string | null;
	input_image_tokens: number | string | null;
	output_image_tokens: number | string | null;
	input_audio_tokens: number | string | null;
	output_audio_tokens: number | string | null;
	input_video_tokens: number | string | null;
	output_video_tokens: number | string | null;
	image_inputs: number | string | null;
	image_outputs: number | string | null;
	audio_inputs: number | string | null;
	audio_outputs: number | string | null;
	video_inputs: number | string | null;
	video_outputs: number | string | null;
	cached_read_tokens: number | string | null;
	cached_write_tokens: number | string | null;
	cached_read_text_tokens: number | string | null;
	cached_write_text_tokens: number | string | null;
	cached_write_text_tokens_5m: number | string | null;
	cached_write_text_tokens_1h: number | string | null;
	cached_read_image_tokens: number | string | null;
	cached_write_image_tokens: number | string | null;
	cached_read_audio_tokens: number | string | null;
	cached_write_audio_tokens: number | string | null;
	cached_read_video_tokens: number | string | null;
	cached_write_video_tokens: number | string | null;
	input_quad_tokens: number | string | null;
	output_quad_tokens: number | string | null;
	total_quad_tokens: number | string | null;
	text_quad_tokens: number | string | null;
	rerank_quad_tokens: number | string | null;
	embedding_quad_tokens: number | string | null;
	moderation_quad_tokens: number | string | null;
	ocr_quad_tokens: number | string | null;
	image_megapixels: number | string | null;
	audio_seconds: number | string | null;
	video_pixel_seconds: number | string | null;
	input_characters: number | string | null;
	output_characters: number | string | null;
	total_characters: number | string | null;
	total_cost_nanos: number | string | null;
	avg_latency_ms: number | string | null;
	avg_generation_ms: number | string | null;
	avg_throughput: number | string | null;
};

function toInt(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function toFiniteNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value: unknown): string {
	const text = String(value ?? "").trim();
	if (!text) return "";
	return text.slice(0, 10);
}

function mapUsageRow(
	row: RpcModelUsageDailyBreakdownRow,
): ModelUsageDailyBreakdownRow {
	return {
		dayBucket: toIsoDate(row.day_bucket),
		modelId: String(row.model_id ?? ""),
		providerId: String(row.provider_id ?? ""),
		endpoint: String(row.endpoint ?? ""),
		requests: toInt(row.requests),
		successRequests: toInt(row.success_requests),
		failedRequests: toInt(row.failed_requests),
		neutralRequests: toInt(row.neutral_requests),
		rateLimitedRequests: toInt(row.rate_limited_requests),
		totalTokens: toInt(row.total_tokens),
		inputTokens: toInt(row.input_tokens),
		outputTokens: toInt(row.output_tokens),
		reasoningTokens: toInt(row.reasoning_tokens),
		inputTextTokens: toInt(row.input_text_tokens),
		outputTextTokens: toInt(row.output_text_tokens),
		inputImageTokens: toInt(row.input_image_tokens),
		outputImageTokens: toInt(row.output_image_tokens),
		inputAudioTokens: toInt(row.input_audio_tokens),
		outputAudioTokens: toInt(row.output_audio_tokens),
		inputVideoTokens: toInt(row.input_video_tokens),
		outputVideoTokens: toInt(row.output_video_tokens),
		imageInputs: toInt(row.image_inputs),
		imageOutputs: toInt(row.image_outputs),
		audioInputs: toInt(row.audio_inputs),
		audioOutputs: toInt(row.audio_outputs),
		videoInputs: toInt(row.video_inputs),
		videoOutputs: toInt(row.video_outputs),
		cachedReadTokens: toInt(row.cached_read_tokens),
		cachedWriteTokens: toInt(row.cached_write_tokens),
		cachedReadTextTokens: toInt(row.cached_read_text_tokens),
		cachedWriteTextTokens: toInt(row.cached_write_text_tokens),
		cachedWriteTextTokens5m: toInt(row.cached_write_text_tokens_5m),
		cachedWriteTextTokens1h: toInt(row.cached_write_text_tokens_1h),
		cachedReadImageTokens: toInt(row.cached_read_image_tokens),
		cachedWriteImageTokens: toInt(row.cached_write_image_tokens),
		cachedReadAudioTokens: toInt(row.cached_read_audio_tokens),
		cachedWriteAudioTokens: toInt(row.cached_write_audio_tokens),
		cachedReadVideoTokens: toInt(row.cached_read_video_tokens),
		cachedWriteVideoTokens: toInt(row.cached_write_video_tokens),
		inputQuadTokens: toInt(row.input_quad_tokens),
		outputQuadTokens: toInt(row.output_quad_tokens),
		totalQuadTokens: toInt(row.total_quad_tokens),
		textQuadTokens: toInt(row.text_quad_tokens),
		rerankQuadTokens: toInt(row.rerank_quad_tokens),
		embeddingQuadTokens: toInt(row.embedding_quad_tokens),
		moderationQuadTokens: toInt(row.moderation_quad_tokens),
		ocrQuadTokens: toInt(row.ocr_quad_tokens),
		imageMegapixels: toFiniteNumber(row.image_megapixels) ?? 0,
		audioSeconds: toFiniteNumber(row.audio_seconds) ?? 0,
		videoPixelSeconds: toFiniteNumber(row.video_pixel_seconds) ?? 0,
		inputCharacters: toInt(row.input_characters),
		outputCharacters: toInt(row.output_characters),
		totalCharacters: toInt(row.total_characters),
		totalCostNanos: toInt(row.total_cost_nanos),
		avgLatencyMs: toFiniteNumber(row.avg_latency_ms),
		avgGenerationMs: toFiniteNumber(row.avg_generation_ms),
		avgThroughput: toFiniteNumber(row.avg_throughput),
	};
}

function toIsoDateParam(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function defaultSince(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - Math.max(1, days));
	return toIsoDateParam(date);
}

export async function getModelUsageDailyBreakdown(args: {
	modelId: string;
	modelAliases?: string[];
	providerIds?: string[];
	days?: number;
	since?: string;
	until?: string;
}): Promise<ModelUsageDailyBreakdownRow[]> {
	const modelIds = Array.from(
		new Set([args.modelId, ...(args.modelAliases ?? [])].filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));
	if (!modelIds.length) return [];

	const days = Math.max(1, Math.min(365, Math.round(args.days ?? 30)));
	const since = args.since?.slice(0, 10) || defaultSince(days);
	const until = args.until?.slice(0, 10) || toIsoDateParam(new Date());
	const providerIds =
		args.providerIds && args.providerIds.length > 0
			? Array.from(new Set(args.providerIds.filter(Boolean))).sort((a, b) =>
					a.localeCompare(b),
				)
			: null;

	const client = createAdminClient();
	const { data, error } = await client.rpc("get_model_usage_daily_breakdown", {
		p_model_ids: modelIds,
		p_provider_ids: providerIds,
		p_since: since,
		p_until: until,
	});

	if (error) {
		console.warn("Failed to fetch model daily usage breakdown", {
			modelId: args.modelId,
			error,
		});
		return [];
	}

	return ((data ?? []) as RpcModelUsageDailyBreakdownRow[]).map(mapUsageRow);
}

export async function getModelUsageDailyBreakdownCached(args: {
	modelId: string;
	modelAliases?: string[];
	providerIds?: string[];
	days?: number;
	since?: string;
	until?: string;
}): Promise<ModelUsageDailyBreakdownRow[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_model_usage_daily");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);
	cacheTag(`data:gateway_model_usage_daily:model:${args.modelId}`);
	cacheTag(`model:usage-daily:${args.modelId}`);

	return getModelUsageDailyBreakdown(args);
}
