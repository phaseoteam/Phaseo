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
});
