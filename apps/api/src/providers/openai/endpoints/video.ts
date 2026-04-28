// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { VideoGenerationSchema, type VideoGenerationRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function pickDefined<T extends Record<string, any>>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
    ) as Partial<T>;
}

function extractInputReferenceString(value: unknown): string {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object" || Array.isArray(value)) return "";
	const source = value as Record<string, unknown>;
	const candidate =
		(source.image_url && typeof source.image_url === "object" ? (source.image_url as Record<string, unknown>).url : undefined) ??
		source.url;
	return typeof candidate === "string" ? candidate : "";
}


export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(VideoGenerationSchema, args.body, []).adapterPayload as VideoGenerationRequest;
    const body: VideoGenerationRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };
	const legacyBody = body as Record<string, any>;
    const providerParams =
        body.provider_params && typeof body.provider_params === "object"
            ? body.provider_params
            : {};

	const seconds = body.duration
		?? providerParams.duration
		?? providerParams.duration_seconds
		?? providerParams.durationSeconds;
	const size = body.size ?? body.resolution ?? providerParams.size ?? providerParams.resolution;
    const compressionQuality = body.compression_quality ?? providerParams.compression_quality ?? providerParams.compressionQuality;
    const negativePrompt = body.negative_prompt ?? providerParams.negative_prompt ?? providerParams.negativePrompt;
    const sampleCount = body.sample_count ?? providerParams.sample_count ?? providerParams.sampleCount;
    const numberOfVideos = legacyBody.number_of_videos ?? providerParams.number_of_videos ?? providerParams.numberOfVideos;
    const personGeneration = body.person_generation ?? providerParams.person_generation ?? providerParams.personGeneration;
    const generateAudio = body.generate_audio ?? providerParams.generate_audio ?? providerParams.generateAudio;
    const enhancePrompt = body.enhance_prompt ?? providerParams.enhance_prompt ?? providerParams.enhancePrompt;
    const outputStorageUri = legacyBody.output_storage_uri ?? providerParams.output_storage_uri ?? providerParams.outputStorageUri;
    const aspectRatio = body.aspect_ratio ?? legacyBody.ratio ?? providerParams.aspect_ratio ?? providerParams.aspectRatio;

    const isOpenAIProvider = args.providerId === "openai";
	const inputReferenceValue = extractInputReferenceString(
        Array.isArray(body.input_references)
			? body.input_references.find((item) => item.role === "first_frame") ?? body.input_references[0]
			: undefined,
    );
    const sendAsMultipart = isOpenAIProvider && inputReferenceValue.length > 0;
    const headers = openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta));
    let requestBody: BodyInit;

    if (sendAsMultipart) {
		const form = new FormData();
            form.append("model", body.model);
            form.append("prompt", body.prompt);
            if (seconds != null) form.append("seconds", String(seconds));
		if (size) form.append("size", size);

        const ref = inputReferenceValue;
        let fileBlob: Blob | null = null;
        let filename = "reference";
        let mimeType = legacyBody.input_reference_mime_type ?? "application/octet-stream";

        const dataUrlMatch = ref.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1] ?? mimeType;
            const bytes = Uint8Array.from(atob(dataUrlMatch[2]), (c) => c.charCodeAt(0));
            fileBlob = new Blob([bytes], { type: mimeType });
        } else if (ref.startsWith("http://") || ref.startsWith("https://")) {
            const fetched = await fetch(ref);
            if (!fetched.ok) {
                return {
                    kind: "completed",
                    upstream: fetched,
                    bill: { cost_cents: 0, currency: "USD" },
                };
            }
            fileBlob = await fetched.blob();
            mimeType = fileBlob.type || mimeType;
            const urlParts = ref.split("/");
            filename = urlParts[urlParts.length - 1] || filename;
        } else if (ref.length) {
            const bytes = Uint8Array.from(atob(ref), (c) => c.charCodeAt(0));
            fileBlob = new Blob([bytes], { type: mimeType });
        }

        if (fileBlob) {
            form.append("input_reference", fileBlob, filename);
        }
        requestBody = form;
        // Let fetch set the multipart boundary
        delete (headers as any)["Content-Type"];
    } else {
        requestBody = JSON.stringify({
			model: body.model,
			prompt: body.prompt,
			...(seconds != null ? { seconds } : {}),
			...(size ? { size } : {}),
			...pickDefined({
                quality: legacyBody.quality,
                input_reference: inputReferenceValue || undefined,
                aspect_ratio: aspectRatio,
				resolution: size,
                compression_quality: compressionQuality,
                negative_prompt: negativePrompt,
                sample_count: sampleCount,
                number_of_videos: numberOfVideos,
                seed: body.seed,
                person_generation: personGeneration,
                generate_audio: generateAudio,
                enhance_prompt: enhancePrompt,
                output_storage_uri: outputStorageUri,
            }),
        });
    }

    const res = await fetch(openAICompatUrl(args.providerId, "/videos"), {
        method: "POST",
        headers,
        body: requestBody,
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const normalized = await res.clone().json().catch(() => undefined);

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

