import { hasPassedLifecycleDate } from "./modelLifecycle";

describe("hasPassedLifecycleDate", () => {
	beforeEach(() => {
		jest.spyOn(Date, "now").mockReturnValue(
			Date.parse("2026-08-26T00:00:00Z"),
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("treats offset-free catalogue timestamps as UTC", () => {
		expect(hasPassedLifecycleDate("2026-08-26T00:00:00")).toBe(true);
		expect(hasPassedLifecycleDate("2026-08-26T00:00:00Z")).toBe(true);
	});

	it("preserves explicit offsets and the lifecycle boundary", () => {
		expect(hasPassedLifecycleDate("2026-08-25T23:59:59Z")).toBe(true);
		expect(hasPassedLifecycleDate("2026-08-26T00:00:01Z")).toBe(false);
		expect(hasPassedLifecycleDate("2026-08-26T01:00:00+01:00")).toBe(true);
	});

	it("rejects missing and invalid dates", () => {
		expect(hasPassedLifecycleDate(null)).toBe(false);
		expect(hasPassedLifecycleDate("not-a-date")).toBe(false);
	});
});
