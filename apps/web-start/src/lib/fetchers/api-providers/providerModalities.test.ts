import { resolveEffectiveProviderModalities } from "./providerModalities";

describe("resolveEffectiveProviderModalities", () => {
	test("keeps provider-specific modalities when present", () => {
		expect(
			resolveEffectiveProviderModalities({
				providerModel: {
					input_modalities: "text",
					output_modalities: "image",
				},
				canonicalModel: {
					input_types: "text,image",
					output_types: "image,video",
				},
			}),
		).toEqual({
			inputModalities: ["text"],
			outputModalities: ["image"],
		});
	});

	test("falls back to canonical model modalities when provider row is blank", () => {
		expect(
			resolveEffectiveProviderModalities({
				providerModel: {
					input_modalities: null,
					output_modalities: "",
				},
				canonicalModel: {
					input_types: "text,image",
					output_types: "text",
				},
			}),
		).toEqual({
			inputModalities: ["text", "image"],
			outputModalities: ["text"],
		});
	});
});
