import { describe, expect, it } from "vitest";
import { workspaceSettings } from "./appSettings";
import { defaultPreferences, validatePreferences } from "./preferences";

describe("workspace settings registry", () => {
	it("advertises only values the workspace accepts, and refuses what it does not", () => {
		for (const [key, spec] of Object.entries(workspaceSettings)) {
			const accepts = (value: unknown) => () => validatePreferences({ ...defaultPreferences, [key]: value });
			if (spec.type === "boolean") { expect(accepts(true), key).not.toThrow(); expect(accepts(false), key).not.toThrow(); }
			if (spec.type === "enum") { for (const value of spec.values) expect(accepts(value), `${key}=${value}`).not.toThrow(); expect(accepts("not-a-value"), key).toThrow(); }
			if (spec.type === "integer") { expect(accepts(spec.minimum), key).not.toThrow(); expect(accepts(spec.maximum), key).not.toThrow(); expect(accepts(spec.maximum + 1), key).toThrow(); }
			if ("nullable" in spec && spec.nullable) expect(accepts(null), key).not.toThrow();
		}
	});

});
