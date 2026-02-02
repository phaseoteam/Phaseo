// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { getBindings } from "@/runtime/env";
import type { ProviderExecuteArgs } from "../types";
import { resolveProviderKey, type ResolvedKey } from "../keys";

export type AzureOpenAIConfig = {
    baseUrl: string;
    apiVersion: string;
};

export function resolveAzureConfig(): AzureOpenAIConfig {
    const bindings = getBindings();
    const baseUrl = bindings.AZURE_OPENAI_BASE_URL;
    if (!baseUrl) {
        throw new Error("azure_base_url_missing");
    }
    return {
        baseUrl,
        apiVersion: bindings.AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview",
    };
}

export function resolveAzureKey(args: ProviderExecuteArgs): ResolvedKey {
    return resolveProviderKey(args, () => getBindings().AZURE_OPENAI_API_KEY);
}

export function azureHeaders(key: string): Record<string, string> {
    return {
        "api-key": key,
        "Content-Type": "application/json",
    };
}

export function azureDeployment(args: ProviderExecuteArgs): string {
    return encodeURIComponent(args.providerModelSlug || args.model);
}

export function azureUrl(path: string, apiVersion: string, baseUrl?: string): string {
    const base = (baseUrl ?? resolveAzureConfig().baseUrl).replace(/\/+$/, "");
    const trimmedPath = path.replace(/^\/+/, "");
    return `${base}/${trimmedPath}?api-version=${encodeURIComponent(apiVersion)}`;
}

