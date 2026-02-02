// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as compatChat from "./endpoints/chat";
import * as responses from "../openai/endpoints/responses";
import * as moderations from "../openai/endpoints/moderations";
import * as embeddings from "../openai/endpoints/embeddings";
import * as images from "../openai/endpoints/images";
import * as imagesEdits from "../openai/endpoints/images-edits";
import * as audioSpeech from "../openai/endpoints/audio-speech";
import * as audioTranscription from "../openai/endpoints/audio-transcription";
import * as audioTranslation from "../openai/endpoints/audio-translation";
import * as video from "../openai/endpoints/video";
import * as batch from "../openai/endpoints/batch";
import { supportsOpenAICompatResponses } from "./config";

export function createOpenAICompatibleAdapter(providerId: string): ProviderAdapter {
    return {
        name: providerId,
        async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
            switch (args.endpoint) {
                case "chat.completions":
                    return compatChat.exec(args);
                case "responses":
                    if (!supportsOpenAICompatResponses(providerId, args.providerModelSlug ?? args.model)) {
                        throw new Error(`${providerId}_responses_not_supported`);
                    }
                    return responses.exec(args);
                case "moderations":
                    return moderations.exec(args);
                case "embeddings":
                    return embeddings.exec(args);
                case "images.generations":
                    return images.exec(args);
                case "images.edits":
                    return imagesEdits.exec(args);
                case "audio.speech":
                    return audioSpeech.exec(args);
                case "audio.transcription":
                    return audioTranscription.exec(args);
                case "audio.translations":
                    return audioTranslation.exec(args);
                case "video.generation":
                    return video.exec(args);
                case "batch":
                    return batch.exec(args);
                default:
                    throw new Error(`${providerId}: unsupported endpoint ${args.endpoint}`);
            }
        },
    };
}

