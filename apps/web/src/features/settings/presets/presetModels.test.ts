import { describe, it, expect } from "vitest";
import { toPresetModels } from "./presetModels";

describe("preset model options", () => {
	it("keeps only models the gateway still serves", () => {
		const models = toPresetModels([
			{ model_id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", organisation_id: "anthropic", organisation_name: "Anthropic", gateway_status: "active", gateway_active_provider_count: 1 },
			{ model_id: "openai/old", name: "Old", gateway_status: "deprecated", gateway_active_provider_count: 2 },
			{ model_id: "openai/retired", name: "Retired", gateway_status: "retired", gateway_active_provider_count: 1 },
			{ model_id: "acme/unserved", name: "Unserved", gateway_status: "not_active", gateway_active_provider_count: 0 },
			{ model_id: "acme/soon", name: "Soon", gateway_status: "coming_soon", gateway_active_provider_count: 0 },
			{ model_id: "acme/no-providers", name: "No providers", gateway_status: "active", gateway_active_provider_count: 0 },
		]);
		expect(models.map((model) => model.model_id)).toEqual(["anthropic/claude-haiku-5.5", "openai/old"]);
		expect(models[0]).toMatchObject({ name: "Claude Haiku 5.5", organisation_id: "anthropic", organisation_name: "Anthropic" });
	});
});
