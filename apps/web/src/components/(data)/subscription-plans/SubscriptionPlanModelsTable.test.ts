import { expect, test } from "vitest";
import { rateLimitText } from "./SubscriptionPlanModelsTable";

test("an empty rate limit shows nothing", () => {
	expect(rateLimitText(null)).toBeNull();
	expect(rateLimitText(undefined)).toBeNull();
	expect(rateLimitText({})).toBeNull();
	expect(rateLimitText([])).toBeNull();
	expect(rateLimitText("  ")).toBeNull();
});

test("a rate limit shows as text", () => {
	expect(rateLimitText("50 messages / 3 hours")).toBe("50 messages / 3 hours");
	expect(rateLimitText({ messages: 50 })).toBe('{"messages":50}');
});
