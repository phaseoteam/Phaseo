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
    deployment?: string;
    apiKey?: string;
    authToken?: string;
};

export function resolveAzureConfig(args?: Pick<ProviderExecuteArgs, "model" | "providerModelSlug">): AzureOpenAIConfig {
    const bindings = getBindings();
    let resource: Partial<AzureOpenAIConfig> | undefined;
    if (bindings.AZURE_OPENAI_DEPLOYMENTS && args) {
        try {
            const deployments = JSON.parse(bindings.AZURE_OPENAI_DEPLOYMENTS);
            resource = deployments[args.providerModelSlug || args.model] ?? deployments[args.model];
            if (resource != null && (typeof resource !== "object" || Array.isArray(resource) ||
                Object.values(resource).some(value => typeof value !== "string"))) {
                throw new Error("invalid deployment");
            }
        } catch {
            throw azureConfigError("azure_deployments_invalid");
        }
    }
    const baseUrl = resource?.baseUrl || bindings.AZURE_OPENAI_BASE_URL;
    if (!baseUrl) {
        throw azureConfigError("azure_base_url_missing");
    }
    const configuredApiVersion = (resource?.apiVersion ?? bindings.AZURE_OPENAI_API_VERSION)?.trim();
    return {
        baseUrl,
        apiVersion: configuredApiVersion || "v1",
        deployment: resource?.deployment,
        apiKey: resource?.baseUrl ? resource.apiKey : resource?.apiKey ?? bindings.AZURE_OPENAI_API_KEY,
        authToken: resource?.baseUrl ? resource.authToken : resource?.authToken ?? bindings.AZURE_OPENAI_AUTH_TOKEN,
    };
}

export function resolveAzureKey(args: ProviderExecuteArgs): ResolvedKey {
    return resolveProviderKey(args, () => getBindings().AZURE_OPENAI_API_KEY);
}

export type AzureCredential = ResolvedKey & { authType: "api-key" | "entra" };

export function resolveAzureCredential(args: ProviderExecuteArgs): AzureCredential {
	const config = resolveAzureConfig(args);
	const apiKey = resolveProviderKey(args, () => config.apiKey, { allowEmptyFallback: true });
	if (apiKey.key) return { ...apiKey, authType: "api-key" };
	const token = config.authToken?.trim();
	if (token) return { key: token, source: "gateway", byokId: null, authType: "entra" };
	return { ...resolveProviderKey(args, () => config.apiKey), authType: "api-key" };
}

export function azureHeaders(key: string, authType: "api-key" | "entra" = "api-key"): Record<string, string> {
    return {
		...(authType === "entra" ? { Authorization: `Bearer ${key}` } : { "api-key": key }),
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

export function azureOpenAIV1Url(path: string, baseUrl?: string, apiVersion = "v1"): string {
    const base = azureResourceBaseUrl(baseUrl ?? resolveAzureConfig().baseUrl);
    const trimmedPath = path.replace(/^\/+/, "");
	const url = `${base}/openai/v1/${trimmedPath}`;
	return apiVersion.trim().toLowerCase() === "preview" ? `${url}?api-version=preview` : url;
}

export function usesAzureV1(apiVersion: string): boolean {
	const normalized = apiVersion.trim().toLowerCase();
	return normalized === "v1" || normalized === "preview";
}

export function azureMaiUrl(path: string, baseUrl: string): string {
    const url = new URL(azureResourceBaseUrl(baseUrl));
    if (url.hostname.endsWith(".openai.azure.com")) url.hostname = url.hostname.replace(/\.openai\.azure\.com$/, ".services.ai.azure.com");
    url.pathname = `${url.pathname.replace(/\/mai\/v1\/?$/, "").replace(/\/$/, "")}/mai/v1/${path.replace(/^\/+/, "")}`;
    return url.toString();
}
