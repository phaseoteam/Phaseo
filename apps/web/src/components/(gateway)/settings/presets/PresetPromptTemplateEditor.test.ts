import { buildPromptTemplate, draftFromTemplate, renderPromptPreview } from "./PresetPromptTemplateEditor";

const saved = {
	messages: [
		{ role: "system", content: "You triage tickets for {{company}}." },
		{ role: "user", content: [{ type: "text", text: "Ticket: {{ticket}}" }, { type: "variable", name: "screenshot" }] },
	],
	variables: {
		company: { type: "string", required: true, description: "Company name" },
		tone: { type: "enum", enum: ["formal", "casual"], default: "formal" },
		screenshot: { type: "image" },
	},
	tools: [{ type: "function", function: { name: "assign", parameters: { type: "object" } } }],
};

describe("preset prompt template editor", () => {
	it("round-trips a saved template and drops declarations the messages no longer use", () => {
		const draft = draftFromTemplate(saved);
		expect(draft.messages.map((message) => [message.role, message.text, message.imageVariable])).toEqual([
			["system", "You triage tickets for {{company}}.", ""],
			["user", "Ticket: {{ticket}}", "screenshot"],
		]);
		const build = buildPromptTemplate(draft);
		expect(build.issues).toEqual([]);
		expect(build.template).toEqual({
			messages: saved.messages,
			variables: { company: saved.variables.company, screenshot: saved.variables.screenshot },
			tools: saved.tools,
		});
		expect(build.variables.map(({ name, declared }) => [name, declared])).toEqual([
			["company", true],
			["screenshot", true],
			["ticket", false],
		]);
	});

	it("returns no template when every message is empty", () => {
		const draft = draftFromTemplate({ messages: [{ role: "user", content: "   " }] });
		expect(buildPromptTemplate(draft)).toEqual({ template: null, issues: [], variables: [] });
	});

	it("reports syntax, JSON and default problems before saving", () => {
		const draft = draftFromTemplate({ messages: [{ role: "user", content: "{{#open}} {{count}}" }], variables: { count: { type: "number" } } });
		draft.tools = "[not json";
		draft.defaults = { count: "many" };
		const keywords = buildPromptTemplate(draft).issues.map((issue) => issue.keyword);
		expect(keywords).toEqual(expect.arrayContaining(["template_syntax", "template_invalid"]));

		const fixed = { ...draft, tools: "", messages: draft.messages.map((message) => ({ ...message, text: "{{count}}" })) };
		expect(buildPromptTemplate(fixed).issues.map((issue) => issue.message)).toEqual(['Default for "count" is not a valid number']);
	});

	it("previews with typed test values and lists missing ones", () => {
		const build = buildPromptTemplate(draftFromTemplate(saved));
		const missing = renderPromptPreview(build, {});
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.issues.map((issue) => issue.keyword)).toEqual(["template_variable_required", "template_variable_required"]);

		const preview = renderPromptPreview(build, { company: "Acme", ticket: "Login fails", screenshot: "https://example.com/a.png" });
		expect(preview.ok && preview.messages).toEqual([
			{ role: "system", content: "You triage tickets for Acme." },
			{ role: "user", content: [{ type: "text", text: "Ticket: Login fails" }, { type: "image_url", image_url: { url: "https://example.com/a.png" } }] },
		]);
	});
});
