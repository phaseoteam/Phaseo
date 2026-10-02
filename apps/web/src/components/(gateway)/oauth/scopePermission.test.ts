import { scopePermissionFor } from "./scopePermission";

describe("scopePermissionFor", () => {
	it("maps built-in scopes to translated resource and action keys", () => {
		expect(scopePermissionFor("openid")).toEqual({
			scope: "openid",
			action: "identity",
			tone: "identity",
		});
		expect(scopePermissionFor("models:read")).toEqual({
			scope: "models:read",
			action: "read",
			resourceKey: "models",
			tone: "read",
		});
		expect(scopePermissionFor("keys:write")).toEqual({
			scope: "keys:write",
			action: "manage",
			resourceKey: "apiKeys",
			tone: "write",
		});
		expect(scopePermissionFor("oauth_clients:delete")).toEqual({
			scope: "oauth_clients:delete",
			action: "delete",
			resourceKey: "oauthApps",
			tone: "delete",
		});
	});

	it("keeps unknown scope identifiers intact for translated fallback copy", () => {
		expect(scopePermissionFor("custom_tools:write")).toEqual({
			scope: "custom_tools:write",
			action: "unknown",
			tone: "write",
		});
	});
});
