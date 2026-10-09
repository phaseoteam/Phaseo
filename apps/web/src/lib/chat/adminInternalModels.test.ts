import { adminHiddenModelsToChatModels, adminSourceToChatModels } from "./adminInternalModels";
import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

const source = {
	canonicalApiId: "test/internal", model: { hidden: true, status: "active", name: "Internal", lab_slug: "test" },
	providerRows: [{ provider_id: "test", access_scope: "internal", phaseo_status: "testing", routing_status: "active", provider_availability_status: "available",
		input_modalities: ["text"], output_modalities: ["text"], data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "internal_testing" }] }],
} as unknown as AdminModelSource;

it("makes a hidden internal text route selectable without claiming a price", () => {
	expect(adminSourceToChatModels(source)).toMatchObject([{ modelId: "test/internal", providerId: "test", capabilities: ["text.generate"], isAvailable: true, inputPricePerMillion: null }]);
});
it.each([
	{ access_scope: "public" }, { phaseo_status: "disabled" }, { routing_status: "disabled" },
	{ routing_status: "degraded" }, { provider_id: "stealth" },
	{ provider_availability_status: "removed" }, { effective_to: "2020-01-01" },
	{ data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "disabled" }] },
	{ data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "degraded" }] },
	{ data_api_provider_model_capabilities: [] },
])("rejects ineligible internal routes %j", (override) => {
	expect(adminSourceToChatModels({ ...source, providerRows: [{ ...source.providerRows[0], ...override }] })).toEqual([]);
});
it("does not turn public or retired model records into admin chat entries", () => {
	expect(adminSourceToChatModels({ ...source, model: { ...source.model, hidden: false } })).toEqual([]);
	expect(adminSourceToChatModels({ ...source, model: { ...source.model, status: "retired" } })).toEqual([]);
});

describe("batched hidden models", () => {
	const route = (modelId: string, providerId: string) => ({ ...source.providerRows[0], model_id: modelId, provider_id: providerId });
	it("assigns each model its own routes and its -fast and -flex variants", () => {
		const models = adminHiddenModelsToChatModels({
			models: [
				{ model_id: "test/a", hidden: true, status: "active", name: "A", lab_slug: "test", organisation: { name: "Test lab" } },
				{ model_id: "test/b", hidden: true, status: "active", name: "B", lab_slug: "test" },
			],
			providerRows: [route("test/a", "p1"), route("test/a-fast", "p2"), route("test/a-flex", "p3"), route("test/b", "p4"), route("test/other", "p5")],
		});
		expect(models.map((model) => [model.modelId, model.providerId])).toEqual([
			["test/a", "p1"], ["test/a", "p2"], ["test/a", "p3"], ["test/b", "p4"],
		]);
		expect(models[0]).toMatchObject({ modelName: "A", organisationName: "Test lab" });
	});
	it("applies the same eligibility rules as the per-model source", () => {
		expect(adminHiddenModelsToChatModels({
			models: [{ model_id: "test/retired", hidden: true, status: "retired", name: "Retired", lab_slug: "test" }],
			providerRows: [route("test/retired", "p1")],
		})).toEqual([]);
		expect(adminHiddenModelsToChatModels({ models: [{ model_id: "test/a", hidden: true, status: "active" }] })).toEqual([]);
	});
});
