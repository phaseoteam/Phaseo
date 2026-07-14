// src/routes/v1/data/index.ts
// Purpose: Inference API route handler for model execution requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { chatCompletionsRoutes } from "./chat-completions";
import { messagesRoutes } from "./messages";
import { responsesRoutes } from "./responses";
import { embeddingsRoutes } from "./embeddings";
import { moderationsRoutes } from "./moderations";
import { rerankRoutes } from "./rerank";
import { audioSpeechRoutes } from "./audio-speech";
import { audioTranscriptionRoutes } from "./audio-transcription";
import { audioTranslationRoutes } from "./audio-translation";
import { imagesGenerationsRoutes } from "./images-generations";
import { imagesEditsRoutes } from "./images-edits";
import { batchRoutes } from "./batches";
import { filesRoutes } from "./files";
import {
    disabledMusicRoutes,
    disabledVideosRoutes,
} from "./feature-disabled";
import { ocrRoutes } from "./ocr";
import { asyncJobsRoutes } from "./async-jobs";

export const inferenceRouter = new Hono<Env>();

inferenceRouter.route("/chat/completions", chatCompletionsRoutes);
inferenceRouter.route("/messages", messagesRoutes);
inferenceRouter.route("/responses", responsesRoutes);
inferenceRouter.route("/embeddings", embeddingsRoutes);
inferenceRouter.route("/moderations", moderationsRoutes);
inferenceRouter.route("/rerank", rerankRoutes);
inferenceRouter.route("/audio/speech", audioSpeechRoutes);
inferenceRouter.route("/audio/transcriptions", audioTranscriptionRoutes);
inferenceRouter.route("/audio/translations", audioTranslationRoutes);
inferenceRouter.route("/images/generations", imagesGenerationsRoutes);
inferenceRouter.route("/images/edits", imagesEditsRoutes);
inferenceRouter.route("/videos", disabledVideosRoutes);
inferenceRouter.route("/video/generations", disabledVideosRoutes);
inferenceRouter.route("/ocr", ocrRoutes);
inferenceRouter.route("/music/generate", disabledMusicRoutes);
inferenceRouter.route("/music/generations", disabledMusicRoutes);
inferenceRouter.route("/batch", batchRoutes);
inferenceRouter.route("/batches", batchRoutes);
inferenceRouter.route("/files", filesRoutes);
inferenceRouter.route("/async", asyncJobsRoutes);

// Backward-compatible alias for existing imports.
export const dataRouter = inferenceRouter;








