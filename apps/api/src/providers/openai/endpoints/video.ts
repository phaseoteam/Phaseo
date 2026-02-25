// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { VideoGenerationSchema, type VideoGenerationRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";

function pickDefined<T extends Record<string, any>>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
    ) as Partial<T>;
}


export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(VideoGenerationSchema, args.body, []).adapterPayload as VideoGenerationRequest;
    const body: VideoGenerationRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const googleConfig = body.config?.google ?? {};

    const seconds = body.seconds
        ?? body.duration_seconds
        ?? body.duration
        ?? googleConfig.duration_seconds
        ?? googleConfig.durationSeconds;
    const size = body.size;
    const resolution = body.resolution ?? googleConfig.resolution;
    const compressionQuality = body.compression_quality
        ?? googleConfig.compression_quality
        ?? googleConfig.compressionQuality;
    const negativePrompt = body.negative_prompt
        ?? googleConfig.negative_prompt
        ?? googleConfig.negativePrompt;
    const sampleCount = body.sample_count
        ?? googleConfig.sample_count
        ?? googleConfig.sampleCount;
    const numberOfVideos = body.number_of_videos
        ?? googleConfig.number_of_videos
        ?? googleConfig.numberOfVideos;
    const personGeneration = body.person_generation
        ?? googleConfig.person_generation
        ?? googleConfig.personGeneration;
    const generateAudio = body.generate_audio
        ?? googleConfig.generate_audio
        ?? googleConfig.generateAudio;
    const enhancePrompt = body.enhance_prompt
        ?? googleConfig.enhance_prompt
        ?? googleConfig.enhancePrompt;
    const outputStorageUri = body.output_storage_uri
        ?? googleConfig.output_storage_uri
        ?? googleConfig.outputStorageUri;
    const aspectRatio = body.aspect_ratio
        ?? googleConfig.aspect_ratio
        ?? googleConfig.aspectRatio;

    const isOpenAIProvider = args.providerId === "openai";
    const sendAsMultipart = isOpenAIProvider && Boolean(body.input_reference);
    const headers = openAICompatHeaders(args.providerId, keyInfo.key);
    let requestBody: BodyInit;

    if (sendAsMultipart) {
        const form = new FormData();
        form.append("model", body.model);
        form.append("prompt", body.prompt);
        if (seconds != null) form.append("seconds", String(seconds));
        if (size) form.append("size", size);

        const ref = body.input_reference ?? "";
        let fileBlob: Blob | null = null;
        let filename = "reference";
        let mimeType = body.input_reference_mime_type ?? "application/octet-stream";

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
                quality: body.quality,
                input_reference: body.input_reference,
                input_reference_mime_type: body.input_reference_mime_type,
                input: body.input,
                input_image: body.input_image,
                input_video: body.input_video,
                last_frame: body.last_frame ?? body.input_last_frame,
                reference_images: body.reference_images,
                duration: body.duration,
                duration_seconds: body.duration_seconds,
                ratio: body.ratio,
                aspect_ratio: aspectRatio,
                resolution: resolution,
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

