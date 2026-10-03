import { describe, expect, it } from "vitest";
import { acpModels } from "./acpModels";

describe("ACP model choices", () => {
	it("flattens grouped catalogs while dropping private metadata and duplicates", () => {
		expect(acpModels([{ id: "model", name: "Model", category: "model", type: "select", currentValue: "b", options: [{ group: "provider", name: "Provider", options: [{ value: "a", name: "A", _meta: { credential: "private" } }, { value: "b", name: "B", description: "Native model" }, { value: "a", name: "Duplicate" }] }] }])).toEqual([{ id: "a", name: "A", default: false }, { id: "b", name: "B", description: "Native model", default: true }]);
		expect(acpModels(undefined)).toEqual([]);
	});
});
