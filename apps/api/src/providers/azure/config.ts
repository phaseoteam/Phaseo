// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { getBindings } from "@/runtime/env";
import { normalizeAzureByokEndpoint } from "@core/provider-credentials";
import type { ProviderExecuteArgs } from "../types";
import { orderedByokMetas, resolveProviderKey, type ResolvedKey } from "../keys";

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

type AzureCredentialArgs = Pick<ProviderExecuteArgs, "model" | "providerModelSlug"> &
    Partial<Pick<ProviderExecuteArgs, "byokMeta">> & { forceGatewayKey?: boolean };

export type AzureByokDeployment = {
    key: string;
    byokId: string | null;
    baseUrl: string;
    deployment: string;
    apiVersion?: string;
};

function firstString(entry: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) {
        const value = entry[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
}

function isJsonCredential(key: unknown): boolean {
    return typeof key === "string" && key.trim().startsWith("{");
}

function modelSlugMatches(candidate: string, slugs: string[]): boolean {
    const normalized = candidate.trim().toLowerCase();
    const bare = normalized.replace(/^[^/]+\//, "");
    return slugs.some((slug) => slug === normalized || slug.replace(/^[^/]+\//, "") === bare);
}

/**
 * The customer's own deployment for this model from an Azure BYOK key. The key is saved
 * as JSON, `{"deployments":[{"modelSlug","endpointUrl","apiKey","modelId"}]}`, with the
 * field aliases the BYOK form and validator accept (apps/web/src/lib/byok/providerKeyValidation.ts,
 * core/provider-credentials.ts). Keys without a deployment for the model are skipped.
 */
export function resolveAzureByokDeployment(args: AzureCredentialArgs): AzureByokDeployment | null {
    if (args.forceGatewayKey || !args.byokMeta?.length) return null;
    const slugs = [args.model, args.providerModelSlug]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim().toLowerCase());
    for (const meta of orderedByokMetas(args.byokMeta)) {
        if (!isJsonCredential(meta.key)) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(String(meta.key)); } catch { continue; }
        const deployments = (parsed as { deployments?: unknown })?.deployments;
        if (!Array.isArray(deployments)) continue;
        for (const entry of deployments) {
            if (!entry || typeof entry !== "object") continue;
            const record = entry as Record<string, unknown>;
            const modelSlug = firstString(record, ["modelSlug", "phaseoModelSlug", "aiStatsModelSlug"]);
            const endpoint = firstString(record, ["endpointUrl", "endpoint", "foundryEndpoint", "azureEndpoint"]);
            const key = firstString(record, ["apiKey"]);
            const deployment = firstString(record, ["modelId", "providerModelId", "azureModelId"]);
            if (!modelSlug || !endpoint || !key || !deployment || !modelSlugMatches(modelSlug, slugs)) continue;
            // Checked again here so keys saved before the endpoint rule cannot reach other hosts.
            const baseUrl = normalizeAzureByokEndpoint(endpoint);
            if (!baseUrl) throw azureConfigError("azure_byok_endpoint_invalid");
            return { key, byokId: meta.id ?? null, baseUrl, deployment, apiVersion: firstString(record, ["apiVersion"]) };
        }
    }
    return null;
}

export function resolveAzureConfig(args?: AzureCredentialArgs): AzureOpenAIConfig {
    const byok = args ? resolveAzureByokDeployment(args) : null;
    if (byok) {
        return { baseUrl: byok.baseUrl, apiVersion: byok.apiVersion || "v1", deployment: byok.deployment, apiKey: byok.key };
    }
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

export type AzureCredential = ResolvedKey & { authType: "api-key" | "entra" };

export function resolveAzureCredential(args: Pick<ProviderExecuteArgs, "providerId" | "byokMeta" | "model" | "providerModelSlug"> & { forceGatewayKey?: boolean }): AzureCredential {
	const byok = resolveAzureByokDeployment(args);
	if (byok) return { key: byok.key, source: "byok", byokId: byok.byokId, authType: "api-key" };
	// A JSON key with no deployment for this model never goes upstream as a key. A plain
	// key (saved before deployment mappings) still applies to the gateway's resource.
	const keyArgs = { ...args, byokMeta: (args.byokMeta ?? []).filter((meta) => !isJsonCredential(meta.key)) };
	const config = resolveAzureConfig(keyArgs);
	const apiKey = resolveProviderKey(keyArgs, () => config.apiKey, { allowEmptyFallback: true });
	if (apiKey.key) return { ...apiKey, authType: "api-key" };
	const token = config.authToken?.trim();
	if (token) return { key: token, source: "gateway", byokId: null, authType: "entra" };
	return { ...resolveProviderKey(keyArgs, () => config.apiKey), authType: "api-key" };
}

export function azureHeaders(key: string, authType: "api-key" | "entra" = "api-key"): Record<string, string> {
    return {
		...(authType === "entra" ? { Authorization: `Bearer ${key}` } : { "api-key": key }),
        "Content-Type": "application/json",
    };
}

export function azureAnthropicHeaders(key: string, authType: "api-key" | "entra" = "api-key"): Record<string, string> {
    return {
        ...(authType === "entra" ? { Authorization: `Bearer ${key}` } : { "x-api-key": key }),
        "Content-Type": "application/json",
    };
}

export function azureAnthropicUrl(baseUrl: string): string {
    const url = new URL(baseUrl);
    url.pathname = azureResourceBaseUrl(url.pathname);
    if (url.hostname.endsWith(".openai.azure.com")) {
        url.hostname = url.hostname.replace(/\.openai\.azure\.com$/, ".services.ai.azure.com");
    }
    url.pathname = `${url.pathname.replace(/\/anthropic(?:\/v1(?:\/messages)?)?\/?$/i, "").replace(/\/$/, "")}/anthropic/v1/messages`;
    url.search = "";
    url.hash = "";
    return url.toString();
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

export function azureDecisionsUrl(baseUrl: string): string {
    const url = new URL(azureResourceBaseUrl(baseUrl));
    if (url.hostname.endsWith(".openai.azure.com")) url.hostname = url.hostname.replace(/\.openai\.azure\.com$/, ".services.ai.azure.com");
    url.pathname = "/providers/microsoft/v1/systemone";
    url.search = "";
    url.hash = "";
    return url.toString();
}
