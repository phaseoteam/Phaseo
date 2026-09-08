import type { ProviderExecuteArgs } from "../types";
import { azureDeployment, azureHeaders, azureOpenAIV1Url, azureUrl, resolveAzureConfig, resolveAzureCredential, usesAzureV1 } from "../azure/config";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../openai-compatible/config";

/** Transport for endpoints sharing OpenAI's payload and response protocol. */
export function resolveOpenAITransport(args: ProviderExecuteArgs, path: string, extraHeaders: Record<string, string> = {}) {
    if (args.providerId === "azure") {
        const config = resolveAzureConfig(args);
        const keyInfo = resolveAzureCredential(args);
        return {
            keyInfo,
            deployment: config.deployment,
            url: usesAzureV1(config.apiVersion)
                ? azureOpenAIV1Url(path, config.baseUrl, config.apiVersion)
                : azureUrl(`openai/deployments/${config.deployment ? encodeURIComponent(config.deployment) : azureDeployment(args)}/${path.replace(/^\/+/, "")}`, config.apiVersion, config.baseUrl),
            headers: { ...azureHeaders(keyInfo.key, keyInfo.authType), ...extraHeaders },
        };
    }
    const keyInfo = resolveOpenAICompatKey(args);
    return { keyInfo, deployment: undefined, url: openAICompatUrl(args.providerId, path), headers: openAICompatHeaders(args.providerId, keyInfo.key, extraHeaders) };
}
