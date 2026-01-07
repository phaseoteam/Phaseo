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
