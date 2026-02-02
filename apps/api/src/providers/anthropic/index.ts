// src/lib/providers/anthropic/index.ts
// Purpose: Provider adapter module for anthropic.
// Why: Isolates provider-specific configuration and utilities.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as responses from "./endpoints/responses";

export const AnthropicAdapter: ProviderAdapter = {
    name: "anthropic",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions":
                return chat.exec(args);
            case "responses":
                return responses.exec(args);
            default:
                throw new Error(`anthropic: unsupported endpoint ${args.endpoint}`);
        }
    },
};









