// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// Mistral AI Provider Adapter
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as ocr from "./endpoints/ocr";

/**
 * Mistral AI Provider
 * Extends OpenAI-compatible base with custom endpoints
 */
export const MistralAdapter: ProviderAdapter = {
    name: "mistral",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "ocr":
                return ocr.exec(args);

            // For other endpoints, fall back to OpenAI-compatible adapter
            // (handled by createOpenAICompatibleAdapter in the registry)
            default:
                throw new Error(`Mistral: unsupported endpoint ${args.endpoint}`);
        }
    },
};

