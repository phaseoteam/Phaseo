import { compareVersions, diffLines, versionMessages } from "./presetVersionDiff";

describe("version messages", () => {
	it("reads string and part content, showing image variables by name", () => {
		expect(versionMessages({
			messages: [
				{ role: "system", content: "Be brief." },
				{ role: "user", content: [{ type: "text", text: "Describe" }, { type: "variable", name: "photo" }] },
			],
		})).toEqual([
			{ role: "system", text: "Be brief." },
			{ role: "user", text: "Describe\n[image: photo]" },
		]);
		expect(versionMessages(null)).toEqual([]);
		expect(versionMessages({ messages: "nope" })).toEqual([]);
	});
});

describe("line diff", () => {
	it("keeps shared lines and marks removed and added ones in order", () => {
		expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "removed", text: "b" },
			{ kind: "added", text: "B" },
			{ kind: "same", text: "c" },
			{ kind: "added", text: "d" },
		]);
	});

	it("handles empty text on either side", () => {
		expect(diffLines("", "x")).toEqual([{ kind: "added", text: "x" }]);
		expect(diffLines("x", "")).toEqual([{ kind: "removed", text: "x" }]);
		expect(diffLines("", "")).toEqual([]);
	});

	it("compares very long texts as a whole instead of building a huge table", () => {
		const long = Array.from({ length: 500 }, (_, index) => `line ${index}`).join("\n");
		const changed = diffLines(long, `${long}\nmore`);
		expect(changed.filter((line) => line.kind === "removed")).toHaveLength(500);
		expect(changed.filter((line) => line.kind === "added")).toHaveLength(501);
		expect(diffLines(long, long).every((line) => line.kind === "same")).toBe(true);
	});
});

describe("comparing a version with the default", () => {
	const base = {
		models: ["openai/gpt-a", "anthropic/claude-b"],
		prompt: { messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "Ticket: {{ticket}}" }], variables: { ticket: { type: "string" } } },
	};

	it("reports an identical version as identical, ignoring key order", () => {
		const same = { models: [...base.models], prompt: { variables: { ticket: { type: "string" } }, messages: base.prompt.messages } };
		const result = compareVersions(base, same);
		expect(result.identical).toBe(true);
		expect(result.messages.map((message) => message.status)).toEqual(["same", "same"]);
	});

	it("lists added and removed models and a changed fallback order", () => {
		expect(compareVersions(base, { ...base, models: ["anthropic/claude-b", "openai/gpt-a"] }).models).toEqual({ added: [], removed: [], reordered: true });
		expect(compareVersions(base, { ...base, models: ["openai/gpt-a", "google/gemini-c"] }).models).toEqual({ added: ["google/gemini-c"], removed: ["anthropic/claude-b"], reordered: false });
	});

	it("diffs changed messages and marks added, removed and re-roled ones", () => {
		const result = compareVersions(base, {
			models: base.models,
			prompt: { messages: [{ role: "developer", content: "Be brief." }, { role: "user", content: "Ticket: {{ticket}}\nReply in English." }, { role: "user", content: "Thanks" }], variables: { ticket: { type: "string" } } },
		});
		expect(result.identical).toBe(false);
		expect(result.messages[0]).toMatchObject({ status: "changed", role: "developer", previousRole: "system" });
		expect(result.messages[1].lines).toEqual([{ kind: "same", text: "Ticket: {{ticket}}" }, { kind: "added", text: "Reply in English." }]);
		expect(result.messages[2]).toMatchObject({ status: "added", lines: [{ kind: "added", text: "Thanks" }] });
		expect(compareVersions(base, { models: base.models, prompt: { messages: [base.prompt.messages[0]], variables: base.prompt.variables } }).messages[1]).toMatchObject({ status: "removed" });
	});

	it("notices template changes outside the messages without diffing them", () => {
		const result = compareVersions(base, { models: base.models, prompt: { ...base.prompt, variables: { ticket: { type: "string", required: true } } } });
		expect(result.otherTemplateChanged).toBe(true);
		expect(result.identical).toBe(false);
	});

	it("compares against a default version that has no template", () => {
		const result = compareVersions({ models: base.models, prompt: null }, base);
		expect(result.messages.map((message) => message.status)).toEqual(["added", "added"]);
	});
});
