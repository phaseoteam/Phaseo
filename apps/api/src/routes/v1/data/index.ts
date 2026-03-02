// src/routes/v1/data/index.ts
// Purpose: Inference API route handler for model execution requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { chatCompletionsRoutes } from "./chat-completions";
import { messagesRoutes } from "./messages";
import { responsesRoutes } from "./responses";
import { responsesWsRoutes } from "./responses-ws";
import { embeddingsRoutes } from "./embeddings";
import { moderationsRoutes } from "./moderations";
import { audioSpeechRoutes } from "./audio-speech";
import { audioTranscriptionRoutes } from "./audio-transcription";
import { audioTranslationRoutes } from "./audio-translation";
import { imagesGenerationsRoutes } from "./images-generations";
import { imagesEditsRoutes } from "./images-edits";
import { videosRoutes } from "./videos";
import { ocrRoutes } from "./ocr";
import { musicGenerateRoutes } from "./music-generate";
import { batchRoutes } from "./batches";
import { filesRoutes } from "./files";
import { realtimeRoutes } from "./realtime";

export const inferenceRouter = new Hono<Env>();

inferenceRouter.route("/chat/completions", chatCompletionsRoutes);
inferenceRouter.route("/messages", messagesRoutes);
inferenceRouter.route("/responses", responsesRoutes);
inferenceRouter.route("/responses/ws", responsesWsRoutes);
inferenceRouter.route("/embeddings", embeddingsRoutes);
inferenceRouter.route("/moderations", moderationsRoutes);
inferenceRouter.route("/audio/speech", audioSpeechRoutes);
inferenceRouter.route("/audio/transcriptions", audioTranscriptionRoutes);
inferenceRouter.route("/audio/translations", audioTranslationRoutes);
inferenceRouter.route("/images/generations", imagesGenerationsRoutes);
inferenceRouter.route("/images/edits", imagesEditsRoutes);
inferenceRouter.route("/videos", videosRoutes);
inferenceRouter.route("/video/generations", videosRoutes);
inferenceRouter.route("/ocr", ocrRoutes);
inferenceRouter.route("/music/generate", musicGenerateRoutes);
inferenceRouter.route("/music/generations", musicGenerateRoutes);
inferenceRouter.route("/batch", batchRoutes);
inferenceRouter.route("/batches", batchRoutes);
inferenceRouter.route("/files", filesRoutes);
inferenceRouter.route("/realtime", realtimeRoutes);
inferenceRouter.route("/audio/realtime", realtimeRoutes);

// Backward-compatible alias for existing imports.
export const dataRouter = inferenceRouter;








