import {
	getModelDetailsHref,
	getModelDisplayName,
	type ModelMetadataMap,
} from "./model-display";

describe("usage model display helpers", () => {
	it("uses canonical metadata for provider model aliases", () => {
		const metadata: ModelMetadataMap = new Map([
			[
				"veo-3.1-fast-generate-001",
				{
					canonicalModelId: "google/veo-3.1-fast",
					modelName: "Veo 3.1 Fast",
					organisationId: "google",
					organisationName: "Google",
				},
			],
		]);

		expect(getModelDisplayName("veo-3.1-fast-generate-001", metadata)).toBe(
			"Google: Veo 3.1 Fast",
		);
		expect(
			getModelDetailsHref("veo-3.1-fast-generate-001", metadata, "google"),
		).toBe("/models/google/veo-3.1-fast");
	});

	it("keeps namespaced model IDs routable without metadata", () => {
		expect(getModelDetailsHref("openai/gpt-5.4")).toBe(
			"/models/openai/gpt-5.4",
		);
	});
});
