import { describe, expect, it } from "vitest";
import { getModelDeprecationContent, getModelDeprecationTemplateVariables, renderModelDeprecationEmail } from "./model-deprecation";

describe("model deprecation email", () => {
	const payload = {
		model_id: "openai/old-model",
		model_name: "Old <Model>",
		deprecation_date: "2026-09-08T00:00:00.000Z",
		retirement_date: "2026-10-01T00:00:00.000Z",
		replacement_model_id: "openai/new-model",
		replacement_model_name: "New Model",
	};

	it("renders an actionable upcoming notice with replacement links", () => {
		const now = new Date("2026-09-01T00:00:00.000Z");
		const content = getModelDeprecationContent(payload, now);
		const email = renderModelDeprecationEmail(payload, now);

		expect(content.title).toBe("Model deprecation: Old <Model>");
		expect(content.message).toContain("scheduled for deprecation on September 8, 2026");
		expect(content.message).toContain("Recommended replacement: New Model (openai/new-model)");
		expect(content.message).toContain("retire on October 1, 2026");
		expect(content.emailMessage).toBe("Old <Model> is scheduled for deprecation on September 8, 2026. The model is scheduled to retire on October 1, 2026.");
		expect(content.replacementModelName).toBe("New Model");
		expect(email.subject).toBe(content.title);
		expect(email.html).toContain("Old &lt;Model&gt;");
		expect(email.html).toContain("Compare models");
		expect(email.html).toContain("View recommended model");
		expect(email.html).toContain("-webkit-text-size-adjust:100%");
		expect(email.html).toContain("white-space:nowrap");
		expect(email.text).toContain("Compare models: https://phaseo.app/compare?models=openai%2Fold-model&models=openai%2Fnew-model");
		expect(email.text).toContain("View recommended model: https://phaseo.app/models/openai/new-model");
	});

	it("provides template variables for comparison and recommended model links", () => {
		const variables = getModelDeprecationTemplateVariables(payload, new Date("2026-09-01T00:00:00.000Z"));
		expect(variables).toMatchObject({
			replacement_model_url: "https://phaseo.app/models/openai/new-model",
			compare_url: "https://phaseo.app/compare?models=openai%2Fold-model&models=openai%2Fnew-model",
		});
	});

	it("renders an immediate notice when the date has passed", () => {
		const content = getModelDeprecationContent({ model_name: "Old Model", deprecation_date: "2026-08-31T00:00:00.000Z" }, new Date("2026-09-01T00:00:00.000Z"));
		expect(content.message).toContain("Old Model has been deprecated as of August 31, 2026.");
	});
});
