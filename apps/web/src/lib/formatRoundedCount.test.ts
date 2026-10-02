import { formatCompactAxisTick, formatRoundedCount } from "./formatRoundedCount";

describe("formatRoundedCount", () => {
	it.each([
		[0, "0"],
		[999, "999"],
		[999.9, "999"],
		[999_999, "999K"],
		[49_910_627, "49M"],
		[25_000_000, "25M"],
		[1_999_999_999, "1B"],
		[1e12, "1T"],
		[1e15, "1Qa"],
		[1e18, "1Qi"],
	])("formats %s as %s without rounding up", (value, expected) => {
		expect(formatRoundedCount(value)).toBe(expected);
	});
});

describe("formatCompactAxisTick", () => {
	it.each([
		[0.0006, "0.0006"],
		[1_000_000, "1M"],
		[1_500_000, "1.5M"],
		[25_000_000, "25M"],
		[1_250_000_000, "1.25B"],
	])("formats %s as %s without hiding adjacent ticks", (value, expected) => {
		expect(formatCompactAxisTick(value)).toBe(expected);
	});
});

describe("localized public counts", () => {
	const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"];
	it.each(locales)("preserves floored counts and distinct axis ticks in %s", (locale) => {
		if (locale === "en-GB") {
			expect(formatRoundedCount(15_999, locale)).toBe("15K");
			expect(formatRoundedCount(1_999_999_999, locale)).toBe("1B");
		} else {
			const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 20 });
			expect(formatRoundedCount(15_999, locale)).toBe(compact.format(15_000));
			expect(formatRoundedCount(1_999_999_999, locale)).toBe(compact.format(1_000_000_000));
		}
		expect(formatRoundedCount(999.9, locale)).toBe(new Intl.NumberFormat(locale).format(999));
		expect(formatCompactAxisTick(1_250_000, locale)).not.toBe(formatCompactAxisTick(1_500_000, locale));
		expect(formatRoundedCount(Number.NaN, locale)).toBe("--");
		expect(formatCompactAxisTick(Number.POSITIVE_INFINITY, locale)).toBe("--");
	});
	it("does not round Japanese counts up to the next ten-thousand unit", () => {
		expect(formatRoundedCount(15_999, "ja")).toBe("1.5万");
	});
});
