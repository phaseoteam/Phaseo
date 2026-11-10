import { describe, expect, it } from "vitest";
import { conciseConditionLabel } from "@/components/(data)/model/pricing/pricingHelpers";
import { audienceLabel, isAudienceCondition, withoutAudienceConditions } from "./promotionAudience";

const claudeCode = { op: "eq", path: "client_id", value: "claude-code" };
const usOnly = { op: "eq", path: "inference_geo", value: "us" };

describe("promotion audience conditions", () => {
	it("recognises the calling-app condition and nothing else", () => {
		expect(isAudienceCondition(claudeCode)).toBe(true);
		expect(isAudienceCondition(usOnly)).toBe(false);
		expect(withoutAudienceConditions([usOnly, claudeCode])).toEqual([usOnly]);
	});

	it("names the app, falling back to its id", () => {
		expect(audienceLabel([claudeCode])).toBe("Claude Code");
		expect(audienceLabel([{ op: "in", path: "client_id", value: ["claude-code", "codex"] }])).toBe("Claude Code or Codex");
		expect(audienceLabel([{ op: "eq", path: "client_id", value: "some-agent" }])).toBe("some-agent");
		expect(audienceLabel([usOnly])).toBeUndefined();
	});

	it("labels an app-limited price by its app instead of the raw condition", () => {
		expect(conciseConditionLabel([claudeCode])).toBe("In Claude Code");
		expect(conciseConditionLabel([{ op: "eq", path: "cache_ttl", value: "5m" }, claudeCode])).toBe("5m Cache TTL · In Claude Code");
	});
});
