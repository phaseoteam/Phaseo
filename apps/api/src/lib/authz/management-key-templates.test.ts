import { describe, expect, it } from "vitest";
import { MANAGEMENT_KEY_TEMPLATES } from "./management-key-templates";

describe("management key templates", () => {
	it("keeps Raycast read-only and maps access levels to explicit scopes", () => {
		expect(MANAGEMENT_KEY_TEMPLATES["raycast-readonly"].scopes).toEqual([
			"credits:read",
			"activity:read",
			"analytics:read",
		]);
		expect(MANAGEMENT_KEY_TEMPLATES["read-only"].scopes.every((scope) => scope.endsWith(":read"))).toBe(true);
		expect(MANAGEMENT_KEY_TEMPLATES["read-write"].scopes.some((scope) => scope.endsWith(":delete"))).toBe(false);
		expect(MANAGEMENT_KEY_TEMPLATES["full-control"].scopes.some((scope) => scope.endsWith(":delete"))).toBe(true);
	});
});
