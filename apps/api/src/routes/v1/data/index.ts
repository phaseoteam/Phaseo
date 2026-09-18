// src/routes/v1/data/index.ts
// Purpose: Inference API route handler for model execution requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { chatCompletionsRoutes } from "./chat-completions";
import { messagesRoutes } from "./messages";
import { responsesRoutes } from "./responses";
import { lazyRouter } from "@/routes/lazy";

export const inferenceRouter = new Hono<Env>();

inferenceRouter.route("/chat/completions", chatCompletionsRoutes);
inferenceRouter.route("/messages", messagesRoutes);
inferenceRouter.route("/responses", responsesRoutes);
// Keep text route initialization small; initialize other surfaces on first use.
function mount(path: string, load: () => Promise<Hono<Env>>) {
    const handler = lazyRouter(null, load);
    inferenceRouter.all(path, handler);
    inferenceRouter.all(`${path}/*`, handler);
}
mount("/embeddings", () => import("./embeddings").then(m => m.embeddingsRoutes));
mount("/moderations", () => import("./moderations").then(m => m.moderationsRoutes));
mount("/rerank", () => import("./rerank").then(m => m.rerankRoutes));
mount("/decisions", () => import("./systemone").then(m => m.systemOneRoutes));
mount("/audio/speech", () => import("./audio-speech").then(m => m.audioSpeechRoutes));
mount("/audio/transcriptions", () => import("./audio-transcription").then(m => m.audioTranscriptionRoutes));
mount("/audio/translations", () => import("./audio-translation").then(m => m.audioTranslationRoutes));
mount("/audio/realtime/sessions", () => import("./realtime-sessions").then(m => m.realtimeSessionsRoutes));
mount("/realtime/sessions", () => import("./realtime-sessions").then(m => m.realtimeSessionsRoutes));
mount("/live/sessions", () => import("./realtime-sessions").then(m => m.liveSessionsRoutes));
mount("/images/generations", () => import("./images-generations").then(m => m.imagesGenerationsRoutes));
mount("/images/edits", () => import("./images-edits").then(m => m.imagesEditsRoutes));
mount("/videos", () => import("./videos").then(m => m.videosRoutes));
mount("/video/generations", () => import("./videos").then(m => m.videosRoutes));
mount("/ocr", () => import("./ocr").then(m => m.ocrRoutes));
mount("/parse", () => import("./parse").then(m => m.parseRoutes));
mount("/music/generate", () => import("./music-generate").then(m => m.musicGenerateRoutes));
mount("/music/generations", () => import("./music-generate").then(m => m.musicGenerateRoutes));
mount("/batch", () => import("./batches").then(m => m.batchRoutes));
mount("/batches", () => import("./batches").then(m => m.batchRoutes));
mount("/files", () => import("./files").then(m => m.filesRoutes));
mount("/async", () => import("./async-jobs").then(m => m.asyncJobsRoutes));

// Backward-compatible alias for existing imports.
export const dataRouter = inferenceRouter;

