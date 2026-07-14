import { describe, expect, it } from "vitest";
import { MANAGEMENT_KEY_TEMPLATES } from "./management-key-templates";

describe("management key templates", () => {
	it("maps access levels to explicit scopes", () => {
		expect(MANAGEMENT_KEY_TEMPLATES["read-only"].scopes.every((scope) => scope.endsWith(":read"))).toBe(true);
		expect(MANAGEMENT_KEY_TEMPLATES["read-write"].scopes.some((scope) => scope.endsWith(":delete"))).toBe(false);
		expect(MANAGEMENT_KEY_TEMPLATES["full-control"].scopes.some((scope) => scope.endsWith(":delete"))).toBe(true);
	});
});
