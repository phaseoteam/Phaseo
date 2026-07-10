// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { getBindings } from "@/runtime/env";
import type { ProviderExecuteArgs } from "../types";
import { resolveProviderKey, type ResolvedKey } from "../keys";

function azureConfigError(code: string): Error & { code: string } {
    const error = new Error(code) as Error & { code: string };
    error.code = code;
    return error;
}

export type AzureOpenAIConfig = {
    baseUrl: string;
    apiVersion: string;
};

export function resolveAzureConfig(): AzureOpenAIConfig {
    const bindings = getBindings();
    const baseUrl = bindings.AZURE_OPENAI_BASE_URL;
    if (!baseUrl) {
        throw azureConfigError("azure_base_url_missing");
    }
    const configuredApiVersion = bindings.AZURE_OPENAI_API_VERSION?.trim();
    return {
        baseUrl,
        apiVersion: configuredApiVersion || "2024-10-21",
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

function azureResourceBaseUrl(baseUrl: string): string {
    return baseUrl
        .replace(/\/+$/, "")
        .replace(/\/openai\/v1$/i, "")
        .replace(/\/openai$/i, "");
}

export function azureUrl(path: string, apiVersion: string, baseUrl?: string): string {
    const base = azureResourceBaseUrl(baseUrl ?? resolveAzureConfig().baseUrl);
    const trimmedPath = path.replace(/^\/+/, "");
    return `${base}/${trimmedPath}?api-version=${encodeURIComponent(apiVersion)}`;
}

export function azureOpenAIV1Url(path: string, baseUrl?: string): string {
    const base = azureResourceBaseUrl(baseUrl ?? resolveAzureConfig().baseUrl);
    const trimmedPath = path.replace(/^\/+/, "");
    return `${base}/openai/v1/${trimmedPath}`;
}
