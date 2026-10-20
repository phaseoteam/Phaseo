import { describe, expect, it } from "vitest";
import { BINDING_KEYS } from "./env.binding-keys";

describe("runtime binding keys", () => {
	it("snapshots the account-deletion worker gate", () => {
		expect(BINDING_KEYS).toContain("ACCOUNT_DELETION_PURGE_ENABLED");
	});

	it("snapshots the request classifiers gate name, so renaming the gate reaches the gateway", () => {
		expect(BINDING_KEYS).toContain("STATSIG_REQUEST_CLASSIFIERS_GATE");
	});
});
