import { describe, expect, it } from "vitest";
import { collectFormAnswer, fieldActive, formAnswerError } from "./agentForms";
import type { AgentForm } from "./agentForms";
import { validateCommand } from "./workspace";

const form: AgentForm = { id: "form", title: "Scope", fields: [
	{ key: "enabled", type: "boolean", default: false, required: true },
	{ key: "count", type: "integer", default: 2, minimum: 1, maximum: 5, when: [{ key: "enabled", op: "eq", value: true }] },
	{ key: "details", type: "string", required: true, when: [{ key: "count", op: "neq", value: 2 }] },
	{ key: "profile", type: "string", hidden: true, default: "local" },
	{ key: "choices", type: "multiselect", required: true, maxItems: 2, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
] };
describe("typed agent forms", () => {
	it("applies active defaults and cascades visibility without sending inactive answers", () => {
		expect(collectFormAnswer(form, { count: 4, details: "Ignored", choices: ["a"] })).toEqual({ enabled: false, profile: "local", choices: ["a"] });
		expect(collectFormAnswer(form, { enabled: true, choices: ["a"] })).toEqual({ enabled: true, count: 2, profile: "local", choices: ["a"] });
		expect(collectFormAnswer(form, { enabled: true, count: undefined, choices: ["a"] })).toEqual({ enabled: true, profile: "local", choices: ["a"] });
		expect(fieldActive(form.fields[2], {})).toBe(false);
	});
	it("validates required values, closed selections, numbers and inactive fields", () => {
		expect(formAnswerError(form, { enabled: false, profile: "local", choices: ["a"] })).toBeUndefined();
		expect(formAnswerError(form, { enabled: false, count: 3, choices: ["a"] })).toContain("inactive");
		expect(formAnswerError(form, { enabled: true, count: 2.5, choices: ["a"] })).toContain("integer");
		expect(formAnswerError(form, { enabled: false, choices: ["outside"] })).toContain("selections");
		expect(formAnswerError(form, { enabled: true, count: 3, choices: ["a"] })).toContain("details");
	});
	it("requires explicit acknowledgement for external steps and treats prototype-like keys as values", () => {
		const external: AgentForm = { id: "external", title: "Confirm", fields: [{ type: "external", key: "link", url: "https://example.test" }, { type: "string", key: "__proto__", default: "safe" }] };
		expect(formAnswerError(external, {})).toContain("Confirm link");
		const answer = collectFormAnswer(external, { link: true });
		expect(Object.hasOwn(answer, "__proto__")).toBe(true); expect(answer.__proto__).toBe("safe");
		expect(formAnswerError(external, answer)).toBeUndefined();
	});
	it("validates typed IPC answers and accepts explicit cancellation", () => {
		expect(validateCommand({ type: "form-answer", id: "task", requestId: "request", answer: null })).toMatchObject({ answer: null });
		expect(validateCommand({ type: "form-answer", id: "task", requestId: "request", answer: { value: false, count: 1, choices: [] } })).toMatchObject({ answer: { value: false } });
		for (const value of [Infinity, NaN, {}, [false]]) expect(() => validateCommand({ type: "form-answer", id: "task", requestId: "request", answer: { value } })).toThrow("Invalid form answer");
	});
});
