// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { z } from "zod";
import {
    ChatCompletionsSchema,
    ResponsesSchema,
    ModerationsSchema,
    EmbeddingsSchema,
    ImagesGenerationSchema,
    ImagesEditSchema,
    AudioSpeechSchema,
    AudioTranscriptionSchema,
    AudioTranslationSchema,
    VideoGenerationSchema,
    BatchSchema,
} from "@core/schemas";
import type {
    GatewayCompletionsResponse,
    GatewayResponsePayload,
    GatewayUsage,
} from "@core/types";

// Canonical request types, aligned to the OpenAI specification with gateway-only flags.
export type CanonicalChatCompletionsRequest = z.infer<typeof ChatCompletionsSchema>;
export type CanonicalResponsesRequest = z.infer<typeof ResponsesSchema>;
export type CanonicalModerationsRequest = z.infer<typeof ModerationsSchema>;
export type CanonicalEmbeddingsRequest = z.infer<typeof EmbeddingsSchema>;
export type CanonicalImagesGenerationsRequest = z.infer<typeof ImagesGenerationSchema>;
export type CanonicalImagesEditRequest = z.infer<typeof ImagesEditSchema>;
export type CanonicalAudioSpeechRequest = z.infer<typeof AudioSpeechSchema>;
export type CanonicalAudioTranscriptionRequest = z.infer<typeof AudioTranscriptionSchema>;
export type CanonicalAudioTranslationRequest = z.infer<typeof AudioTranslationSchema>;
export type CanonicalVideoGenerationRequest = z.infer<typeof VideoGenerationSchema>;
export type CanonicalBatchRequest = z.infer<typeof BatchSchema>;

// Canonical response shapes (OpenAI aligned + gateway enrichments)
export type CanonicalChatCompletionsResponse = GatewayCompletionsResponse & {
    usage?: GatewayUsage;
    meta?: Record<string, unknown>;
};

export type CanonicalResponsesResponse = GatewayResponsePayload & {
    usage?: GatewayUsage;
    meta?: Record<string, unknown>;
};

// Utility: prune gateway-only fields before hitting upstream providers.
export function pruneGatewayFields<T extends Record<string, any>, K extends readonly (keyof T)[]>(
    canonical: T,
    omitKeys: K
): Omit<T, K[number]> {
    const clone: any = { ...canonical };
    for (const key of omitKeys) {
        delete clone[key as string];
    }
    return clone;
}

