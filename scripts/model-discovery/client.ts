import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import type { Provider } from "./types.js";

export function normalizeModelKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9\-_.]/g, "");
}

export function resolveEnvVars(provider: Provider): string[] {
	const vars = Array.isArray(provider.envVar) ? provider.envVar : [provider.envVar];
	return vars.map((v) => process.env[v] ?? "");
}

export function hasRequiredEnvVars(provider: Provider): boolean {
	const values = resolveEnvVars(provider);
	return values.every((v) => v && v.length > 0);
}

export function buildUrl(provider: Provider): string {
	let url = provider.baseUrl;

	if (provider.id === "fireworks" && process.env.FIREWORKS_ACCOUNT_ID) {
		url = url.replace("{account_id}", process.env.FIREWORKS_ACCOUNT_ID);
	}

	if (provider.id === "cloudflare" && process.env.CF_ACCOUNT_ID) {
		url = url.replace("{account_id}", process.env.CF_ACCOUNT_ID);
	}

	if (provider.id === "azure" && process.env.AZURE_ENDPOINT) {
		url = url.replace("{endpoint}", process.env.AZURE_ENDPOINT);
	}

	if (provider.queryParams) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(provider.queryParams)) {
			if (value === true) {
				if (Array.isArray(provider.envVar)) {
					const envKey = provider.envVar.find((v) => process.env[v]);
					if (envKey) params.set(key, process.env[envKey] ?? "");
				} else if (process.env[provider.envVar]) {
					params.set(key, process.env[provider.envVar] ?? "");
				}
			} else {
				params.set(key, String(value));
			}
		}
		const separator = url.includes("?") ? "&" : "?";
		url = `${url}${separator}${params.toString()}`;
	}

	return url;
}

export async function fetchProviderModels(provider: Provider): Promise<string[]> {
	if (!hasRequiredEnvVars(provider)) {
		return [];
	}

	if (provider.isAwsService) {
		return fetchBedrockModels();
	}

	try {
		const url = buildUrl(provider);
		const headers: Record<string, string> = {
			Authorization: `Bearer ${resolveEnvVars(provider)[0]}`,
			...provider.headers,
		};

		const response = await fetch(url, {
			method: provider.method ?? "GET",
			headers,
			body: provider.body ? JSON.stringify(provider.body) : undefined,
		});

		if (!response.ok) {
			return [];
		}

		const data = await response.json();
		return provider.transformResponse(data);
	} catch {
		return [];
	}
}

async function fetchBedrockModels(): Promise<string[]> {
	try {
		const region = process.env.AWS_REGION ?? "us-east-1";
		const client = new BedrockClient({ region });
		const command = new ListFoundationModelsCommand({});
		const response = await client.send(command);
		return (response.modelSummaries ?? []).map((m: any) => `bedrock/${m.modelId}`);
	} catch {
		return [];
	}
}

export function formatModelId(providerId: string, modelId: string): string {
	return `${providerId}/${modelId}`;
}

export function checkModelExists(
	existingModels: Set<string>,
	providerId: string,
	modelId: string
): boolean {
	const normalizedModelId = modelId.toLowerCase();
	const providerPrefix = providerId.toLowerCase();

	for (const existing of existingModels) {
		const normalizedExisting = existing.toLowerCase();
		const existingParts = normalizedExisting.split("/");
		
		if (existingParts.length >= 2) {
			const existingProvider = existingParts[0];
			const existingModel = existingParts.slice(1).join("/");
			
			if (existingProvider === providerPrefix) {
				if (existingModel === normalizedModelId) {
					return true;
				}
				if (existingModel.includes(normalizedModelId) || normalizedModelId.includes(existingModel)) {
					return true;
				}
			}
		}
	}

	return false;
}
