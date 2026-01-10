// src/lib/gateway/providers/ai21/index.ts
import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";

export const AI21Adapter: ProviderAdapter = {
    name: "ai21",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions":
                return chat.exec(args);
            default:
                throw new Error(`ai21: unsupported endpoint ${args.endpoint}`);
        }
    },
};
