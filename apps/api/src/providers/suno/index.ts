// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// Suno Provider Adapter (Placeholder)
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as musicGenerate from "./endpoints/music-generate";

/**
 * Suno Provider (Unofficial)
 *
 * NOTE: Suno does not provide an official API. This adapter supports
 * third-party API wrappers that follow a common API format.
 *
 * Configure via environment variables:
 * - SUNO_API_KEY: Your API key from the third-party service
 * - SUNO_BASE_URL: Base URL of the third-party API (optional)
 *
 * Popular third-party services:
 * - https://sunoapi.org
 * - https://github.com/gcui-art/suno-api
 */
export const SunoAdapter: ProviderAdapter = {
    name: "suno",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "music.generate":
                return musicGenerate.exec(args);

            default:
                throw new Error(`Suno: unsupported endpoint ${args.endpoint}`);
        }
    },
};

