import { describe, expect, it } from "vitest";
import { shouldPersistGatewayAudit } from "./audit";

describe("testing-mode audit persistence", () => {
	it("keeps synthetic requests out of production usage tables", () => {
		expect(shouldPersistGatewayAudit({ testingMode: true })).toBe(false);
	});

	it("preserves normal request persistence", () => {
		expect(shouldPersistGatewayAudit({ testingMode: false })).toBe(true);
		expect(shouldPersistGatewayAudit({})).toBe(true);
	});
	it("persists billable administrator internal requests even when pricing is unavailable", () => {
		expect(shouldPersistGatewayAudit({ testingMode: true, billableInternalTesting: true })).toBe(true);
		expect(shouldPersistGatewayAudit({ testingMode: true, billableInternalTesting: false })).toBe(false);
	});
});
