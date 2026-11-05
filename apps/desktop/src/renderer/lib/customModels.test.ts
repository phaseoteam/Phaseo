import { expect, it } from "vitest";
import { addCustomModel, validCustomModels, withCustomModels, type CustomModel } from "./customModels";

it("adds custom models to their own agent's list, after the catalog, once", () => {
	const custom: CustomModel[] = [{ harness: "codex", id: "gpt-7-preview", name: "GPT-7 preview" }, { harness: "codex", id: "gpt-6" }, { harness: "claude", id: "opus-6" }];
	const catalog = [{ id: "gpt-6", name: "GPT-6" }];
	expect(withCustomModels(catalog, custom, "codex").map(model => [model.id, model.name])).toEqual([["gpt-6", "GPT-6"], ["gpt-7-preview", "GPT-7 preview"]]);
	expect(withCustomModels(catalog, [], "codex")).toBe(catalog);
});

it("explains an entry it cannot add", () => {
	const list: CustomModel[] = [{ harness: "codex", id: "gpt-7" }];
	expect(addCustomModel(list, { harness: "codex", id: "  " })).toMatch(/Enter/);
	expect(addCustomModel(list, { harness: "codex", id: "gpt 7" })).toMatch(/no spaces/);
	expect(addCustomModel(list, { harness: "codex", id: "gpt-7" })).toMatch(/already/);
	expect(addCustomModel(list, { harness: "claude", id: " gpt-7 ", name: " " })).toEqual([...list, { harness: "claude", id: "gpt-7" }]);
});

it("checks a whole list set from outside", () => {
	expect(validCustomModels([{ harness: "codex", id: "gpt-7" }, { harness: "phaseo", id: "openai/gpt-7", name: "GPT-7" }], ["codex", "phaseo"])).toHaveLength(2);
	expect(() => validCustomModels([{ harness: "nope", id: "x" }], ["codex"])).toThrow(/harness/);
	expect(() => validCustomModels([{ harness: "codex", id: "a" }, { harness: "codex", id: "a" }], ["codex"])).toThrow(/already/);
	expect(() => validCustomModels("gpt-7", ["codex"])).toThrow(/list/);
});
