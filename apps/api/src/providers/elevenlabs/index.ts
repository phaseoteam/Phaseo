// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// ElevenLabs Provider Adapter
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as musicGenerate from "./endpoints/music-generate";
import * as audioSpeech from "./endpoints/audio-speech";
import * as audioTranscription from "./endpoints/audio-transcription";

/**
 * ElevenLabs Provider
 * Supports music and sound generation
 * Docs: https://elevenlabs.io/docs/api-reference/introduction
 */
export const ElevenLabsAdapter: ProviderAdapter = {
    name: "elevenlabs",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "audio.speech":
                return audioSpeech.exec(args);

            case "audio.transcription":
                return audioTranscription.exec(args);

            case "music.generate":
                return musicGenerate.exec(args);

            default:
                throw new Error(`ElevenLabs: unsupported endpoint ${args.endpoint}`);
        }
    },
};

