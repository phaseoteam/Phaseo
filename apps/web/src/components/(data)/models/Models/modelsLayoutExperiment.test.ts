import { describe, it, expect } from "vitest";
import { selectModelsLayout } from "./modelsLayoutExperiment";

describe("selectModelsLayout", () => {
	it.each([undefined, null, { value: {} }, { value: { layout: "list" } },
		{ groupName: "control", value: { layout: "cards" } },
		{ groupName: "test", value: { layout: "unknown" } }])("defaults to cards for %p", (experiment) => {
		expect(selectModelsLayout(experiment)).toBe("cards");
	});
	it("selects list only for an assigned list parameter", () => {
		expect(selectModelsLayout({ groupName: "List", value: { layout: "list" } })).toBe("list");
	});
});
