import type { Hono } from "hono";
import type { GatewayBindings } from "@/runtime/env";
import { makeEndpointHandler } from "@/lib/gateway/pipeline";
import { makeTextEndpointHandler } from "@/core/pipeline";
import { EmbeddingsSchema, ModerationsSchema, AudioSpeechSchema, AudioTranscriptionSchema, AudioTranslationSchema, ImagesGenerationSchema, ImagesEditSchema, VideoGenerationSchema } from "@gateway/schemas";
import { withRuntime } from "./utils";

const chatHandler = makeTextEndpointHandler({ protocol: "openai.chat" });
const responsesHandler = makeTextEndpointHandler({ protocol: "openai.responses" });
const anthropicMessagesHandler = makeTextEndpointHandler({ protocol: "anthropic.messages" });
const embeddingsHandler = makeEndpointHandler({ endpoint: "embeddings", schema: EmbeddingsSchema });
const moderationHandler = makeEndpointHandler({ endpoint: "moderations", schema: ModerationsSchema });
const audioSpeechHandler = makeEndpointHandler({ endpoint: "audio.speech", schema: AudioSpeechSchema });
const audioTranscriptionHandler = makeEndpointHandler({ endpoint: "audio.transcription", schema: AudioTranscriptionSchema });
const audioTranslationHandler = makeEndpointHandler({ endpoint: "audio.translations", schema: AudioTranslationSchema });
const imagesGenerationHandler = makeEndpointHandler({ endpoint: "images.generations", schema: ImagesGenerationSchema });
const imagesEditHandler = makeEndpointHandler({ endpoint: "images.edits", schema: ImagesEditSchema });
const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export function registerMainEndpoints(app: Hono<{ Bindings: GatewayBindings }>) {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers":
            "Authorization,Content-Type,x-title,http-referer,x-gateway-debug,X-AIStats-Strictness",
        "Access-Control-Max-Age": "86400",
    };

    const withCors =
        (handler: Parameters<typeof withRuntime>[0]) =>
            async (c: Parameters<ReturnType<typeof withRuntime>>[0]) => {
                if (c.req.method === "OPTIONS") {
                    return new Response(null, { status: 204, headers: corsHeaders });
                }
                const response = await withRuntime(handler)(c);
                const headers = new Headers(response.headers);
                for (const [key, value] of Object.entries(corsHeaders)) {
                    headers.set(key, value);
                }
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            };

    app.options("/v1/*", (c) => c.body(null, 204, corsHeaders));
    app.post("/v1/chat/completions", withCors(chatHandler));
    app.post("/v1/responses", withCors(responsesHandler));
    app.post("/v1/messages", withCors(anthropicMessagesHandler));
    app.post("/v1/embeddings", withCors(embeddingsHandler));
    app.post("/v1/moderations", withCors(moderationHandler));
    app.post("/v1/audio/speech", withCors(audioSpeechHandler));
    app.post("/v1/audio/transcriptions", withCors(audioTranscriptionHandler));
    app.post("/v1/audio/translations", withCors(audioTranslationHandler));
    app.post("/v1/images/generations", withCors(imagesGenerationHandler));
    app.post("/v1/images/edits", withCors(imagesEditHandler));
    app.post("/v1/videos", withCors(videoHandler));
}
