// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "./types";

export function createUnsupportedAdapter(providerId: string, reason: string): ProviderAdapter {
    return {
        name: providerId,
        async execute(_args: ProviderExecuteArgs): Promise<AdapterResult> {
            throw new Error(`${providerId}_not_supported:${reason}`);
        },
    };
}

