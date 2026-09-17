import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public gateway catalogue", () => {
	it("composes available provider models and capabilities", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { const url = String(input);
			if (url.includes("v2_route_capabilities")) return new Response(JSON.stringify([
				{ provider_api_model_id: "pm-1", capability_id: "responses", params: { response_format: true }, status: "active" },
				{ provider_api_model_id: "pm-1", capability_id: "text.rerank", params: { top_n: true }, status: "active" },
			]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", provider_id: "openai", api_model_id: "gpt-test", model_id: "openai/gpt-test", is_active_gateway: true, input_modalities: ["text", "image"], output_modalities: ["text"] }]), { status: 200 });
			if (url.includes("v2_pricing_skus")) return new Response(JSON.stringify([{ sku_id: "sku-1", provider_model_id: "pm-1", service_tier_slug: "standard", status: "active" }]), { status: 200 });
			if (url.includes("v2_pricing_sku_meters")) return new Response(JSON.stringify([
				{ sku_id: "sku-1", meter_key: "input_text_tokens", unit_quantity: 1_000_000, price_nanos: 2_000_000_000 },
				{ sku_id: "sku-1", meter_key: "output_text_tokens", unit_quantity: 1_000_000, price_nanos: 8_000_000_000 },
			]), { status: 200 });
			if (url.includes("v2_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			if (url.includes("v2_labs")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI" }]), { status: 200 });
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", status: "Available", organisation_id: "openai" }]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/gateway/models", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300, stale-while-revalidate=300, stale-if-error=3600");
		expect(response.headers.get("cache-control")).toBe("public, max-age=0");
		expect(response.headers.get("cache-tag")).toBe("web-api-models,web-api-gateway-models");
		await expect(response.json()).resolves.toMatchObject({ models: [{ modelId: "gpt-test", internalModelId: "openai/gpt-test", providerId: "openai", capabilities: ["responses", "rerank"], capabilityParamsById: { responses: { response_format: true }, rerank: { top_n: true } }, inputModalities: ["text", "image"], outputModalities: ["text"], organisationId: "openai", organisationName: "OpenAI", inputPricePerMillion: 2, outputPricePerMillion: 8, isAvailable: true }] });
	});

	it("preserves available_only filtering", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_route_capabilities")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", capability_id: "responses", status: "active" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", provider_id: "openai", api_model_id: "gpt-test", model_id: "openai/gpt-test", is_active_gateway: true, effective_to: "2020-01-01T00:00:00Z" }]), { status: 200 });
			if (url.includes("v2_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			if (url.includes("v2_labs")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI" }]), { status: 200 });
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", status: "Available", organisation_id: "openai" }]), { status: 200 });
		}));

		const [availableOnly, allModels] = await Promise.all([
			app.request("https://phaseo.app/api/_web/gateway/models?available_only=true", {}, env),
			app.request("https://phaseo.app/api/_web/gateway/models?available_only=false", {}, env),
		]);

		expect(availableOnly.status).toBe(200);
		await expect(availableOnly.json()).resolves.toEqual({ models: [] });
		expect(allModels.status).toBe(200);
		await expect(allModels.json()).resolves.toMatchObject({ models: [{ modelId: "gpt-test", isAvailable: false }] });
	});

	it("keeps deprecated models discoverable until their retirement date", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { const url = String(input);
			if (url.includes("v2_route_capabilities")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", capability_id: "responses", status: "active" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", provider_id: "openai", api_model_id: "gpt-test", model_id: "openai/gpt-test", is_active_gateway: true }]), { status: 200 });
			if (url.includes("v2_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			if (url.includes("v2_labs")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI" }]), { status: 200 });
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", status: "Deprecated", organisation_id: "openai", retirement_date: "2099-01-01T00:00:00Z" }]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/gateway/models", {}, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ models: [{ modelId: "gpt-test", modelStatus: "Deprecated", isAvailable: true }] });
	});

	it("chunks model metadata lookups to keep Supabase URLs bounded", async () => {
		const providerModels = Array.from({ length: 201 }, (_, index) => ({
			provider_api_model_id: `pm-${index}`,
			provider_id: "openai",
			api_model_id: `gpt-test-${index}`,
			model_id: `openai/gpt-test-${index}`,
			is_active_gateway: true,
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_route_capabilities")) {
				return new Response(JSON.stringify(providerModels.map((row) => ({
					provider_api_model_id: row.provider_api_model_id,
					capability_id: "responses",
					status: "active",
				}))), { status: 200 });
			}
			if (url.includes("v2_model_provider_routes")) {
				return new Response(JSON.stringify(providerModels), { status: 200 });
			}
			if (url.includes("v2_providers")) {
				return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/gateway/models", {}, env);
		expect(response.status).toBe(200);
		const modelRequests = fetchMock.mock.calls.filter(([input]) => String(input).includes("/v2_models?"));
		expect(modelRequests).toHaveLength(2);
	});
});
