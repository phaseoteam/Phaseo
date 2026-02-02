// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// ElevenLabs Provider Adapter
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as musicGenerate from "./endpoints/music-generate";

/**
 * ElevenLabs Provider
 * Supports music and sound generation
 * Docs: https://elevenlabs.io/docs/api-reference/introduction
 */
export const ElevenLabsAdapter: ProviderAdapter = {
    name: "elevenlabs",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "music.generate":
                return musicGenerate.exec(args);

            default:
                throw new Error(`ElevenLabs: unsupported endpoint ${args.endpoint}`);
        }
    },
};

