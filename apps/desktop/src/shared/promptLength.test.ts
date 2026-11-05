import { expect, it } from "vitest";
import { promptLengthProblem } from "./promptLength";

it("blocks a message past the app's limit and warns near the model's context window", () => {
	expect(promptLengthProblem("hello", 8000)).toBeUndefined();
	expect(promptLengthProblem("x".repeat(100_001), 1_000_000)).toMatchObject({ blocking: true, message: expect.stringContaining("100,001 characters") });
	expect(promptLengthProblem("x".repeat(28_000), 8000, "Small model")).toEqual({ blocking: false, message: "This message is about 7,000 tokens, close to Small model's 8,000-token context window, so it may be cut off or refused." });
	expect(promptLengthProblem("x".repeat(40_000), 8000)?.message).toContain("more than the model's");
	expect(promptLengthProblem("x".repeat(40_000))).toBeUndefined();
});
