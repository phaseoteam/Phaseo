import { describe, expect, it } from "vitest";
import { filterAllowedScopes, normalizeScopes, normalizeUserCode } from "./service";

describe("OAuth service helpers", () => {
	it("normalizes scope strings and user codes", () => {
		expect(normalizeScopes("openid profile  keys:write")).toEqual([
			"openid",
			"profile",
			"keys:write",
		]);
		expect(normalizeUserCode("abcd efgh")).toBe("ABCD-EFGH");
	});

	it("filters requested scopes against client allowlists", () => {
		const client = {
			allowed_scopes: ["openid", "keys:write"],
		} as any;
		expect(filterAllowedScopes(client, ["openid", "profile", "keys:write"])).toEqual([
			"openid",
			"keys:write",
		]);
	});
});
