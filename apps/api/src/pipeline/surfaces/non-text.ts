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
	IRUsage,
} from "@core/ir";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
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
	| "music.generate";

type NonTextIRRequest =
	| IRImageGenerationRequest
	| IRAudioSpeechRequest
	| IRAudioTranscriptionRequest
	| IRAudioTranslationRequest
	| IROcrRequest
	| IRMusicGenerateRequest;

type NonTextIRResponse =
	| IRImageGenerationResponse
	| IRAudioSpeechResponse
	| IRAudioTranscriptionResponse
	| IRAudioTranslationResponse
	| IROcrResponse
	| IRMusicGenerateResponse;

function isNonTextEndpoint(endpoint: Endpoint): endpoint is NonTextEndpoint {
	return endpoint === "images.generations" ||
		endpoint === "images.edits" ||
		endpoint === "audio.speech" ||
		endpoint === "audio.transcription" ||
		endpoint === "audio.translations" ||
		endpoint === "ocr" ||
		endpoint === "music.generate";
}

function decodeUsage(usage: IRUsage | undefined): Record<string, any> | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	const inputTokens = Number(
		(usage as any).inputTokens ??
		(usage as any).input_tokens ??
		(usage as any).input_text_tokens ??
		(usage as any).prompt_tokens ??
		0,
	);
	const outputTokens = Number(
		(usage as any).outputTokens ??
		(usage as any).output_tokens ??
		(usage as any).output_text_tokens ??
		(usage as any).completion_tokens ??
		0,
	);
	const totalTokens = Number(
		(usage as any).totalTokens ??
		(usage as any).total_tokens ??
		inputTokens + outputTokens,
	);

	const output: Record<string, any> = {
		input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
		output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
		total_tokens: Number.isFinite(totalTokens) ? totalTokens : inputTokens + outputTokens,
	};

	const passthroughNumericKeys = [
		"requests",
		"output_video_seconds",
		"input_image_tokens",
		"input_audio_tokens",
		"input_video_tokens",
		"output_image_tokens",
		"output_audio_tokens",
		"output_video_tokens",
		"embedding_tokens",
	];

	for (const key of passthroughNumericKeys) {
		const value = (usage as any)[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			output[key] = value;
		}
	}

	const pricing = (usage as any).pricing ?? (usage as any).pricing_breakdown;
	if (pricing && typeof pricing === "object") {
		output.pricing = pricing;
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
		case "audio.speech":
			return {
				model: body?.model,
				input: body?.input,
				voice: body?.voice,
				format: body?.format,
				responseFormat: body?.response_format ?? body?.format,
				streamFormat: body?.stream_format,
				speed: body?.speed,
				instructions: body?.instructions,
				vendor: {
					elevenlabs: body?.config?.elevenlabs,
				},
				userId: body?.user,
				rawRequest: body,
			};
		case "audio.transcription":
			return {
				model: body?.model,
				file: body?.file,
				language: body?.language,
				prompt: body?.prompt,
				temperature: body?.temperature,
				responseFormat: body?.response_format,
				timestampGranularities: Array.isArray(body?.timestamp_granularities)
					? body.timestamp_granularities
					: undefined,
				include: Array.isArray(body?.include) ? body.include : undefined,
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
				language: body?.language,
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

function encodeNonTextResponse(
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
				...(Array.isArray(transcription.segments) ? { segments: transcription.segments } : {}),
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
				...(usage ? { usage } : {}),
			};
		}

		case "music.generate": {
			const music = ir as IRMusicGenerateResponse;
			return {
				id: music.nativeId ?? music.id ?? requestId,
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
