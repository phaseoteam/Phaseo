import { describe, expect, it } from "vitest";
import { getContextCapabilityCandidates } from "./context";

describe("getContextCapabilityCandidates", () => {
	it("expands moderation capability aliases", () => {
		expect(getContextCapabilityCandidates("moderations")).toEqual([
			"moderations",
			"moderations.create",
			"text.moderate",
			"moderation",
		]);
		expect(getContextCapabilityCandidates("text.moderate")).toEqual([
			"text.moderate",
			"moderations",
			"moderations.create",
			"moderation",
		]);
	});

	it("expands embeddings capability aliases", () => {
		expect(getContextCapabilityCandidates("embeddings")).toEqual([
			"embeddings",
			"text.embed",
		]);
		expect(getContextCapabilityCandidates("text.embed")).toEqual([
			"text.embed",
			"embeddings",
		]);
	});

	it("keeps unrelated capabilities unchanged", () => {
		expect(getContextCapabilityCandidates("text.generate")).toEqual([
			"text.generate",
		]);
	});
});
