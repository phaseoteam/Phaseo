import { describe, expect, it } from "vitest";
import { arrangeGroups, validPickerGroups } from "./pickerGroups";

const groups = [{ id: "phaseo" }, { id: "lab:openai" }, { id: "lab:anthropic" }, { id: "lab:google" }];

describe("the picker's groups, as chosen", () => {
	it("puts ordered groups first and keeps the rest in their default order", () => {
		expect(arrangeGroups(groups, { order: ["lab:google", "lab:anthropic"], hidden: [] }).map(group => group.id)).toEqual(["lab:google", "lab:anthropic", "phaseo", "lab:openai"]);
	});
	it("leaves hidden groups out", () => {
		expect(arrangeGroups(groups, { order: [], hidden: ["lab:openai", "phaseo"] }).map(group => group.id)).toEqual(["lab:anthropic", "lab:google"]);
	});
	it("rejects a value an agent sends that isn't one", () => {
		expect(() => validPickerGroups({ order: ["codex"], hide: [] })).toThrow("unknown keys");
		expect(() => validPickerGroups({ order: "codex" })).toThrow("lists of group ids");
		expect(validPickerGroups({ hidden: ["lab:openai", "lab:openai"] })).toEqual({ order: [], hidden: ["lab:openai"] });
	});
});
