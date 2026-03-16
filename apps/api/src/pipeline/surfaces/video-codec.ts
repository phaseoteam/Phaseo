import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
	for (const value of values) {
		if (value !== undefined) return value;
	}
	return undefined;
}

export function decodeOpenAIVideoRequestToIR(body: any): IRVideoGenerationRequest {
	const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input)
		? body.input
		: undefined;
	const googleConfig = body?.config?.google && typeof body.config.google === "object"
		? body.config.google
		: undefined;
	const canonicalSize = firstDefined(
		body?.size,
		body?.resolution,
		googleConfig?.size,
		googleConfig?.resolution,
	);
	const referenceImages = Array.isArray(body?.reference_images)
		? body.reference_images
		: Array.isArray(input?.reference_images)
			? input.reference_images
			: undefined;

	return {
		model: body?.model,
		prompt: body?.prompt,
		seconds: firstDefined(
			body?.seconds,
			body?.duration_seconds,
			body?.duration,
			googleConfig?.duration_seconds,
			googleConfig?.durationSeconds,
		),
		quality: body?.quality,
		inputReference: body?.input_reference,
		inputReferenceMimeType: body?.input_reference_mime_type,
		input: input
			? {
				image: input?.image,
				video: input?.video,
				lastFrame: input?.last_frame ?? input?.lastFrame,
				referenceImages,
			}
			: undefined,
		inputImage: body?.input_image ?? input?.image,
		inputVideo: body?.input_video ?? input?.video,
		lastFrame: body?.input_last_frame ?? body?.last_frame ?? input?.last_frame ?? input?.lastFrame,
		referenceImages,
		duration: body?.duration,
		durationSeconds: firstDefined(
			body?.duration_seconds,
			googleConfig?.duration_seconds,
			googleConfig?.durationSeconds,
		),
		ratio: body?.ratio,
		aspectRatio: firstDefined(
			body?.aspect_ratio,
			googleConfig?.aspect_ratio,
			googleConfig?.aspectRatio,
		),
		size: canonicalSize,
		resolution: canonicalSize,
		compressionQuality: firstDefined(
			body?.compression_quality,
			googleConfig?.compression_quality,
			googleConfig?.compressionQuality,
		),
		negativePrompt: firstDefined(
			body?.negative_prompt,
			googleConfig?.negative_prompt,
			googleConfig?.negativePrompt,
		),
		sampleCount: firstDefined(
			body?.sample_count,
			googleConfig?.sample_count,
			googleConfig?.sampleCount,
		),
		numberOfVideos: firstDefined(
			body?.number_of_videos,
			googleConfig?.number_of_videos,
			googleConfig?.numberOfVideos,
		),
		seed: firstDefined(body?.seed, googleConfig?.seed),
		personGeneration: firstDefined(
			body?.person_generation,
			googleConfig?.person_generation,
			googleConfig?.personGeneration,
		),
		generateAudio: firstDefined(
			body?.generate_audio,
			googleConfig?.generate_audio,
			googleConfig?.generateAudio,
		),
		enhancePrompt: firstDefined(
			body?.enhance_prompt,
			googleConfig?.enhance_prompt,
			googleConfig?.enhancePrompt,
		),
		outputStorageUri: firstDefined(
			body?.output_storage_uri,
			googleConfig?.output_storage_uri,
			googleConfig?.outputStorageUri,
		),
		rawRequest: body,
	};
}

export function encodeVideoIRToOpenAIResponse(
	ir: IRVideoGenerationResponse,
	requestId: string,
): Record<string, any> {
	const nativeId = ir.nativeId ?? null;
	const createdAt = Math.floor(Date.now() / 1000);
	const result = ir.result && typeof ir.result === "object" ? ir.result : undefined;
	const usage: any = ir.usage && typeof ir.usage === "object"
		? {
			input_tokens: ir.usage.inputTokens ?? 0,
			output_tokens: ir.usage.outputTokens ?? 0,
			total_tokens: ir.usage.totalTokens ?? ((ir.usage.inputTokens ?? 0) + (ir.usage.outputTokens ?? 0)),
			...(typeof (ir.usage as any).requests === "number" ? { requests: (ir.usage as any).requests } : {}),
			...(typeof (ir.usage as any).output_video_seconds === "number"
				? { output_video_seconds: (ir.usage as any).output_video_seconds }
				: {}),
			...(typeof (ir.usage as any).input_image_tokens === "number"
				? { input_image_tokens: (ir.usage as any).input_image_tokens }
				: {}),
			...(typeof (ir.usage as any).input_audio_tokens === "number"
				? { input_audio_tokens: (ir.usage as any).input_audio_tokens }
				: {}),
			...(typeof (ir.usage as any).input_video_tokens === "number"
				? { input_video_tokens: (ir.usage as any).input_video_tokens }
				: {}),
			...(typeof (ir.usage as any).output_image_tokens === "number"
				? { output_image_tokens: (ir.usage as any).output_image_tokens }
				: {}),
			...(typeof (ir.usage as any).output_audio_tokens === "number"
				? { output_audio_tokens: (ir.usage as any).output_audio_tokens }
				: {}),
			...(typeof (ir.usage as any).output_video_tokens === "number"
				? { output_video_tokens: (ir.usage as any).output_video_tokens }
				: {}),
		}
		: undefined;

	return {
		id: nativeId || ir.id || requestId,
		object: "video",
		status: ir.status || "queued",
		created_at: createdAt,
		model: ir.model,
		nativeResponseId: nativeId,
		provider: ir.provider,
		...(Array.isArray(ir.output) ? { output: ir.output } : {}),
		...(result ? { result } : {}),
		...(usage ? { usage } : {}),
	};
}
