import { BASE_URL } from "../quickstart/config";
import { resolveGatewayPath } from "../quickstart/endpoint-paths";
import { buildExamplePayload } from "../quickstart/quickstartPayloads";
import type { ShikiLang } from "../quickstart/shiki";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";

export const ROUTING_LANGUAGES = [
    { id: "json", label: "JSON", lang: "json" },
    { id: "curl", label: "cURL", lang: "bash" },
    { id: "typescript", label: "TypeScript", lang: "ts" },
    { id: "python", label: "Python", lang: "python" },
    { id: "go", label: "Go", lang: "go" },
    { id: "csharp", label: "C#", lang: "csharp" },
    { id: "php", label: "PHP", lang: "php" },
    { id: "ruby", label: "Ruby", lang: "ruby" },
] as const satisfies ReadonlyArray<{ id: string; label: string; lang: ShikiLang }>;

export type RoutingLanguage = (typeof ROUTING_LANGUAGES)[number]["id"];

export function buildProviderRoutingExample({
    providerId, modelId, serviceTier, endpoint, language,
}: {
    providerId: string;
    modelId: string;
    serviceTier: string;
    endpoint: string;
    language: RoutingLanguage;
}): string {
    const tier = serviceTier === "priority" || serviceTier === "flex" ? serviceTier : null;
    const isBatch = serviceTier === "batch";
    const qualifiedModel = `${providerId}:${modelId}`;
    const routing = { model: qualifiedModel, ...(tier ? { service_tier: tier } : {}) };
    const quotedProvider = JSON.stringify(providerId);
    const quotedModel = JSON.stringify(qualifiedModel);
    const quotedTier = JSON.stringify(tier);
    const singleQuotedValue = `'${(isBatch ? providerId : qualifiedModel).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

    switch (language) {
        case "json":
            return isBatch ? `{\n  "provider": { "only": [${quotedProvider}] }\n}` : JSON.stringify(routing, null, 2);
        case "typescript":
            return `const routing = {\n  ${isBatch ? `provider: { only: [${quotedProvider}] }` : `model: ${quotedModel}`},${tier ? `\n  service_tier: ${quotedTier},` : ""}\n};`;
        case "python":
            return `routing = {\n    ${isBatch ? `"provider": {"only": [${quotedProvider}]}` : `"model": ${quotedModel}`},${tier ? `\n    "service_tier": ${quotedTier},` : ""}\n}`;
        case "go":
            return `routing := map[string]any{\n    ${isBatch ? `"provider": map[string]any{\n        "only": []string{${quotedProvider}},\n    }` : `"model": ${quotedModel}`},${tier ? `\n    "service_tier": ${quotedTier},` : ""}\n}`;
        case "csharp":
            return `var routing = new {\n    ${isBatch ? `provider = new { only = new[] { ${quotedProvider} } }` : `model = ${quotedModel}`},${tier ? `\n    service_tier = ${quotedTier},` : ""}\n};`;
        case "php":
            return `$routing = [\n    ${isBatch ? `'provider' => ['only' => [${singleQuotedValue}]]` : `'model' => ${singleQuotedValue}`},${tier ? `\n    'service_tier' => '${tier}',` : ""}\n];`;
        case "ruby":
            return `routing = {\n  ${isBatch ? `provider: { only: [${singleQuotedValue}] }` : `model: ${singleQuotedValue}`},${tier ? `\n  service_tier: '${tier}',` : ""}\n}`;
        case "curl": {
            const normalizedEndpoint = endpoint.toLowerCase().replace(/^\//, "").replace(/\//g, ".");
            const path = capabilityToEndpoints[normalizedEndpoint]?.[0] ?? resolveGatewayPath(normalizedEndpoint);
            const request = buildExamplePayload(path, modelId);
            const payload = isBatch ? {
                provider: { only: [providerId] },
                model: modelId,
                endpoint: `/v1${path}`,
                completion_window: "24h",
                requests: [{ custom_id: "request-1", method: "POST", url: `/v1${path}`, body: request }],
            } : { ...request, ...routing };
            const json = JSON.stringify(payload, null, 2).replace(/'/g, "'\\''");
            return `curl ${BASE_URL}${isBatch ? "/batches" : path} \\\n  -H "Authorization: Bearer $PHASEO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
        }
    }
}
