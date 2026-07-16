import { canManagePasskeys } from "./passkeyAuthorization";

describe("canManagePasskeys", () => {
	it.each([
		{ isAdmin: false, rolloutEnabled: false, expected: false },
		{ isAdmin: false, rolloutEnabled: true, expected: false },
		{ isAdmin: true, rolloutEnabled: false, expected: false },
		{ isAdmin: true, rolloutEnabled: true, expected: true },
	])("requires both admin authorization and rollout enablement", ({
		isAdmin,
		rolloutEnabled,
		expected,
	}) => {
		expect(canManagePasskeys({ isAdmin, rolloutEnabled })).toBe(expected);
	});
});
