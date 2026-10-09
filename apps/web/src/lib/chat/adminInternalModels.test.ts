import { adminSourceToChatModels } from "./adminInternalModels";
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
