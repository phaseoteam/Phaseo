import { shapeUsageForClient } from "./usage";
import type { Endpoint } from "@core/types";

export type GatewayRequestUsageColumns = {
	usage_total_tokens: number;
	usage_input_tokens: number;
	usage_output_tokens: number;
	usage_reasoning_tokens: number;
	usage_input_text_tokens: number;
	usage_output_text_tokens: number;
	usage_input_image_tokens: number;
	usage_output_image_tokens: number;
	usage_input_audio_tokens: number;
	usage_output_audio_tokens: number;
	usage_input_video_tokens: number;
	usage_output_video_tokens: number;
	usage_image_inputs: number;
	usage_image_outputs: number;
	usage_audio_inputs: number;
	usage_audio_outputs: number;
	usage_video_inputs: number;
	usage_video_outputs: number;
	usage_cached_read_tokens: number;
	usage_cached_write_tokens: number;
	usage_cached_read_text_tokens: number;
	usage_cached_write_text_tokens: number;
	usage_cached_write_text_tokens_5m: number;
	usage_cached_write_text_tokens_1h: number;
	usage_cached_read_image_tokens: number;
	usage_cached_write_image_tokens: number;
	usage_cached_read_audio_tokens: number;
	usage_cached_write_audio_tokens: number;
	usage_cached_read_video_tokens: number;
	usage_cached_write_video_tokens: number;
	usage_input_quad_tokens: number;
	usage_output_quad_tokens: number;
	usage_total_quad_tokens: number;
	usage_text_quad_tokens: number;
	usage_rerank_quad_tokens: number;
	usage_embedding_quad_tokens: number;
	usage_moderation_quad_tokens: number;
	usage_ocr_quad_tokens: number;
	usage_image_megapixels: number;
	usage_audio_seconds: number;
	usage_video_pixel_seconds: number;
	usage_input_characters: number;
	usage_output_characters: number;
	usage_total_characters: number;
	usage_normalized_at: string;
};

export const GATEWAY_REQUEST_USAGE_COLUMN_NAMES = [
	"usage_total_tokens",
	"usage_input_tokens",
	"usage_output_tokens",
	"usage_reasoning_tokens",
	"usage_input_text_tokens",
	"usage_output_text_tokens",
	"usage_input_image_tokens",
	"usage_output_image_tokens",
	"usage_input_audio_tokens",
	"usage_output_audio_tokens",
	"usage_input_video_tokens",
	"usage_output_video_tokens",
	"usage_image_inputs",
	"usage_image_outputs",
	"usage_audio_inputs",
	"usage_audio_outputs",
	"usage_video_inputs",
	"usage_video_outputs",
	"usage_cached_read_tokens",
	"usage_cached_write_tokens",
	"usage_cached_read_text_tokens",
	"usage_cached_write_text_tokens",
	"usage_cached_write_text_tokens_5m",
	"usage_cached_write_text_tokens_1h",
	"usage_cached_read_image_tokens",
	"usage_cached_write_image_tokens",
	"usage_cached_read_audio_tokens",
	"usage_cached_write_audio_tokens",
	"usage_cached_read_video_tokens",
	"usage_cached_write_video_tokens",
	"usage_input_quad_tokens",
	"usage_output_quad_tokens",
	"usage_total_quad_tokens",
	"usage_text_quad_tokens",
	"usage_rerank_quad_tokens",
	"usage_embedding_quad_tokens",
	"usage_moderation_quad_tokens",
	"usage_ocr_quad_tokens",
	"usage_image_megapixels",
	"usage_audio_seconds",
	"usage_video_pixel_seconds",
	"usage_input_characters",
	"usage_output_characters",
	"usage_total_characters",
	"usage_normalized_at",
] as const;

function toNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
	}
	return 0;
}

function toFiniteNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return Math.max(0, parsed);
	}
	return 0;
}

function readPath(source: any, path: string): unknown {
	if (!source || typeof source !== "object") return undefined;
	let cursor = source;
	for (const part of path.split(".")) {
		if (!cursor || typeof cursor !== "object") return undefined;
		cursor = cursor[part];
	}
	return cursor;
}

function firstNumber(source: any, paths: string[]): number {
	for (const path of paths) {
		const value = toNumber(readPath(source, path));
		if (value > 0) return value;
	}
	return 0;
}

function firstUnitNumber(source: any, paths: string[]): number {
	for (const path of paths) {
		const value = toFiniteNumber(readPath(source, path));
		if (value > 0) return value;
	}
	return 0;
}

function textLength(value: unknown): number {
	if (typeof value === "string") return value.length;
	if (typeof value === "number" || typeof value === "boolean") return String(value).length;
	if (!value) return 0;
	if (Array.isArray(value)) return value.reduce((sum, entry) => sum + textLength(entry), 0);
	if (typeof value !== "object") return 0;

	const record = value as Record<string, unknown>;
	let total = 0;
	for (const [key, entry] of Object.entries(record)) {
		if (
			key === "image_url" ||
			key === "input_image" ||
			key === "audio" ||
			key === "input_audio" ||
			key === "video" ||
			key === "input_video" ||
			key === "file" ||
			key === "metadata"
		) {
			continue;
		}
		total += textLength(entry);
	}
	return total;
}

function extractRequestTextCharacters(payload: unknown): number {
	if (!payload || typeof payload !== "object") return 0;
	const body = payload as any;
	if (Array.isArray(body.messages)) return textLength(body.messages);
	if (Array.isArray(body.input)) return textLength(body.input);
	if (Array.isArray(body.input_items)) return textLength(body.input_items);
	if (Array.isArray(body.contents)) return textLength(body.contents);
	if (typeof body.prompt === "string") return body.prompt.length;
	return textLength(body);
}

function extractResponseTextCharacters(payload: unknown): number {
	if (!payload || typeof payload !== "object") return 0;
	const body = payload as any;
	if (typeof body.output_text === "string") return body.output_text.length;
	if (typeof body.text === "string") return body.text.length;
	if (typeof body.content === "string") return body.content.length;
	if (typeof body.message?.content === "string") return body.message.content.length;
	if (Array.isArray(body.choices)) {
		return body.choices.reduce(
			(sum: number, choice: any) =>
				sum +
				textLength(choice?.message?.content) +
				textLength(choice?.delta?.content) +
				textLength(choice?.text),
			0,
		);
	}
	if (Array.isArray(body.output)) return textLength(body.output);
	return textLength(body);
}

function toQuadTokens(characters: number): number {
	return characters > 0 ? Math.ceil(characters / 4) : 0;
}

function parseDimensionPair(value: unknown): { width: number; height: number } | null {
	if (typeof value !== "string") return null;
	const match = value.match(/(\d{2,5})\s*[xX×]\s*(\d{2,5})/);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}
	return { width, height };
}

function firstDimensionPair(...values: unknown[]): { width: number; height: number } | null {
	for (const value of values) {
		const parsed = parseDimensionPair(value);
		if (parsed) return parsed;
	}
	return null;
}

function outputCountFromPayload(payload: unknown): number {
	if (!payload || typeof payload !== "object") return 1;
	const body = payload as any;
	const n = toNumber(body.n ?? body.count ?? body.num_outputs);
	return n > 0 ? n : 1;
}

function estimateImageMegapixels(args: {
	usage: any;
	requestPayload?: unknown;
	gatewayResponse?: unknown;
}): number {
	const explicit = firstUnitNumber(args.usage, [
		"image_megapixels",
		"input_image_megapixels",
		"output_image_megapixels",
	]);
	if (explicit > 0) return explicit;

	const pixels = firstUnitNumber(args.usage, [
		"image_pixels",
		"input_image_pixels",
		"output_image_pixels",
	]);
	if (pixels > 0) return pixels / 1_000_000;

	const body = args.requestPayload && typeof args.requestPayload === "object" ? args.requestPayload as any : {};
	const dims = firstDimensionPair(
		body.size,
		body.resolution,
		body.output_size,
		body.output_resolution,
		body.image_size,
	);
	if (!dims) return 0;
	return (dims.width * dims.height * outputCountFromPayload(args.requestPayload)) / 1_000_000;
}

function estimateAudioSeconds(usage: any): number {
	const seconds = firstUnitNumber(usage, [
		"audio_seconds",
		"input_audio_seconds",
		"output_audio_seconds",
	]);
	if (seconds > 0) return seconds;
	const minutes = firstUnitNumber(usage, [
		"audio_minutes",
		"input_audio_minutes",
		"output_audio_minutes",
	]);
	return minutes > 0 ? minutes * 60 : 0;
}

function estimateVideoPixelSeconds(args: {
	usage: any;
	requestPayload?: unknown;
}): number {
	const explicit = firstUnitNumber(args.usage, [
		"video_pixel_seconds",
		"input_video_pixel_seconds",
		"output_video_pixel_seconds",
	]);
	if (explicit > 0) return explicit;

	const pixels = firstUnitNumber(args.usage, [
		"video_pixels",
		"input_video_pixels",
		"output_video_pixels",
	]);
	const usageSeconds = firstUnitNumber(args.usage, [
		"video_seconds",
		"input_video_seconds",
		"output_video_seconds",
	]);
	if (pixels > 0 && usageSeconds > 0) return pixels * usageSeconds;

	const body = args.requestPayload && typeof args.requestPayload === "object" ? args.requestPayload as any : {};
	const dims = firstDimensionPair(
		body.size,
		body.resolution,
		body.output_size,
		body.output_resolution,
		body.video_size,
	);
	const seconds = usageSeconds || toNumber(body.seconds ?? body.duration ?? body.duration_seconds);
	if (!dims || seconds <= 0) return 0;
	return dims.width * dims.height * seconds * outputCountFromPayload(args.requestPayload);
}

function endpointQuadBreakdown(endpoint: Endpoint | undefined, totalQuadTokens: number) {
	return {
		usage_rerank_quad_tokens: endpoint === "rerank" ? totalQuadTokens : 0,
		usage_embedding_quad_tokens: endpoint === "embeddings" ? totalQuadTokens : 0,
		usage_moderation_quad_tokens: endpoint === "moderations" ? totalQuadTokens : 0,
		usage_ocr_quad_tokens: endpoint === "ocr" ? totalQuadTokens : 0,
	};
}

export function buildGatewayRequestUsageColumns(args: {
	usage: unknown;
	endpoint?: Endpoint;
	requestPayload?: unknown;
	gatewayResponse?: unknown;
	now?: Date;
}): GatewayRequestUsageColumns {
	const rawUsage =
		args.usage && typeof args.usage === "object" && !Array.isArray(args.usage)
			? args.usage as Record<string, unknown>
			: {};
	const shaped = shapeUsageForClient(rawUsage) ?? {};
	const usageForUnits = { ...rawUsage, ...shaped };
	const inputTokens = firstNumber(shaped, ["input_tokens", "input_text_tokens"]);
	const outputTokens = firstNumber(shaped, ["output_tokens", "output_text_tokens"]);
	const reasoningTokens = firstNumber(shaped, [
		"reasoning_tokens",
		"output_tokens_details.reasoning_tokens",
		"completion_tokens_details.reasoning_tokens",
	]);
	const providerTotalTokens = firstNumber(rawUsage, [
		"total_tokens",
		"totalTokens",
		"total",
	]);
	const totalTokens =
		providerTotalTokens > 0
			? Math.max(providerTotalTokens, inputTokens + outputTokens)
			: inputTokens + outputTokens + reasoningTokens;

	const inputImageTokens = firstNumber(shaped, [
		"input_image_tokens",
		"input_tokens_details.input_images",
	]);
	const outputImageTokens = firstNumber(shaped, [
		"output_image_tokens",
		"output_tokens_details.output_images",
	]);
	const inputAudioTokens = firstNumber(shaped, [
		"input_audio_tokens",
		"input_tokens_details.input_audio",
	]);
	const outputAudioTokens = firstNumber(shaped, [
		"output_audio_tokens",
		"output_tokens_details.output_audio",
	]);
	const inputVideoTokens = firstNumber(shaped, [
		"input_video_tokens",
		"input_tokens_details.input_videos",
	]);
	const outputVideoTokens = firstNumber(shaped, [
		"output_video_tokens",
		"output_tokens_details.output_videos",
	]);

	const inputCharacters = extractRequestTextCharacters(args.requestPayload);
	const outputCharacters = extractResponseTextCharacters(args.gatewayResponse);
	const inputQuadTokens = toQuadTokens(inputCharacters);
	const outputQuadTokens = toQuadTokens(outputCharacters);
	const totalQuadTokens = inputQuadTokens + outputQuadTokens;
	const endpointQuads = endpointQuadBreakdown(args.endpoint, totalQuadTokens);
	const splitCachedWriteTextTokens =
		firstNumber(shaped, ["cached_write_text_tokens_5m"]) +
		firstNumber(shaped, ["cached_write_text_tokens_1h"]);
	const cachedWriteTextTokens =
		firstNumber(shaped, ["cached_write_text_tokens"]) || splitCachedWriteTextTokens;

	return {
		usage_total_tokens: totalTokens,
		usage_input_tokens: inputTokens,
		usage_output_tokens: outputTokens,
		usage_reasoning_tokens: reasoningTokens,
		usage_input_text_tokens: Math.max(
			0,
			firstNumber(shaped, ["input_text_tokens"]) ||
				inputTokens - inputImageTokens - inputAudioTokens - inputVideoTokens,
		),
		usage_output_text_tokens: Math.max(
			0,
			firstNumber(shaped, ["output_text_tokens"]) ||
				outputTokens - outputImageTokens - outputAudioTokens - outputVideoTokens - reasoningTokens,
		),
		usage_input_image_tokens: inputImageTokens,
		usage_output_image_tokens: outputImageTokens,
		usage_input_audio_tokens: inputAudioTokens,
		usage_output_audio_tokens: outputAudioTokens,
		usage_input_video_tokens: inputVideoTokens,
		usage_output_video_tokens: outputVideoTokens,
		usage_image_inputs: firstNumber(shaped, ["input_image_count", "input_images", "input_tokens_details.input_images"]),
		usage_image_outputs: firstNumber(shaped, ["output_image_count", "output_images", "output_tokens_details.output_images"]),
		usage_audio_inputs: firstNumber(shaped, ["input_audio_count", "input_audio", "input_tokens_details.input_audio"]),
		usage_audio_outputs: firstNumber(shaped, ["output_audio_count", "output_audio", "output_tokens_details.output_audio"]),
		usage_video_inputs: firstNumber(shaped, ["input_video_count", "input_videos", "input_tokens_details.input_videos"]),
		usage_video_outputs: firstNumber(shaped, ["output_video_count", "output_videos", "output_tokens_details.output_videos"]),
		usage_cached_read_tokens: firstNumber(shaped, ["cache_read_tokens", "input_tokens_details.cached_tokens"]),
		usage_cached_write_tokens:
			firstNumber(shaped, ["cache_write_tokens"]) ||
			cachedWriteTextTokens ||
			firstNumber(shaped, ["output_tokens_details.cached_tokens"]),
		usage_cached_read_text_tokens: firstNumber(shaped, ["cached_read_text_tokens"]),
		usage_cached_write_text_tokens: cachedWriteTextTokens,
		usage_cached_write_text_tokens_5m: firstNumber(shaped, ["cached_write_text_tokens_5m"]),
		usage_cached_write_text_tokens_1h: firstNumber(shaped, ["cached_write_text_tokens_1h"]),
		usage_cached_read_image_tokens: firstNumber(shaped, ["cached_read_image_tokens"]),
		usage_cached_write_image_tokens: firstNumber(shaped, ["cached_write_image_tokens"]),
		usage_cached_read_audio_tokens: firstNumber(shaped, ["cached_read_audio_tokens"]),
		usage_cached_write_audio_tokens: firstNumber(shaped, ["cached_write_audio_tokens"]),
		usage_cached_read_video_tokens: firstNumber(shaped, ["cached_read_video_tokens"]),
		usage_cached_write_video_tokens: firstNumber(shaped, ["cached_write_video_tokens"]),
		usage_input_quad_tokens: inputQuadTokens,
		usage_output_quad_tokens: outputQuadTokens,
		usage_total_quad_tokens: totalQuadTokens,
		usage_text_quad_tokens: totalQuadTokens,
		...endpointQuads,
		usage_image_megapixels: estimateImageMegapixels({
			usage: usageForUnits,
			requestPayload: args.requestPayload,
			gatewayResponse: args.gatewayResponse,
		}),
		usage_audio_seconds: estimateAudioSeconds(usageForUnits),
		usage_video_pixel_seconds: estimateVideoPixelSeconds({
			usage: usageForUnits,
			requestPayload: args.requestPayload,
		}),
		usage_input_characters: inputCharacters,
		usage_output_characters: outputCharacters,
		usage_total_characters: inputCharacters + outputCharacters,
		usage_normalized_at: (args.now ?? new Date()).toISOString(),
	};
}

export function stripGatewayRequestUsageColumns<T extends Record<string, unknown>>(row: T): T {
	const next = { ...row };
	for (const column of GATEWAY_REQUEST_USAGE_COLUMN_NAMES) {
		delete next[column];
	}
	return next as T;
}
