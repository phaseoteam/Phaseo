import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadRelationships } from "../src/generated/relationships";

describe("generated relationships module", () => {
	it("matches relationships.json (run `pnpm --filter @phaseo/db build:relationships` after regenerating)", () => {
		const json = JSON.parse(readFileSync(new URL("../src/generated/relationships.json", import.meta.url), "utf8"));
		expect(loadRelationships()).toEqual(json);
	});

	it("parses once and returns the same object afterwards", () => {
		expect(loadRelationships()).toBe(loadRelationships());
	});
});
