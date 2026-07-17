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
		expect(providerIds.has("mancer")).toBe(true);
		expect(providerIds.has("mara")).toBe(true);
		expect(providerIds.has("reka")).toBe(true);
		expect(providerIds.has("switchpoint")).toBe(true);
		expect(providerIds.has("upstage")).toBe(true);
		expect(providerIds.has("wafer")).toBe(true);
		expect(providerIds.has("streamlake")).toBe(false);
	});

	it("uses one canonical native discovery entry per provider", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("google-vertex")).toBe(true);
		expect(providerIds.has("google-vertex-eu")).toBe(false);
		expect(providerIds.has("anthropic")).toBe(true);
		expect(providerIds.has("anthropic-us")).toBe(false);
	});

	it("excludes endpoint variants from model discovery", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));
		for (const providerId of [
			"minimax-lightning",
			"nebius-token-factory-eu-north-1",
			"nebius-token-factory-fast",
			"nebius-token-factory-us-central-1",
			"openai-eu",
			"venice-e2ee",
		]) {
			expect(providerIds.has(providerId)).toBe(false);
		}
	});

	it("accepts the production secret aliases for GMICloud and Nebius", () => {
		const providers = new Map(
			MODEL_DISCOVERY_PROVIDERS.map((provider) => [provider.providerId, provider]),
		);

		expect(providers.get("gmicloud")?.apiKeyEnv).toContain("GMI_CLOUD_API_KEY");
		expect(providers.get("nebius-token-factory")?.apiKeyEnv).toContain(
			"NEBIUS_TOKEN_FACTORY_API_KEY",
		);
	});

	it("does not include known alias-only provider ids", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("arcee")).toBe(false);
		expect(providerIds.has("atlas-cloud")).toBe(false);
		expect(providerIds.has("liquid")).toBe(false);
		expect(providerIds.has("moonshot-ai")).toBe(false);
		expect(providerIds.has("moonshotai-turbo")).toBe(false);
		expect(providerIds.has("novitaai")).toBe(false);
		expect(providerIds.has("voyage")).toBe(false);
		expect(providerIds.has("voyageai")).toBe(false);
		expect(providerIds.has("x-ai")).toBe(false);
		expect(providerIds.has("xai")).toBe(false);
		expect(providerIds.has("zai")).toBe(false);
	});
});
