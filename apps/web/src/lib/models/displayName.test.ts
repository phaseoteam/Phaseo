import { formatModelDisplayName } from "./displayName";

describe("formatModelDisplayName", () => {
	it("preserves free variants when a canonical model name is supplied", () => {
		expect(
			formatModelDisplayName("Laguna M.1", "poolside/laguna-m.1:free"),
		).toBe("Laguna M.1 (free)");
	});

	it("preserves numeric variants when a canonical model name is supplied", () => {
		expect(formatModelDisplayName("Model Alpha", "acme/model-alpha:3")).toBe(
			"Model Alpha (3)",
		);
	});
});
