import { describe, expect, it } from "vitest";
import { MODEL_DISCOVERY_PROVIDERS } from "./providers";

describe("MODEL_DISCOVERY_PROVIDERS", () => {
	it("includes the newly supported self-serve providers with model APIs", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("avian")).toBe(true);
		expect(providerIds.has("baidu")).toBe(true);
		expect(providerIds.has("darkbloom")).toBe(true);
		expect(providerIds.has("ambient")).toBe(true);
		expect(providerIds.has("featherless")).toBe(true);
		expect(providerIds.has("inference-net")).toBe(true);
		expect(providerIds.has("doubleword")).toBe(true);
		expect(providerIds.has("mancer")).toBe(true);
		expect(providerIds.has("mara")).toBe(true);
		expect(providerIds.has("minimax")).toBe(true);
		expect(providerIds.has("reka")).toBe(true);
		expect(providerIds.has("switchpoint")).toBe(true);
		expect(providerIds.has("upstage")).toBe(true);
		expect(providerIds.has("wafer")).toBe(true);
		expect(providerIds.has("streamlake")).toBe(false);
	});

	it("uses native discovery entries for vertex regions", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("google-vertex")).toBe(true);
		expect(providerIds.has("google-vertex-eu")).toBe(true);
	});

	it("does not include known alias-only provider ids", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("arcee")).toBe(false);
		expect(providerIds.has("atlas-cloud")).toBe(false);
		expect(providerIds.has("liquid")).toBe(false);
		expect(providerIds.has("liquid-ai")).toBe(false);
		expect(providerIds.has("moonshot-ai")).toBe(false);
		expect(providerIds.has("novitaai")).toBe(false);
		expect(providerIds.has("voyage")).toBe(false);
		expect(providerIds.has("voyageai")).toBe(false);
		expect(providerIds.has("x-ai")).toBe(false);
		expect(providerIds.has("xai")).toBe(false);
		expect(providerIds.has("zai")).toBe(false);
	});

	it("does not include external aggregators in routable discovery", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("openrouter")).toBe(false);
	});

	it("accepts deployed credential aliases for linked providers", () => {
		const providers = new Map(MODEL_DISCOVERY_PROVIDERS.map((provider) => [provider.providerId, provider]));

		expect(providers.get("gmicloud")?.apiKeyEnv).toContain("GMI_CLOUD_API_KEY");
		expect(providers.get("nebius-token-factory")?.apiKeyEnv).toContain("NEBIUS_TOKEN_FACTORY_API_KEY");
		expect(providers.get("amazon-bedrock")?.apiKeyEnv).toContain("AMAZON_BEDROCK_MANTLE_API_KEY");
	});

	it("includes models.dev parity aggregator and public catalog endpoints", () => {
		const providers = new Map(MODEL_DISCOVERY_PROVIDERS.map((provider) => [provider.providerId, provider]));
		for (const providerId of ["crossmodel", "digitalocean", "empiriolabs", "llmgateway", "ovhcloud", "pioneer", "vercel"]) {
			expect(providers.has(providerId), providerId).toBe(true);
		}
		for (const providerId of ["huggingface", "kilo", "nano-gpt"]) {
			expect(providers.has(providerId), providerId).toBe(false);
		}
		expect(providers.get("ambient")).toMatchObject({
			modelsEndpoint: "https://api.ambient.xyz/v1/models",
			authStyle: "none",
		});
		expect(providers.get("cerebras")).toMatchObject({
			modelsEndpoint: "https://api.cerebras.ai/public/v1/models",
			authStyle: "none",
		});
		expect(providers.get("cloudflare")).toMatchObject({
			modelsEndpoint: expect.stringContaining("{accountId}"),
			modelsEndpointParams: {
				accountId: ["CLOUDFLARE_WORKERS_AI_SYNC_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID"],
			},
		});
		expect(providers.get("novita")).toMatchObject({
			modelsEndpoint: "https://api.novita.ai/openai/v1/models",
			authStyle: "optional_bearer",
		});
		expect(providers.get("ovhcloud")).toMatchObject({
			modelsEndpoint: "https://catalog.endpoints.ai.ovh.net/rest/v2/openrouter",
			authStyle: "none",
		});
		expect(providers.get("together")).toMatchObject({
			modelsEndpoint: "https://api.together.ai/v1/models",
		});
		expect(providers.get("minimax")).toMatchObject({
			baseUrl: "https://api.minimax.io",
			pathPrefix: "/v1",
			apiKeyEnv: ["MINIMAX_API_KEY"],
		});
		expect(providers.get("reka")).toMatchObject({
			baseUrl: "https://api.reka.ai",
			pathPrefix: "/v1",
			authStyle: "x_api_key",
		});
	});
});
