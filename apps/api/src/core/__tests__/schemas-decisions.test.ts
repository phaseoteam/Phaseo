import { describe, expect, it } from "vitest";
import { DecisionsSchema } from "../schemas";

describe("DecisionsSchema", () => {
	it("accepts OpenAI predicates, boolean choices, named score levels and safety identifiers", () => {
		expect(DecisionsSchema.safeParse({
			model: "openai/gpt-6-luna", input: [{ role: "user", type: "message", content: "Account" }], safety_identifier: "user-1",
			questions: [
				{ type: "predicate", instructions: "Eligible?" },
				{ type: "choice", instructions: "Choose", choices: [{ value: true }, { value: "true" }] },
				{ type: "score", instructions: "Rate", levels: [{ label: "Low" }, { label: "High", description: "High impact" }] },
			],
		}).success).toBe(true);
	});
	it("allows 128 native image parts across messages and rejects 129", () => {
		const base = { model: "openai/gpt-6-luna", questions: [{ type: "predicate", instructions: "Visible?" }] };
		const part = { type: "input_image", image_url: "data:image/png;base64,AQID", detail: "high" };
		expect(DecisionsSchema.safeParse({ ...base, input: [{ role: "user", content: Array(128).fill(part) }] }).success).toBe(true);
		expect(DecisionsSchema.safeParse({ ...base, input: [{ role: "user", content: Array(129).fill(part) }] }).success).toBe(false);
	});
	it.each([
		{ input: [{ role: "assistant", content: "Wrong role" }] },
		{ input: [{ role: "user", content: [{ type: "input_image", image_url: "https://example.com/a.png" }] }] },
		{ input: [{ role: "user", content: [{ type: "input_file", file_id: "file_1" }] }] },
		{ state: "Mixed formats" },
		{ questions: [{ type: "choice", instructions: "Choose", choices: [{ value: true }, { value: true }] }] },
	])("rejects unsupported or ambiguous native fields: %j", override => {
		expect(DecisionsSchema.safeParse({ model: "openai/gpt-6-luna", input: "Account", questions: [{ type: "predicate", instructions: "Eligible?" }], ...override }).success).toBe(false);
	});
	it("accepts embedded decision images and rejects URLs and unsupported formats", () => {
		const base = { state: "Photo", questions: { visible: { type: "noul", instructions: "Visible?" } } };
		expect(DecisionsSchema.safeParse({ ...base, images: ["data:image/png;base64,AQID", { content_type: "image/jpeg", base64: "AQID" }] }).success).toBe(true);
		for (const images of [["https://example.com/a.png"], ["data:image/gif;base64,AQID"], Array(5).fill("data:image/png;base64,AQID")]) {
			expect(DecisionsSchema.safeParse({ ...base, images }).success).toBe(false);
		}
	});
	it("accepts TypeSafe's keyed Noul, Choice, and Score question map", () => {
		const parsed = DecisionsSchema.safeParse({
			state: { account_type: "startup" },
			questions: {
				is_startup: {
					type: "noul",
					instructions: "Is this a startup?",
				},
				segment: {
					type: "choice",
					instructions: "Which segment applies?",
					criteria: { startup: "Small company.", enterprise: "Large company." },
				},
				adoption: {
					type: "score",
					instructions: "How strong is adoption?",
					criteria: ["0 = none", "1 = some"],
				},
			},
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.model).toBe("typesafe/jev-1.13.0");
			expect(Array.isArray(parsed.data.questions)).toBe(false);
		}
	});

	it("rejects array questions and malformed typed question criteria", () => {
		expect(DecisionsSchema.safeParse({
			state: "account",
			questions: [],
		}).success).toBe(false);
		expect(DecisionsSchema.safeParse({
			state: "account",
			questions: {
				segment: {
					type: "choice",
					instructions: "Which segment applies?",
					criteria: {},
				},
			},
		}).success).toBe(false);
	});
});
