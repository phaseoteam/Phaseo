import { describe, expect, it } from "vitest";
import { formatUsd } from "./entityCardFormat";

describe("formatUsd", () => {
	it("shows a published price with every digit it was published with, never rounded", () => {
		expect(formatUsd(0.0004255)).toBe("$0.0004255");
		expect(formatUsd(0.01049)).toBe("$0.01049");
		expect(formatUsd(2)).toBe("$2");
		expect(formatUsd(12.5)).toBe("$12.50");
		expect(formatUsd(0.075)).toBe("$0.075");
		expect(formatUsd(1234.5)).toBe("$1,234.50");
		expect(formatUsd(4.2e-7)).toBe("$0.00000042");
	});

	it("drops floating-point noise without touching the price", () => {
		expect(formatUsd(0.1 + 0.2)).toBe("$0.30");
	});

	it("returns null for missing or invalid prices and $0 for free", () => {
		expect(formatUsd(0)).toBe("$0");
		expect(formatUsd(null)).toBeNull();
		expect(formatUsd(Number.NaN)).toBeNull();
		expect(formatUsd(-1)).toBeNull();
	});
});
