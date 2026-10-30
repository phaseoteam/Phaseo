import { getTypoMatchScore } from "./Search.matching";

describe("search typo matching", () => {
	const item = { searchTokens: ["anthropic", "claude"] };

	it("matches a single insertion, deletion, substitution, or transposition", () => {
		expect(getTypoMatchScore(item, "anthoropic")).toBe(240);
		expect(getTypoMatchScore(item, "anthropicx")).toBe(240);
		expect(getTypoMatchScore(item, "anthropik")).toBe(240);
		expect(getTypoMatchScore(item, "claud")).toBe(240);
	});

	it("limits each typo to one edit while matching phrases", () => {
		expect(getTypoMatchScore(item, "antr0pic")).toBe(0);
		expect(getTypoMatchScore(item, "clad")).toBe(0);
		expect(getTypoMatchScore(item, "claud anthoropic")).toBe(230);
		expect(getTypoMatchScore(item, "claud antr0pic")).toBe(0);
	});
});
