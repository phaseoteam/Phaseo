import { describe, expect, it } from "vitest";
import { validateFactoryPatch } from "./appConfig";

describe("Factory settings from an agent", () => {
	const repos = ["acme/app"];
	it("accepts what the Settings page offers", () => {
		expect(validateFactoryPatch({ pollMinutes: 15, independentReview: true, passOnActivity: false, stallMinutes: 0, stallGraceMinutes: 30, showRepo: "acme/app", trustedBots: [" ci-bot ", ""], agentEfforts: { "claude": "high" } }, repos))
			.toEqual({ pollMinutes: 15, independentReview: true, passOnActivity: false, stallMinutes: 0, stallGraceMinutes: 30, showRepo: "acme/app", trustedBots: ["ci-bot"], agentEfforts: { claude: "high" } });
	});
	it("refuses values the page could never save, and settings it does not know", () => {
		expect(() => validateFactoryPatch({ pollMinutes: 0 }, repos)).toThrow("pollMinutes");
		expect(() => validateFactoryPatch({ pollMinutes: 2.5 }, repos)).toThrow("pollMinutes");
		expect(() => validateFactoryPatch({ showRepo: "someone/else" }, repos)).toThrow("showRepo");
		expect(() => validateFactoryPatch({ independentReview: "yes" }, repos)).toThrow("independentReview");
		expect(() => validateFactoryPatch({ playbooks: { chores: {} } }, repos)).toThrow("issue and pull");
		expect(() => validateFactoryPatch({ repos: [] }, repos)).toThrow("not a Factory setting");
	});
});
