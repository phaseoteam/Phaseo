import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "./types";

export function createUnsupportedAdapter(providerId: string, reason: string): ProviderAdapter {
    return {
        name: providerId,
        async execute(_args: ProviderExecuteArgs): Promise<AdapterResult> {
            throw new Error(`${providerId}_not_supported:${reason}`);
        },
    };
}
