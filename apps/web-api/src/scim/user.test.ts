import { describe, expect, it } from "vitest";
import { SCIM_URNS } from "./constants";
import { ScimProtocolError } from "./errors";
import { parseScimUserInput, userInputToRow } from "./user";

describe("SCIM User validation", () => {
	it("normalizes a core and enterprise User document", () => {
		const input = parseScimUserInput({ userName: " alice@example.com ", name: { givenName: "Alice", familyName: "Smith" }, [SCIM_URNS.enterpriseUser]: { department: "Engineering", costCenter: "ENG-01" } });
		expect(userInputToRow(input)).toMatchObject({ user_name: "alice@example.com", active: true, given_name: "Alice", family_name: "Smith", department: "Engineering", cost_center: "ENG-01" });
	});

	it("rejects missing userName and unknown top-level attributes", () => {
		expect(() => parseScimUserInput({ active: true })).toThrow(ScimProtocolError);
		expect(() => parseScimUserInput({ userName: "alice@example.com", unexpected: true })).toThrow(ScimProtocolError);
	});

	it("accepts but never persists provider-supplied server and write-only attributes", () => {
		const input = parseScimUserInput({ id: "provider-copy", meta: { resourceType: "User" }, userName: "alice@example.com", password: "temporary-secret", groups: [{ value: "engineering", display: "Engineering" }] });
		expect(userInputToRow(input)).not.toHaveProperty("id");
		expect(userInputToRow(input)).not.toHaveProperty("meta");
		expect(userInputToRow(input)).not.toHaveProperty("password");
		expect(userInputToRow(input)).not.toHaveProperty("groups");
	});

	it("enforces Entra-compatible unique multi-value types and primary values", () => {
		expect(() => parseScimUserInput({ userName: "alice@example.com", emails: [{ value: "one@example.com", type: "work" }, { value: "two@example.com", type: "WORK" }] })).toThrow(ScimProtocolError);
		expect(() => parseScimUserInput({ userName: "alice@example.com", phoneNumbers: [{ value: "1", primary: true }, { value: "2", primary: true }] })).toThrow(ScimProtocolError);
	});
});
