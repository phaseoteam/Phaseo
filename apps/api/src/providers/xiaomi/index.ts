import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import * as chat from "./endpoints/chat";
import * as responses from "./endpoints/responses";

export const XiaomiAdapter: ProviderAdapter = {
    name: "xiaomi",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        if (args.endpoint === "chat.completions") {
            return chat.exec(args);
        }
        if (args.endpoint === "responses") {
            return responses.exec(args);
        }
        throw new Error(`xiaomi: unsupported endpoint ${args.endpoint}`);
    },
};
