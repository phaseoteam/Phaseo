import {
	buildGeneratedModelDescription,
	buildModelPageMetadataDescription,
	getExplicitModelDescription,
	markdownToPlainText,
	resolveModelDescription,
} from "./modelDescription";

describe("modelDescription", () => {
	it("prefers an explicit description from model details", () => {
		const description = getExplicitModelDescription({
			model_details: [
				{ detail_name: "description", detail_value: "  Strong coding model for fast edits.  " },
			],
		});

		expect(description).toBe("Strong coding model for fast edits.");
	});

	it("prefers a top-level description before model details", () => {
		const description = getExplicitModelDescription({
			description: " Flagship reasoning model for deep technical work. ",
			model_details: [
				{ detail_name: "description", detail_value: "Older fallback." },
			],
		});

		expect(description).toBe("Flagship reasoning model for deep technical work.");
	});

	it("generates a fallback description when no explicit description exists", () => {
		const description = buildGeneratedModelDescription({
			model_id: "acme/alpha-1",
			name: "Alpha 1",
			organisation_id: "acme",
			organisation: { name: "Acme" },
			input_types: "text,image",
			output_types: "text",
		});

		expect(description).toContain("Alpha 1 is an AI model from Acme.");
		expect(description).toContain("It accepts text and image inputs and produces text outputs.");
		expect(description).not.toContain("compare providers, pricing, benchmarks, routing support, and availability");
	});

	it("resolves to explicit descriptions before generated ones", () => {
		const description = resolveModelDescription({
			model_id: "acme/alpha-1",
			name: "Alpha 1",
			organisation: { name: "Acme" },
			model_details: [
				{ detail_name: "description", detail_value: "Acme's flagship reasoning model." },
			],
		});

		expect(description).toBe("Acme's flagship reasoning model.");
	});

	it("builds bounded metadata descriptions", () => {
		const description = buildModelPageMetadataDescription({
			modelDescription:
				"Alpha 1 is an AI model from Acme with strong text and image reasoning for product, research, and coding workflows.",
			suffix:
				"Track latency, uptime, provider coverage, and request quality signals on Phaseo.",
			fallback: "Fallback description.",
			maxLength: 140,
		});

		expect(description.length).toBeLessThanOrEqual(143);
		expect(description).toContain("Alpha 1");
	});

	it("converts markdown descriptions to plain text for metadata", () => {
		const plainText = markdownToPlainText(
			"Performance on par with [OpenAI o1](/openai/o1), with **open** reasoning tokens.",
		);

		expect(plainText).toBe(
			"Performance on par with OpenAI o1, with open reasoning tokens.",
		);
	});
});
