// src/lib/gateway/providers/openai/index.ts
// Purpose: Provider adapter module for openai.
// Why: Isolates provider-specific configuration and utilities.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as moderations from "./endpoints/moderations";
import * as embeddings from "./endpoints/embeddings";
import * as images from "./endpoints/images";
import * as responses from "./endpoints/responses";
import * as audioSpeech from "./endpoints/audio-speech";
import * as audioTranscription from "./endpoints/audio-transcription";
import * as audioTranslation from "./endpoints/audio-translation";
import * as imagesEdits from "./endpoints/images-edits";
import * as video from "./endpoints/video";

export const OpenAIAdapter: ProviderAdapter = {
    name: "openai",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions": return chat.exec(args);        // non-stream for now
            case "responses": return responses.exec(args);
            case "moderations": return moderations.exec(args);
            case "embeddings": return embeddings.exec(args);
            case "images.generations": return images.exec(args);
            case "images.edits": return imagesEdits.exec(args);
            case "audio.speech": return audioSpeech.exec(args);
            case "audio.transcription": return audioTranscription.exec(args);
            case "audio.translations": return audioTranslation.exec(args);
            case "video.generation": return video.exec(args);

            // Other endpoints to be implemented

            default: throw new Error(`OpenAI: unsupported endpoint ${args.endpoint}`);
        }
    },
};









