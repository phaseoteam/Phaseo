// src/lib/providers/anthropic/index.ts
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
