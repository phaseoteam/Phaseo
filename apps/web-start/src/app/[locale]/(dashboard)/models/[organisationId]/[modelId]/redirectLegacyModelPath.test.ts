import { getLegacyModelRedirectPath } from "./redirectLegacyModelPath";

describe("getLegacyModelRedirectPath", () => {
	it("redirects the default locale to the canonical model page", () => {
		expect(getLegacyModelRedirectPath("openai/gpt-5", "en-GB", {})).toBe(
			"/models/openai/gpt-5",
		);
	});

	it("preserves non-default locale prefixes and search parameters", () => {
		expect(
			getLegacyModelRedirectPath("openai/gpt-5", "de-DE", {
				view: "table",
				tag: ["fast", "cheap"],
			}),
		).toBe("/de-DE/models/openai/gpt-5?view=table&tag=fast&tag=cheap");
	});
});
