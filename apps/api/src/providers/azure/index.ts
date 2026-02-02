// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as embeddings from "./endpoints/embeddings";

export const AzureAdapter: ProviderAdapter = {
    name: "azure",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        switch (args.endpoint) {
            case "chat.completions":
                return chat.exec(args);
            case "embeddings":
                return embeddings.exec(args);
            default:
                throw new Error(`azure: unsupported endpoint ${args.endpoint}`);
        }
    },
};

