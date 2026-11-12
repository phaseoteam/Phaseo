import { describe, expect, it } from "vitest";
import { eventContent } from "./notification-delivery";
import { getModelSubstitutionContent, renderModelSubstitutionEmail } from "./model-substitution";

const payload = {
	title: "Model replaced: Old <Model>",
	workspace_name: "Acme",
	model_id: "lab/old",
	model_name: "Old <Model>",
	replacement_model_id: "lab/new",
	replacement_model_name: "New Model",
	source: "approved",
};

describe("model substitution notice", () => {
	it("says which model now answers and where to change it", () => {
		const content = getModelSubstitutionContent(payload);
		expect(content.title).toBe("Model replaced: Old <Model>");
		expect(content.message).toContain("No provider serves Old <Model> any more, so requests for it from Acme are now answered by New Model (lab/new), the replacement approved for it.");
		expect(content.settingsUrl).toBe("https://phaseo.app/settings/routing");
		expect(content.replacementModelUrl).toBe("https://phaseo.app/models/lab/new");
		expect(getModelSubstitutionContent({ ...payload, source: "workspace" }).message).toContain("the replacement your workspace chose");
	});

	it("escapes model names in the email", () => {
		const email = renderModelSubstitutionEmail(payload);
		expect(email.subject).toBe("Model replaced: Old <Model>");
		expect(email.html).toContain("Old &lt;Model&gt;");
		expect(email.html).not.toContain("Old <Model>");
		expect(email.text).toContain("Review routing settings: https://phaseo.app/settings/routing");
	});

	it("is sent to routed destinations with the same text", () => {
		const content = eventContent({ id: "evt_1", kind: "model_substitution", subject: null, workspace_id: "ws_1", payload, created_at: "2026-10-13T00:00:00Z" });
		expect(content).toEqual({
			title: "Model replaced: Old <Model>",
			message: getModelSubstitutionContent(payload).message,
			settingsUrl: "https://phaseo.app/settings/routing",
		});
	});
});
