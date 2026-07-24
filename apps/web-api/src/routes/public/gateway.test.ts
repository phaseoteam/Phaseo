import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public gateway catalogue", () => {
	it("composes available provider models and capabilities", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { const url = String(input);
			if (url.includes("data_api_provider_model_capabilities")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", capability_id: "responses", params: { response_format: true }, status: "active" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", provider_id: "openai", api_model_id: "gpt-test", model_id: "openai/gpt-test", is_active_gateway: true }]), { status: 200 });
			if (url.includes("data_api_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", status: "Available", organisation_id: "openai", organisation: { name: "OpenAI" } }]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/gateway/models", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300, stale-while-revalidate=300");
		await expect(response.json()).resolves.toMatchObject({ models: [{ modelId: "gpt-test", internalModelId: "openai/gpt-test", providerId: "openai", capabilities: ["responses"], capabilityParamsById: { responses: { response_format: true } }, isAvailable: true }] });
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
			if (url.includes("data_api_provider_model_capabilities")) {
				return new Response(JSON.stringify(providerModels.map((row) => ({
					provider_api_model_id: row.provider_api_model_id,
					capability_id: "responses",
					status: "active",
				}))), { status: 200 });
			}
			if (url.includes("data_api_provider_models")) {
				return new Response(JSON.stringify(providerModels), { status: 200 });
			}
			if (url.includes("data_api_providers")) {
				return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/gateway/models", {}, env);
		expect(response.status).toBe(200);
		const modelRequests = fetchMock.mock.calls.filter(([input]) => String(input).includes("data_models"));
		expect(modelRequests).toHaveLength(2);
	});
});
