import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
	for (const value of values) {
		if (value !== undefined) return value;
	}
	return undefined;
}

type NormalizedVideoInputReference = {
	type: "image";
	role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
	referenceType?: string;
	url?: string;
	raw: Record<string, any>;
};

function normalizeVideoInputReference(entry: unknown, index: number): NormalizedVideoInputReference | null {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
	const raw = entry as Record<string, any>;
	const rawType = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
	if (rawType !== "image_url") return null;
	const roleRaw = typeof raw.role === "string" ? raw.role.trim().toLowerCase() : "";
	const role =
		roleRaw === "first_frame" ||
		roleRaw === "last_frame" ||
		roleRaw === "reference" ||
		roleRaw === "source" ||
		roleRaw === "mask"
			? (roleRaw as NormalizedVideoInputReference["role"])
			: undefined;
	const url =
		typeof raw.image_url?.url === "string" && raw.image_url.url.trim().length > 0
			? raw.image_url.url.trim()
			: undefined;
	const referenceType =
		typeof raw.reference_type === "string" && raw.reference_type.trim().length > 0
			? raw.reference_type.trim()
			: undefined;
	if (!url) return null;
	return {
		type: "image",
		role: role ?? (rawType === "image_url" ? (index === 0 ? "first_frame" : "reference") : undefined),
		referenceType,
		url,
		raw,
	};
}

function normalizeReferenceValue(reference: NormalizedVideoInputReference | undefined): string | Record<string, any> | undefined {
	if (!reference) return undefined;
	if (reference.url) return reference.url;
	return undefined;
}

export function decodeOpenAIVideoRequestToIR(body: any): IRVideoGenerationRequest {
	const rawInputReferences = Array.isArray(body?.input_references) ? body.input_references : [];
	const providerParams =
		body?.provider_params && typeof body.provider_params === "object" && !Array.isArray(body.provider_params)
			? { ...(body.provider_params as Record<string, any>) }
			: undefined;

	const inputReferences = rawInputReferences
		.map((item: unknown, index: number) => normalizeVideoInputReference(item, index))
		.filter((item): item is NormalizedVideoInputReference => Boolean(item));
	const firstFrame = inputReferences.find((item: any) => item?.role === "first_frame");
	const sourceVideo = inputReferences.find((item: any) => item?.role === "source" || item?.type === "video");
	const lastFrame = inputReferences.find((item: any) => item?.role === "last_frame");
	const referenceImages = inputReferences
		.filter((item: any) => item?.role === "reference")
		.map((item: any) => ({
			...(item?.reference_type || item?.referenceType
				? { referenceType: item.reference_type ?? item.referenceType }
				: {}),
			...(normalizeReferenceValue(item) ? { image: normalizeReferenceValue(item) } : {}),
		}))
		.filter((item: any) => Object.keys(item).length > 0);

	const canonicalSize = firstDefined(body?.size, body?.resolution);
	const sampleCountRaw = body?.sample_count;
	const durationSecondsRaw = body?.duration;
	const durationSeconds =
		typeof durationSecondsRaw === "number" && Number.isFinite(durationSecondsRaw)
			? durationSecondsRaw
			: undefined;

	return {
		model: body?.model,
		prompt: body?.prompt,
		inputReferences: inputReferences.map((item: any) => ({
			type: item.type,
			role: item.role,
			referenceType: item.referenceType,
			url: item.url,
			raw: item.raw ?? item,
		})),
		providerParams,
		outputAccess: body?.output?.access ?? "both",
		webhook: body?.webhook,
		seconds: durationSeconds,
		inputReference: normalizeReferenceValue(firstFrame),
		inputReferenceMimeType: firstFrame?.mime_type ?? firstFrame?.mimeType,
		input: {
			image: normalizeReferenceValue(firstFrame),
			video: normalizeReferenceValue(sourceVideo),
			lastFrame: normalizeReferenceValue(lastFrame),
			referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
		},
		inputImage: normalizeReferenceValue(firstFrame),
		inputVideo: normalizeReferenceValue(sourceVideo),
		lastFrame: normalizeReferenceValue(lastFrame),
		referenceImages,
		duration: durationSeconds,
		durationSeconds,
		aspectRatio: body?.aspect_ratio,
		size: canonicalSize,
		resolution: canonicalSize,
		compressionQuality: body?.compression_quality,
		negativePrompt: body?.negative_prompt,
		sampleCount: typeof sampleCountRaw === "number" ? sampleCountRaw : undefined,
		numberOfVideos: typeof sampleCountRaw === "number" ? sampleCountRaw : undefined,
		seed: body?.seed,
		personGeneration: body?.person_generation,
		generateAudio: body?.generate_audio,
		enhancePrompt: body?.enhance_prompt,
		resizeMode: body?.resize_mode,
		callbackUrl: body?.webhook?.url,
		outputStorageUri:
			typeof providerParams?.storageUri === "string"
				? providerParams.storageUri
				: typeof providerParams?.outputStorageUri === "string"
					? providerParams.outputStorageUri
					: undefined,
		rawRequest: body,
	};
}

export function encodeVideoIRToOpenAIResponse(
	ir: IRVideoGenerationResponse,
	requestId: string,
): Record<string, any> {
	const status =
		ir.status === "completed"
			? "completed"
			: ir.status === "failed"
				? "failed"
				: ir.status === "cancelled"
					? "cancelled"
					: ir.status === "in_progress"
						? "in_progress"
						: "pending";
	return {
		id: requestId,
		polling_url: `/v1/videos/${encodeURIComponent(requestId)}`,
		status,
	};
}
