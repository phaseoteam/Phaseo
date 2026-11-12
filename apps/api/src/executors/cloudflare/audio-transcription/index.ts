import type { IRAudioTranscriptionRequest, IRAudioTranscriptionResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchPublicMedia } from "@core/public-media-fetch";
import { mediaInputErrorResult } from "@executors/_shared/media/remote-media";
import { estimateOpenAiSpeechToTextUsage } from "@providers/openai/endpoints/audio-transcription-usage";
import { blobToBase64, runCloudflareModel, unwrapCloudflareResult } from "../shared";

// Matches the default transcription upload limit in core/schemas.ts.
const MAX_REMOTE_AUDIO_BYTES = 25 * 1024 * 1024;
const REMOTE_AUDIO_TIMEOUT_MS = 30_000;

async function resolveAudio(ir: IRAudioTranscriptionRequest, args: ExecutorExecuteArgs): Promise<Blob> {
	if (ir.file) return ir.file;
	const url = ir.fileUrl || ir.s3PresignedUrl;
	if (!url) throw new Error("cloudflare_audio_file_required");
	const media = await fetchPublicMedia({
		url,
		maxBytes: MAX_REMOTE_AUDIO_BYTES,
		timeoutMs: REMOTE_AUDIO_TIMEOUT_MS,
		allowHttp: false,
		upstreamTiming: args.upstreamTiming,
	});
	return new Blob([media.bytes as Uint8Array<ArrayBuffer>], { type: media.contentType ?? "" });
}

// A file_url that cannot be downloaded is the caller's error, so it returns a
// 400 like other media URL failures. Other errors are rethrown.
function remoteAudioError(args: ExecutorExecuteArgs, error: unknown): ExecutorResult | null {
	const code = error instanceof Error ? error.message : "";
	const name = error instanceof Error ? error.name : "";
	if (code.startsWith("remote_media_url_rejected") || code === "remote_media_redirect_rejected") {
		return mediaInputErrorResult("invalid_file_url", "Audio URLs and redirect targets must use public HTTPS addresses.", args.requestId);
	}
	if (code === "remote_media_too_large" || code === "remote_media_invalid_content_length") {
		return mediaInputErrorResult("file_too_large", "Audio at file_url must be at most 25 MB.", args.requestId);
	}
	if (code.startsWith("remote_media_fetch_failed") || name === "AbortError" || name === "TimeoutError") {
		return mediaInputErrorResult(
			"invalid_file_url",
			"Unable to retrieve audio from file_url. Check that the server is available and responds within 30 seconds.",
			args.requestId,
		);
	}
	return null;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRAudioTranscriptionRequest;
	let audio: Blob;
	try {
		audio = await resolveAudio(ir, args);
	} catch (error) {
		const failure = remoteAudioError(args, error);
		if (failure) return failure;
		throw error;
	}
	const isTurbo = args.providerModelSlug === "@cf/openai/whisper-large-v3-turbo";
	const requestBody = isTurbo ? JSON.stringify({
		audio: await blobToBase64(audio),
		...(ir.language ? { language: ir.language } : {}),
		...(ir.prompt ? { initial_prompt: ir.prompt } : {}),
	}) : audio;
	const { response, keySource, byokKeyId } = await runCloudflareModel(
		args,
		requestBody,
		isTurbo ? "application/json" : audio.type || "application/octet-stream",
	);
	const rawResponse = await response.clone().json().catch(() => null);
	const result = unwrapCloudflareResult(rawResponse);
	const estimatedUsage = response.ok ? await estimateOpenAiSpeechToTextUsage({ file: audio, prompt: ir.prompt, text: result?.text }) : undefined;
	const usage = estimatedUsage ? {
		...estimatedUsage,
		...(typeof estimatedUsage.input_audio_seconds === "number"
			? { input_audio_minutes: estimatedUsage.input_audio_seconds / 60 }
			: {}),
	} : { requests: 1 };
	const detectedLanguage = result?.transcription_info?.language ?? result?.language;
	const responseIr: IRAudioTranscriptionResponse | undefined = response.ok ? {
		id: args.requestId,
		model: args.providerModelSlug || ir.model,
		provider: args.providerId,
		text: String(result?.text ?? ""),
		language: typeof detectedLanguage === "string" ? detectedLanguage : ir.language,
		words: Array.isArray(result?.words) ? result.words : undefined,
		segments: Array.isArray(result?.segments) ? result.segments : undefined,
		usage: usage as any,
		rawResponse,
	} : undefined;
	return {
		kind: "completed",
		upstream: response,
		ir: responseIr,
		bill: { cost_cents: 0, currency: "USD", usage, upstream_id: response.headers.get("cf-ray"), finish_reason: null },
		keySource,
		byokKeyId,
		rawResponse,
	};
}

export const executor: ProviderExecutor = execute;
