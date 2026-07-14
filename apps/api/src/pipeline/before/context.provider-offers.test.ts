import { describe, expect, it } from "vitest";
import { applyExplicitProviderModelRouting } from "./context.provider-offers";

describe("applyExplicitProviderModelRouting", () => {
	it("pins an explicitly scoped regional provider model instead of falling back to siblings", () => {
		const parsed = {
			resolvedModel: "openai/gpt-5.5",
			pricing: {
				openai: { provider: "openai" },
				"openai-eu": { provider: "openai-eu" },
			},
			providers: [
				{
					providerId: "openai",
					providerModelSlug: "openai/gpt-5.5",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
				{
					providerId: "openai-eu",
					providerModelSlug: "openai/gpt-5.5",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
			],
		} as any;

		const result = applyExplicitProviderModelRouting({
			parsed,
			requestedModel: "openai-eu/openai/gpt-5.5",
		});

		expect(result.providers.map((provider: any) => provider.providerId)).toEqual([
			"openai-eu",
		]);
		expect(Object.keys(result.pricing)).toEqual(["openai-eu"]);
	});

	it("leaves generic publisher-prefixed models alone when there is no exact provider-scoped match", () => {
		const parsed = {
			resolvedModel: "meta/llama-3.3-70b-instruct",
			pricing: {
				"nebius-token-factory": { provider: "nebius-token-factory" },
			},
			providers: [
				{
					providerId: "nebius-token-factory",
					providerModelSlug: "meta/llama-3.3-70b-instruct",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
			],
		} as any;

		const result = applyExplicitProviderModelRouting({
			parsed,
			requestedModel: "meta/llama-3.3-70b-instruct",
		});

		expect(result.providers.map((provider: any) => provider.providerId)).toEqual([
			"nebius-token-factory",
		]);
		expect(Object.keys(result.pricing)).toEqual(["nebius-token-factory"]);
	});

	it("keeps specialized siblings alongside an explicitly scoped global offer", () => {
		const parsed = {
			resolvedModel: "minimax/minimax-m2.1",
			pricing: {
				minimax: { provider: "minimax" },
				"minimax-lightning": { provider: "minimax-lightning" },
			},
			providers: [
				{
					providerId: "minimax",
					providerFamilyId: "minimax",
					offerScope: "global",
					apiModelId: "minimax/minimax-m2.1",
					providerModelSlug: "minimax/minimax-m2.1",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
				{
					providerId: "minimax-lightning",
					providerFamilyId: "minimax",
					offerScope: "specialized",
					apiModelId: "minimax/minimax-m2.1",
					providerModelSlug: "minimax/minimax-m2.1",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
			],
		} as any;

		const result = applyExplicitProviderModelRouting({
			parsed,
			requestedModel: "minimax/minimax-m2.1",
		});

		expect(result.providers.map((provider: any) => provider.providerId)).toEqual([
			"minimax",
			"minimax-lightning",
		]);
		expect(Object.keys(result.pricing)).toEqual(["minimax", "minimax-lightning"]);
	});

	it("does not collapse ordinary canonical model ids to a single matching provider", () => {
		const parsed = {
			resolvedModel: "minimax/minimax-m3",
			pricing: {
				minimax: { provider: "minimax" },
				novita: { provider: "novita" },
				venice: { provider: "venice" },
			},
			providers: [
				{
					providerId: "minimax",
					providerModelSlug: "MiniMax-M3",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
				{
					providerId: "novita",
					providerModelSlug: "minimax/minimax-m3",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
				{
					providerId: "venice",
					providerModelSlug: "minimax-m3",
					supportsEndpoint: true,
					baseWeight: 1,
					byokMeta: [],
				},
			],
		} as any;

		const result = applyExplicitProviderModelRouting({
			parsed,
			requestedModel: "minimax/minimax-m3",
		});

		expect(result.providers.map((provider: any) => provider.providerId)).toEqual([
			"minimax",
			"novita",
			"venice",
		]);
		expect(Object.keys(result.pricing)).toEqual(["minimax", "novita", "venice"]);
	});
});
