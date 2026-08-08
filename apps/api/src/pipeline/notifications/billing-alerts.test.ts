import { describe, expect, it } from "vitest";

import { cardExpiresWithinDays } from "./billing-alerts";

describe("cardExpiresWithinDays", () => {
	it("includes cards whose expiration month ends within the warning window", () => {
		expect(cardExpiresWithinDays({
			expMonth: 8,
			expYear: 2026,
			now: new Date("2026-08-07T00:00:00.000Z"),
			days: 30,
		})).toBe(true);
	});

	it("excludes cards outside the warning window and already expired cards", () => {
		expect(cardExpiresWithinDays({
			expMonth: 10,
			expYear: 2026,
			now: new Date("2026-08-07T00:00:00.000Z"),
			days: 30,
		})).toBe(false);
		expect(cardExpiresWithinDays({
			expMonth: 7,
			expYear: 2026,
			now: new Date("2026-08-07T00:00:00.000Z"),
			days: 30,
		})).toBe(false);
	});
});
