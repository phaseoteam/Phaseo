import { expect, test } from "vitest";
import { accessText, rateLimitText } from "./SubscriptionPlanModelsTable";

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

const label = (key: string) => `<${key}>`;
const link = { mapping_status: "confirmed", access_mode: "selectable", access_channel: null, conditions: null };

test("a checked link with nothing else to say shows how it's offered, not a dash", () => {
	expect(accessText(link, label)).toBe("<included>");
	expect(accessText({ ...link, access_mode: "automatic" }, label)).toBe("<automatic>");
	expect(accessText({ ...link, access_mode: "unknown" }, label)).toBe("");
});

test("status, channel and conditions win over the access mode", () => {
	expect(accessText({ ...link, conditions: "Paid with usage credits" }, label)).toBe("Paid with usage credits");
	expect(accessText({ ...link, mapping_status: "unverified" }, label)).toBe("<unverified>");
	expect(accessText({ ...link, mapping_status: "example", access_channel: "Claude Code", conditions: "Beta" }, label)).toBe("<example> · Claude Code · Beta");
});
