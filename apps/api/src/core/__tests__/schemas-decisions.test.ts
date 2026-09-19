import { describe, expect, it } from "vitest";
import { DecisionsSchema } from "../schemas";

describe("DecisionsSchema", () => {
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
