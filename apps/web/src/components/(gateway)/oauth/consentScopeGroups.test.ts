import { groupConsentScopes } from "./consentScopeGroups";

describe("groupConsentScopes", () => {
	it("groups CLI permissions by resource without losing scope detail", () => {
		const groups = groupConsentScopes([
			"openid",
			"profile",
			"workspaces:read",
			"workspaces:write",
			"keys:read",
			"keys:delete",
			"guardrails:read",
		]);

		expect(groups.map((group) => group.key)).toEqual([
			"identity",
			"workspaces",
			"keys",
			"guardrails",
		]);
		expect(groups.find((group) => group.key === "keys")?.scopes).toEqual([
			"keys:read",
			"keys:delete",
		]);
	});

	it("deduplicates scopes and keeps unknown resources visible", () => {
		const groups = groupConsentScopes([
			"custom_tools:read",
			"custom_tools:read",
			"custom_tools:write",
		]);

		expect(groups).toEqual([
			{
				key: "other:custom_tools",
				scopes: ["custom_tools:read", "custom_tools:write"],
			},
		]);
	});
});
