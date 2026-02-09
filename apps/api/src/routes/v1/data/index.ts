// src/routes/v1/data/index.ts
// Purpose: Data-plane route handler for index requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { chatCompletionsRoutes } from "./chat-completions";
import { messagesRoutes } from "./messages";
import { responsesRoutes } from "./responses";
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

export const dataRouter = new Hono<Env>();

dataRouter.route("/chat/completions", chatCompletionsRoutes);
dataRouter.route("/messages", messagesRoutes);
dataRouter.route("/responses", responsesRoutes);
dataRouter.route("/embeddings", embeddingsRoutes);
dataRouter.route("/moderations", moderationsRoutes);
dataRouter.route("/audio/speech", audioSpeechRoutes);
dataRouter.route("/audio/transcriptions", audioTranscriptionRoutes);
dataRouter.route("/audio/translations", audioTranslationRoutes);
dataRouter.route("/images/generations", imagesGenerationsRoutes);
dataRouter.route("/images/edits", imagesEditsRoutes);
dataRouter.route("/videos", videosRoutes);
dataRouter.route("/video/generations", videosRoutes);
dataRouter.route("/ocr", ocrRoutes);
dataRouter.route("/music/generate", musicGenerateRoutes);
dataRouter.route("/music/generations", musicGenerateRoutes);
dataRouter.route("/batch", batchRoutes);
dataRouter.route("/batches", batchRoutes);
dataRouter.route("/files", filesRoutes);








