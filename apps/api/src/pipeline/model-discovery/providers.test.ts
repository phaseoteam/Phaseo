import { describe, expect, it } from "vitest";
import { MODEL_DISCOVERY_PROVIDERS } from "./providers";

describe("MODEL_DISCOVERY_PROVIDERS", () => {
	it("includes the newly supported self-serve providers with model APIs", () => {
		const providerIds = new Set(MODEL_DISCOVERY_PROVIDERS.map((provider) => provider.providerId));

		expect(providerIds.has("avian")).toBe(true);
		expect(providerIds.has("baidu")).toBe(true);
		expect(providerIds.has("featherless")).toBe(true);
		expect(providerIds.has("inference-net")).toBe(true);
		expect(providerIds.has("mancer")).toBe(true);
		expect(providerIds.has("perceptron")).toBe(true);
		expect(providerIds.has("reka")).toBe(true);
		expect(providerIds.has("streamlake")).toBe(true);
		expect(providerIds.has("upstage")).toBe(true);
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
		expect(providerIds.has("moonshot-ai")).toBe(false);
		expect(providerIds.has("novitaai")).toBe(false);
		expect(providerIds.has("voyage")).toBe(false);
		expect(providerIds.has("voyageai")).toBe(false);
		expect(providerIds.has("xai")).toBe(false);
		expect(providerIds.has("zai")).toBe(false);
	});
});
