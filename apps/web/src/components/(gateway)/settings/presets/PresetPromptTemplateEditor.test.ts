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
		expect(draft.messages.map((message) => [message.role, message.parts.map((part) => (part.type === "text" ? part.text : `image:${part.name}`))])).toEqual([
			["system", ["You triage tickets for {{company}}."]],
			["user", ["Ticket: {{ticket}}", "image:screenshot"]],
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

		const fixed = { ...draft, tools: "", messages: draft.messages.map((message) => ({ ...message, parts: [{ key: "p", type: "text" as const, text: "{{count}}" }] })) };
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

	it("keeps interleaved parts, every image and fields the editor does not show", () => {
		const template = {
			messages: [{ role: "user", content: [
				{ type: "variable", name: "before" },
				{ type: "text", text: "Compare these:" },
				{ type: "variable", name: "after" },
				{ type: "text", text: "Which changed?" },
			] }],
			variables: { before: { type: "image", required: true }, after: { type: "image", required: true } },
			tool_choice: { type: "function", function: { name: "assign" } },
		};
		expect(buildPromptTemplate(draftFromTemplate(template)).template).toEqual(template);
	});

	it("keeps string defaults of JSON-typed variables valid", () => {
		const template = { messages: [{ role: "user", content: "{{#extra}}{{extra}}{{/extra}}" }], variables: { extra: { type: "any", default: "hello" } } };
		const draft = draftFromTemplate(template);
		expect(draft.defaults.extra).toBe('"hello"');
		const build = buildPromptTemplate(draft);
		expect(build.issues).toEqual([]);
		expect(build.template).toEqual(template);
	});

	it("keeps enum values with commas and spaces, ignoring blank lines", () => {
		const template = { messages: [{ role: "user", content: "{{city}}" }], variables: { city: { type: "enum", enum: ["New York, NY", " Paris "] } } };
		const draft = draftFromTemplate(template);
		expect(buildPromptTemplate(draft).template).toEqual(template);
		draft.variables.city = { ...draft.variables.city, enum: ["New York, NY", "", " Paris "] };
		expect(buildPromptTemplate(draft).template).toEqual(template);
	});
});
