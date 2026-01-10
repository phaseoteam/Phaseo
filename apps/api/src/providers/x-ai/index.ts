// src/lib/providers/x-ai/index.ts
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as responses from "./endpoints/responses";

export const XAIAdapter: ProviderAdapter = {
    name: "x-ai",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions":
                return chat.exec(args);
            case "responses":
                return responses.exec(args);
            default:
                throw new Error(`x-ai: unsupported endpoint ${args.endpoint}`);
        }
    },
};
