import { afterEach, describe, expect, it, vi } from "vitest";
import { composeModelPricing, fetchModelPricingSources, publicPricingRouteIdentity } from "@/models/pricing";

afterEach(() => vi.unstubAllGlobals());

describe("publicPricingRouteIdentity", () => {
	it("leaves ordinary provider routes unchanged", () => {
		const route = { provider_slug: "openai", provider_model_slug: "gpt-test", model_slug: "openai/gpt-test", is_stealth: false };
		expect(publicPricingRouteIdentity(route)).toBe(route);
	});

	it("exposes exactly stealth and the public model slug for stealth routes", () => {
		expect(publicPricingRouteIdentity({
			provider_slug: "private-provider",
			provider_model_slug: "secret-upstream-model",
			model_slug: "stealth/preview",
			is_stealth: true,
		})).toMatchObject({
			provider_slug: "stealth",
			provider_model_slug: "stealth/preview",
		});
	});

	it("removes real provider and upstream model identities from fetched pricing sources", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) {
				return new Response(JSON.stringify([{
					provider_model_id: "stealth:preview",
					provider_slug: "private-provider",
					model_slug: "stealth/preview",
					provider_model_slug: "secret-upstream-model",
					is_stealth: true,
					status: "active",
					routing_enabled: true,
					access_scope: "public",
				}]));
			}
			if (url.includes("v2_providers")) {
				return new Response(JSON.stringify([{
					provider_slug: "stealth",
					name: "Stealth",
					status: "active",
					routing_enabled: true,
				}]));
			}
			if (url.includes("v2_pricing_skus")) {
				return new Response(JSON.stringify([{
					sku_id: "sku-stealth",
					provider_model_id: "stealth:preview",
					service_tier_slug: "standard",
					operation: "text.generate",
					status: "active",
					currency: "USD",
				}]));
			}
			if (url.includes("v2_pricing_sku_meters")) {
				return new Response(JSON.stringify([{
					sku_meter_id: "meter-stealth",
					sku_id: "sku-stealth",
					meter_key: "input_text_tokens",
					unit: "token",
					unit_quantity: 1_000_000,
					price_nanos: 1_000_000_000,
					meter_order: 1,
				}]));
			}
			if (url.includes("v2_route_capabilities")) {
				return new Response(JSON.stringify([{
					provider_model_id: "stealth:preview",
					capability_id: "text.generate",
					params: {},
					effective_from: "2026-01-01T00:00:00Z",
					effective_to: "2026-12-01T00:00:00Z",
					status: "active",
				}]));
			}
			return new Response(JSON.stringify([]));
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchModelPricingSources({
			ENV: "development",
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
		}, ["stealth/preview"]);

		expect(result.providerRows[0]).toMatchObject({
			provider_id: "stealth",
			provider_model_slug: "stealth/preview",
			data_api_provider_model_capabilities: [{
				capability_id: "text.generate",
				effective_from: "2026-01-01T00:00:00Z",
				effective_to: "2026-12-01T00:00:00Z",
			}],
			data_api_providers: {
				api_provider_name: "Stealth",
				provider_family_id: "stealth",
			},
		});
		expect(result.pricingRows[0]).toMatchObject({
			model_key: "stealth:stealth/preview:text.generate",
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("private-provider");
		expect(serialized).not.toContain("secret-upstream-model");
	});
});

describe("composeModelPricing", () => {
	it("carries capability and service-tier policy metadata into composed pricing", () => {
		const capabilityPolicy = {
			tier: "private",
			confidence: "confirmed",
			zdrEligibility: "eligible",
			retentionMode: "transient",
			retentionDays: 0,
		};
		const serviceTierPolicy = {
			tier: "logs",
			confidence: "confirmed",
			zdrEligibility: "ineligible",
			retentionMode: "until_deleted",
			retentionDays: null,
		};

		const providers = composeModelPricing([
			{
				provider_api_model_id: "pm-policy",
				provider_id: "mistral",
				api_model_id: "mistral/mistral-small-4",
				provider_model_slug: "mistral-small-4",
				is_active_gateway: true,
				data_api_provider_model_capabilities: [{
					capability_id: "text.generate",
					status: "active",
					data_policy: capabilityPolicy,
				}],
				data_api_providers: {
					api_provider_name: "Mistral",
					service_tier_data_policies: { batch: serviceTierPolicy },
				},
			},
		], []);

		expect(providers[0]?.provider.service_tier_data_policies).toEqual({
			batch: serviceTierPolicy,
		});
		expect(providers[0]?.provider_models[0]?.data_policy).toEqual(capabilityPolicy);
	});

	it("groups provider models and attaches active or upcoming normalized rules", () => {
		const providers = composeModelPricing([
			{
				provider_api_model_id: "pm-1",
				provider_id: "provider-a",
				api_model_id: "openai/gpt-test:free",
				provider_model_slug: "gpt-test",
				is_active_gateway: true,
				provider_availability_status: "available",
				phaseo_status: "enabled",
				access_scope: "public",
				input_modalities: ["text"],
				output_modalities: ["text"],
				data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active", max_input_tokens: 128000 }],
				data_api_providers: { api_provider_name: "Provider A", country_code: "US" },
			},
		], [
			{ rule_id: "rule-1", model_key: "provider-a:openai/gpt-test:free:text.generate", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 0, currency: "USD", priority: 100, effective_from: "2026-01-01T00:00:00Z", effective_to: null, note: "Free tier", match: [] },
			{ rule_id: "expired", model_key: "provider-a:openai/gpt-test:free:text.generate", pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 1, effective_to: "2020-01-01T00:00:00Z" },
		]);

		expect(providers).toHaveLength(1);
		expect(providers[0]?.provider).toMatchObject({ api_provider_id: "provider-a", api_provider_name: "Provider A" });
		expect(providers[0]?.provider_models).toMatchObject([{
			endpoint: "text.generate",
			context_length: null,
			max_input_tokens: 128000,
			provider_availability_status: "available",
			phaseo_status: "enabled",
			access_scope: "public",
		}]);
		expect(providers[0]?.pricing_rules).toMatchObject([{ id: "rule-1", pricing_plan: "free", price_per_unit: 0 }]);
	});
});
