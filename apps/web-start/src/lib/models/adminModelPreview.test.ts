import { toAdminModelPreview } from "./adminModelPreview";
import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

function source(hidden: boolean): AdminModelSource {
	return {
		requestedModelId: "internal/revalidation-test",
		canonicalApiId: "internal/revalidation-test",
		internalModelId: "internal/revalidation-test",
		model: { model_id: "internal/revalidation-test", name: "Revalidation test", hidden, status: "Preview" },
		providerRows: [{ provider_api_model_id: "test-provider:internal/revalidation-test:chat.completions", provider_id: "test-provider", provider_model_slug: "test-model", routing_status: "active", data_api_providers: { api_provider_name: "Test provider" } }],
		pricingRules: [],
		subscriptionPlans: [],
		aliases: [],
	};
}

describe("admin hidden model preview", () => {
	it("only converts hidden models", () => {
		expect(toAdminModelPreview(source(false))).toBeNull();
		expect(toAdminModelPreview(source(true))).toMatchObject({
			modelId: "internal/revalidation-test",
			providers: [{ name: "Test provider", modelId: "test-model" }],
		});
	});
});
