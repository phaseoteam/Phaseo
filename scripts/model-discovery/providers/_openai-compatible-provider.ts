import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

type OpenAICompatProviderConfig = {
    providerId: string;
    name: string;
    apiKeyEnv: string;
    baseUrl?: string;
    baseUrlEnv?: string;
    pathPrefix?: string;
    apiKeyHeader?: string;
    apiKeyPrefix?: string;
};

function normalizePathSegment(value?: string): string {
    if (!value) return "";
    return "/" + value.replace(/^\/+|\/+$/g, "");
}

function normalizeModelsUrl(baseUrl: string, pathPrefix?: string): string {
    const base = baseUrl.replace(/\/+$/, "");
    let prefix = normalizePathSegment(pathPrefix);

    if (prefix) {
        try {
            const parsed = new URL(base);
            const basePath = parsed.pathname.replace(/\/+$/, "");
            if (basePath === prefix || basePath.endsWith(prefix)) {
                prefix = "";
            }
        } catch {
            // Ignore parse errors and use default behavior.
        }
    }

    return prefix ? base + prefix + "/models" : base + "/models";
}

export function defineOpenAICompatibleProvider(config: OpenAICompatProviderConfig) {
    return defineProvider({
        id: config.providerId,
        name: config.name,
        requiredEnv: config.baseUrlEnv && !config.baseUrl ? [config.apiKeyEnv, config.baseUrlEnv] : [config.apiKeyEnv],
        async fetchModels() {
            const key = process.env[config.apiKeyEnv];
            const configuredBaseUrl = config.baseUrlEnv ? process.env[config.baseUrlEnv] : undefined;
            const baseUrl = config.baseUrl ?? configuredBaseUrl;

            if (!key) {
                throw new Error("Missing API key: " + config.apiKeyEnv);
            }
            if (!baseUrl) {
                throw new Error("Missing base URL for " + config.providerId);
            }

            const payload = await fetchJson({
                url: normalizeModelsUrl(baseUrl, config.pathPrefix),
                init: {
                    headers: {
                        [config.apiKeyHeader ?? "Authorization"]: (config.apiKeyPrefix ?? "Bearer ") + key,
                    },
                },
            });

            const models = asArray(asRecord(payload)?.data).length
                ? asArray(asRecord(payload)?.data)
                : asArray(asRecord(payload)?.models);

            return normalizeModelEntries(models, (item) => (typeof item.id === "string" ? item.id : null));
        },
    });
}
