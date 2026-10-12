import { describe, expect, it } from "vitest";
import { grokModels } from "./grokModels";

describe("Grok native model metadata", () => {
	it("drops invalid entries, duplicates and private metadata", () => {
		expect(grokModels({ currentModelId: "b", availableModels: [null, { modelId: "" }, { modelId: "b", name: "B", _meta: { token: "private", reasoningEffort: "high", reasoningEfforts: [{ id: "high", label: "High" }, { id: "high", description: "Duplicate" }, { id: "" }] } }, { modelId: "b", name: "Duplicate" }] })).toEqual([{ id: "b", name: "B", default: true, reasoningEfforts: [{ id: "high", description: "High" }], defaultReasoningEffort: "high" }]);
	});
	it("bounds model catalogs and does not invent a current model", () => {
		expect(grokModels({ availableModels: [{ modelId: "a", name: "A" }] })).toEqual([{ id: "a", name: "A", default: false }]);
		expect(() => grokModels({ availableModels: Array(1001).fill({ modelId: "a", name: "A" }) })).toThrow("limit");
		expect(grokModels(undefined)).toEqual([]);
	});
});
