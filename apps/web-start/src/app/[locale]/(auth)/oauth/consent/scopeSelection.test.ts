import { validateSelectedAuthorizationScopes } from "./scopeSelection";

describe("validateSelectedAuthorizationScopes", () => {
	it("keeps the user's narrowed consent subset", () => {
		expect(validateSelectedAuthorizationScopes(
			["openid", "models:read"],
			["openid", "models:read", "keys:write", "keys:delete"],
		)).toEqual({ ok: true, scopes: ["openid", "models:read"] });
	});

	it("rejects empty and expanded scope selections", () => {
		expect(validateSelectedAuthorizationScopes([], ["openid"])).toEqual({
			ok: false,
			error: "Select at least one permission to authorize",
		});
		expect(validateSelectedAuthorizationScopes(["openid", "keys:delete"], ["openid"])).toEqual({
			ok: false,
			error: "Selected permissions do not match the authorization request",
		});
	});
});
