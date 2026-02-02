// src/lib/providers/google-ai-studio/index.ts
// Purpose: Provider adapter module for google-ai-studio.
// Why: Isolates provider-specific configuration and utilities.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as embeddings from "./endpoints/embeddings";
import * as images from "./endpoints/images";
import * as video from "./endpoints/video";
import * as responses from "./endpoints/responses";

export const GoogleAIStudioAdapter: ProviderAdapter = {
    name: "google-ai-studio",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions":
                return chat.exec(args);
            case "responses":
                return responses.exec(args);
            case "embeddings":
                return embeddings.exec(args);
            case "images.generations":
                return images.exec(args);
            case "video.generation":
                return video.exec(args);
            default:
                throw new Error(`google-ai-studio: unsupported endpoint ${args.endpoint}`);
        }
    },
};









