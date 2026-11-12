import { describe, expect, it } from "vitest";
import { acpModels, acpModes } from "./acpModels";

describe("ACP model choices", () => {
	it("reads native mode states and configuration-based mode selectors", () => {
		expect(acpModes({ currentModeId: "analysis", availableModes: [{ id: "analysis", name: "Analysis", _meta: { private: true } }] }, undefined)).toEqual([{ id: "analysis", name: "Analysis", default: true }]);
		expect(acpModes(undefined, [{ id: "mode", name: "Mode", category: "mode", type: "select", currentValue: "analysis", options: [{ value: "analysis", name: "Analysis" }] }])).toEqual([{ id: "analysis", name: "Analysis", default: true }]);
	});
	it("flattens grouped catalogs while dropping private metadata and duplicates", () => {
		expect(acpModels([{ id: "model", name: "Model", category: "model", type: "select", currentValue: "b", options: [{ group: "provider", name: "Provider", options: [{ value: "a", name: "A", _meta: { credential: "private" } }, { value: "b", name: "B", description: "Native model" }, { value: "a", name: "Duplicate" }] }] }])).toEqual([{ id: "a", name: "A", default: false }, { id: "b", name: "B", description: "Native model", default: true }]);
		expect(acpModels(undefined)).toEqual([]);
	});
});
