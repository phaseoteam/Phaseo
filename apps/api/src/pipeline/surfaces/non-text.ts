// Purpose: Non-text pipeline surface.
// Why: Routes image/audio/ocr/music endpoints through IR conversion.
// How: Decodes request to IR, executes via IR executors, then encodes endpoint payload.

import type {
	IRAudioSpeechRequest,
	IRAudioSpeechResponse,
	IRAudioTranscriptionRequest,
	IRAudioTranscriptionResponse,
	IRAudioTranslationRequest,
	IRAudioTranslationResponse,
	IRImageGenerationRequest,
	IRImageGenerationResponse,
	IRMusicGenerateRequest,
	IRMusicGenerateResponse,
	IROcrRequest,
	IROcrResponse,
	IRParseRequest,
	IRParseResponse,
	IRUsage,
} from "@core/ir";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
import { saveMusicJobMeta } from "@core/music-jobs";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import type { PipelineRunnerArgs } from "./types";

type NonTextEndpoint =
	| "images.generations"
	| "images.edits"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "ocr"
	| "parse"
	| "music.generate";

type NonTextIRRequest =
	| IRImageGenerationRequest
	| IRAudioSpeechRequest
	| IRAudioTranscriptionRequest
	| IRAudioTranslationRequest
	| IROcrRequest
	| IRParseRequest
	| IRMusicGenerateRequest;

type NonTextIRResponse =
	| IRImageGenerationResponse
	| IRAudioSpeechResponse
	| IRAudioTranscriptionResponse
	| IRAudioTranslationResponse
	| IROcrResponse
	| IRParseResponse
	| IRMusicGenerateResponse;

function isNonTextEndpoint(endpoint: Endpoint): endpoint is NonTextEndpoint {
	return endpoint === "images.generations" ||
		endpoint === "images.edits" ||
		endpoint === "audio.speech" ||
		endpoint === "audio.transcription" ||
		endpoint === "audio.translations" ||
		endpoint === "ocr" ||
		endpoint === "parse" ||
		endpoint === "music.generate";
}

function decodeUsage(usage: IRUsage | undefined): Record<string, any> | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	if ((usage as any).type === "duration" && typeof (usage as any).seconds === "number") {
		return { type: "duration", seconds: (usage as any).seconds };
	}
	const inputTokens = Number(
		(usage as any).inputTokens ??
		(usage as any).input_tokens ??
		(usage as any).input_text_tokens ??
		(usage as any).prompt_tokens ??
		(usage as any).promptTokens ??
		(usage as any).prompt_token_count ??
		(usage as any).total_input_tokens ??
		0,
	);
	const outputTokens = Number(
		(usage as any).outputTokens ??
		(usage as any).output_tokens ??
		(usage as any).output_text_tokens ??
		(usage as any).completion_tokens ??
		(usage as any).completionTokens ??
		(usage as any).completion_token_count ??
		(usage as any).total_output_tokens ??
		0,
	);
	const totalTokens = Number(
		(usage as any).totalTokens ??
		(usage as any).total_tokens ??
		(usage as any).totalTokenCount ??
		inputTokens + outputTokens,
	);

	const output: Record<string, any> = {
		...((usage as any).type ? { type: (usage as any).type } : {}),
		input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
		output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
		total_tokens: Number.isFinite(totalTokens) ? totalTokens : inputTokens + outputTokens,
	};
	if ((usage as any).input_tokens_details && typeof (usage as any).input_tokens_details === "object") {
		output.input_tokens_details = (usage as any).input_tokens_details;
	}
	if ((usage as any).input_token_details && typeof (usage as any).input_token_details === "object") {
		output.input_token_details = (usage as any).input_token_details;
	}
	if ((usage as any).output_tokens_details && typeof (usage as any).output_tokens_details === "object") {
		output.output_tokens_details = (usage as any).output_tokens_details;
	}

	const passthroughNumericKeys = [
		"requests",
		"input_characters",
		"output_characters",
		"total_characters",
		"characters",
		"input_quad_tokens",
		"output_quad_tokens",
		"total_quad_tokens",
		"text_quad_tokens",
		"rerank_quad_tokens",
		"embedding_quad_tokens",
		"moderation_quad_tokens",
		"ocr_quad_tokens",
		"cached_write_text_tokens",
		"cached_write_text_tokens_5m",
		"cached_write_text_tokens_1h",
		"input_pages",
		"output_pages",
		"pages",
		"doc_size_bytes",
		"document_bytes",
		"input_image_pixels",
		"output_image_pixels",
		"image_pixels",
		"input_image_megapixels",
		"output_image_megapixels",
		"image_megapixels",
		"input_audio_seconds",
		"audio_seconds",
		"input_audio_minutes",
		"output_audio_minutes",
		"audio_minutes",
		"output_image",
		"output_audio_count",
		"output_audio_seconds",
		"input_video_seconds",
		"video_seconds",
		"output_video_seconds",
		"input_video_pixels",
		"output_video_pixels",
		"video_pixels",
		"input_video_pixel_seconds",
		"output_video_pixel_seconds",
		"video_pixel_seconds",
		"input_image_tokens",
		"input_audio_tokens",
		"input_video_tokens",
		"output_image_tokens",
		"output_audio_tokens",
		"output_video_tokens",
		"embedding_tokens",
		"bfl_credits",
		"deepinfra_cost_usd",
	];

	for (const key of passthroughNumericKeys) {
		const value = (usage as any)[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			output[key] = value;
		}
	}

	return output;
}

function decodeNonTextRequest(endpoint: NonTextEndpoint, body: any): NonTextIRRequest {
	switch (endpoint) {
		case "images.generations":
		case "images.edits":
			return {
				model: body?.model,
				prompt: body?.prompt,
				image: body?.image,
				mask: body?.mask,
				size: body?.size,
				n: body?.n,
				quality: body?.quality,
				stream: body?.stream,
				partialImages: body?.partial_images,
				responseFormat: body?.response_format,
				outputFormat: body?.output_format,
				outputCompression: body?.output_compression,
				background: body?.background,
				moderation: body?.moderation,
				inputFidelity: body?.input_fidelity,
				style: body?.style,
				userId: body?.user,
				rawRequest: body,
			};
		case "audio.speech": {
			return {
				model: body?.model,
				input: body?.input,
				voice: body?.voice,
				format: body?.format,
				responseFormat: body?.response_format ?? body?.format,
				streamFormat: body?.stream_format,
				speed: body?.speed,
				instructions: body?.instructions,
				sessionId: body?.session_id,
				vendor: {
					elevenlabs: body?.config?.elevenlabs,
					minimax: body?.config?.minimax,
				},
				userId: body?.user,
				rawRequest: body,
			};
		}
		case "audio.transcription":
			return {
				model: body?.model,
				file: body?.file,
				fileUrl: body?.file_url,
				s3PresignedUrl: body?.s3_presigned_url,
				fileId: body?.file_id,
				language: body?.language,
				languages: Array.isArray(body?.languages) ? body.languages : undefined,
				keywords: Array.isArray(body?.keywords) ? body.keywords : undefined,
				prompt: body?.prompt,
				temperature: body?.temperature,
				responseFormat: body?.response_format,
				stream: body?.stream,
				timestampGranularities: Array.isArray(body?.timestamp_granularities)
					? body.timestamp_granularities
					: undefined,
				diarize: body?.diarize,
				enableDiarization: body?.enable_diarization,
				outputContent: body?.output_content,
				sessionId: body?.session_id,
				contextBias: Array.isArray(body?.context_bias) ? body.context_bias : undefined,
				include: Array.isArray(body?.include) ? body.include : undefined,
				chunkingStrategy: body?.chunking_strategy,
				knownSpeakerNames: Array.isArray(body?.known_speaker_names) ? body.known_speaker_names : undefined,
				knownSpeakerReferences: Array.isArray(body?.known_speaker_references) ? body.known_speaker_references : undefined,
				rawRequest: body,
			};
		case "audio.translations":
			return {
				model: body?.model,
				file: body?.file,
				language: body?.language,
				prompt: body?.prompt,
				temperature: body?.temperature,
				responseFormat: body?.response_format,
				rawRequest: body,
			};
		case "ocr":
			return {
				model: body?.model,
				image: body?.image,
				document: body?.document,
				pages: body?.pages,
				includeImageBase64: body?.include_image_base64,
				imageLimit: body?.image_limit,
				imageMinSize: body?.image_min_size,
				bboxAnnotationFormat: body?.bbox_annotation_format,
				documentAnnotationFormat: body?.document_annotation_format,
				documentAnnotationPrompt: body?.document_annotation_prompt,
				tableFormat: body?.table_format,
				extractHeader: body?.extract_header,
				extractFooter: body?.extract_footer,
				includeBlocks: body?.include_blocks,
				confidenceScoresGranularity: body?.confidence_scores_granularity,
				rawRequest: body,
			};
		case "parse":
			return {
				model: body?.model,
				document: {
					type: "image_url",
					imageUrl: body?.document?.image_url,
				},
				outputFormat: body?.output_format,
				rawRequest: body,
			};
		case "music.generate":
			return {
				model: body?.model,
				prompt: body?.prompt,
				duration: body?.duration,
				format: body?.format,
				vendor: {
					suno: body?.suno,
					elevenlabs: body?.elevenlabs,
					minimax: body?.minimax,
				},
				rawRequest: body,
			};
	}
}

export function encodeNonTextResponse(
	endpoint: NonTextEndpoint,
	ir: NonTextIRResponse,
	requestId: string,
): Record<string, any> {
	const usage = decodeUsage((ir as any).usage);

	switch (endpoint) {
		case "images.generations":
		case "images.edits": {
			const image = ir as IRImageGenerationResponse;
			return {
				...(image.nativeId ? { id: image.nativeId } : {}),
				created: image.created ?? Math.floor(Date.now() / 1000),
				model: image.model,
				...(image.background ? { background: image.background } : {}),
				...(image.outputFormat ? { output_format: image.outputFormat } : {}),
				...(image.size ? { size: image.size } : {}),
				...(image.quality ? { quality: image.quality } : {}),
				data: Array.isArray(image.data)
					? image.data.map((item) => ({
						...(item.url != null ? { url: item.url } : {}),
						...(item.b64Json != null ? { b64_json: item.b64Json } : {}),
						...(item.revisedPrompt != null ? { revised_prompt: item.revisedPrompt } : {}),
					}))
					: [],
				...(usage ? { usage } : {}),
			};
		}

		case "audio.speech": {
			const audio = ir as IRAudioSpeechResponse;
			return {
				id: audio.nativeId ?? audio.id ?? requestId,
				object: "audio.speech",
				model: audio.model,
				provider: audio.provider,
				...(audio.audio?.url ? { audio_url: audio.audio.url } : {}),
				...(audio.audio?.data ? { audio_base64: audio.audio.data } : {}),
				...(audio.audio?.mimeType ? { mime_type: audio.audio.mimeType } : {}),
				...(usage ? { usage } : {}),
			};
		}

		case "audio.transcription": {
			const transcription = ir as IRAudioTranscriptionResponse;
			return {
				id: transcription.nativeId ?? transcription.id ?? requestId,
				object: "transcription",
				model: transcription.model,
				provider: transcription.provider,
				text: transcription.text ?? "",
				...(transcription.task ? { task: transcription.task } : {}),
				...(transcription.language ? { language: transcription.language } : {}),
				...(Array.isArray(transcription.languages) ? { languages: transcription.languages } : {}),
				...(typeof transcription.duration === "number" ? { duration: transcription.duration } : {}),
				...(Array.isArray(transcription.words) ? { words: transcription.words } : {}),
				...(Array.isArray(transcription.segments) ? { segments: transcription.segments } : {}),
				...(Array.isArray(transcription.diarization) ? { diarization: transcription.diarization } : {}),
				...(Array.isArray(transcription.logprobs) ? { logprobs: transcription.logprobs } : {}),
				...(usage ? { usage } : {}),
			};
		}

		case "audio.translations": {
			const translation = ir as IRAudioTranslationResponse;
			return {
				id: translation.nativeId ?? translation.id ?? requestId,
				object: "translation",
				model: translation.model,
				provider: translation.provider,
				text: translation.text ?? "",
				...(typeof translation.duration === "number" ? { duration: translation.duration } : {}),
				...(typeof translation.language === "string" ? { language: translation.language } : {}),
				...(Array.isArray(translation.segments) ? { segments: translation.segments } : {}),
				...(usage ? { usage } : {}),
			};
		}

		case "ocr": {
			const ocr = ir as IROcrResponse;
			return {
				id: ocr.nativeId ?? ocr.id ?? requestId,
				object: "ocr",
				model: ocr.model,
				provider: ocr.provider,
				text: ocr.text ?? "",
				...(Array.isArray(ocr.pages) ? { pages: ocr.pages } : {}),
				...(ocr.documentAnnotation !== undefined ? { document_annotation: ocr.documentAnnotation } : {}),
				...(usage ? { usage } : {}),
			};
		}

		case "parse": {
			const parsed = ir as IRParseResponse;
			return {
				id: parsed.nativeId ?? parsed.id ?? requestId,
				object: "parse",
				model: parsed.model,
				provider: parsed.provider,
				pages: parsed.pages,
				...(parsed.meta ? { meta: parsed.meta } : {}),
				...(usage ? { usage } : {}),
			};
		}

		case "music.generate": {
			const music = ir as IRMusicGenerateResponse;
			return {
				id: music.id ?? requestId,
				object: "music",
				status: music.status ?? "completed",
				model: music.model,
				provider: music.provider,
				nativeResponseId: music.nativeId ?? null,
				...(music.audioUrl ? { audio_url: music.audioUrl } : {}),
				...(music.audioBase64 ? { audio_base64: music.audioBase64 } : {}),
				...(music.result != null ? { result: music.result } : {}),
				...(usage ? { usage } : {}),
			};
		}
	}
}

async function persistMusicResponse(
	workspaceId: string,
	requestId: string,
	request: IRMusicGenerateRequest,
	response: IRMusicGenerateResponse,
): Promise<void> {
	const usage = response.usage as (IRUsage & Record<string, unknown>) | undefined;
	const duration = typeof usage?.output_audio_seconds === "number"
		? usage.output_audio_seconds
		: null;
	const output = Array.isArray(response.output) && response.output.length > 0
		? response.output.map((item, index) => ({
			index: typeof item.index === "number" ? item.index : index,
			id: item.id ?? null,
			audio_url: item.audioUrl ?? null,
			stream_audio_url: item.streamAudioUrl ?? null,
			image_url: item.imageUrl ?? null,
			title: item.title ?? null,
			tags: item.tags ?? null,
			duration: item.duration ?? duration,
		}))
		: response.audioUrl
			? [{
				index: 0,
				id: response.nativeId ?? requestId,
				audio_url: response.audioUrl,
				duration,
			}]
			: null;
	const result = stripInlineMusicAudio(response.result, response.audioBase64);
	const rawResponse = stripInlineMusicAudio(response.rawResponse, response.audioBase64);
	await saveMusicJobMeta(workspaceId, requestId, {
		provider: response.provider,
		model: response.model,
		duration,
		format: request.format ?? null,
		status: response.status ?? "completed",
		nativeResponseId: response.nativeId ?? null,
		audioBase64: response.audioBase64 ?? null,
		output,
		result: result ?? null,
		rawResponse: rawResponse ?? null,
		createdAt: Date.now(),
	});
}

function stripInlineMusicAudio(value: unknown, audioBase64: string | undefined): unknown {
	if (!audioBase64 || value == null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return value.map((item) => stripInlineMusicAudio(item, audioBase64));
	}
	const output: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (
			typeof item === "string" &&
			item === audioBase64 &&
			["audio", "audio_base64", "audioBase64", "data"].includes(key)
		) {
			continue;
		}
		output[key] = stripInlineMusicAudio(item, audioBase64);
	}
	return output;
}

export const __nonTextTestUtils = {
	persistMusicResponse,
	stripInlineMusicAudio,
};

export async function runNonTextPipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		if (!isNonTextEndpoint(endpoint)) {
			throw new Error(`non_text_pipeline_not_supported_for_${endpoint}`);
		}

		timing.timer.mark("ir_decode");
		const ir = decodeNonTextRequest(endpoint, pre.ctx.body);
		(ir as any).rawRequest = pre.ctx.rawBody;
		timing.timer.end("ir_decode");

		timing.timer.mark("execute_start");
		const exec = await doRequestWithIR(pre.ctx, ir, timing);

		if (exec instanceof Response) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: exec,
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}

		timing.timer.mark("ir_encode");
		if (exec.result.kind === "completed" && exec.result.ir) {
			exec.result.normalized = encodeNonTextResponse(
				endpoint,
				exec.result.ir as NonTextIRResponse,
				pre.ctx.requestId,
			);
			if (endpoint === "music.generate") {
				try {
					await persistMusicResponse(
						pre.ctx.workspaceId,
						pre.ctx.requestId,
						ir as IRMusicGenerateRequest,
						exec.result.ir as IRMusicGenerateResponse,
					);
				} catch (error) {
					console.error("music_job_meta_store_failed", {
						error,
						workspaceId: pre.ctx.workspaceId,
						musicId: pre.ctx.requestId,
						provider: exec.result.provider,
					});
				}
			}
		}
		timing.timer.end("ir_encode");

		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		pre.ctx.timer = timing.timer;

		return finalizeRequest({
			pre,
			exec: { ok: true, result: exec.result },
			endpoint,
			timingHeader: header || undefined,
		});
	} catch (err) {
		logPipelineExecutionError("non-text", err);
		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		return await handleError({
			stage: "execute",
			res: buildPipelineExecutionErrorResponse(err, pre.ctx),
			endpoint,
			ctx: pre.ctx,
			timingHeader: header || undefined,
			auditFailure,
			req,
		});
	}
}
