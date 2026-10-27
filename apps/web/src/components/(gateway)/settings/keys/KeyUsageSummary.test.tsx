import { renderToStaticMarkup } from "react-dom/server";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { DEFAULT_DISPLAY_PREFERENCES, formatDisplayDateParts, formatDisplayNumber } from "@/lib/displayPreferences";
import { KeyUsageSummary } from "./KeyUsageSummary";

jest.mock("@/components/providers/DisplayPreferencesProvider", () => ({ useDisplayFormatters: jest.fn() }));
jest.mock("next-intl", () => ({
	useTranslations: () => (key: string, values?: Record<string, string>) =>
		values ? `${key}:${Object.values(values).join("|")}` : key,
}));

const NO_LIMITS = {
	daily_limit_requests: 0, weekly_limit_requests: 0, monthly_limit_requests: 0,
	daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0,
};
// Midday UTC on a Monday: half of today, and the first day of the week and month windows are too short to project.
const MIDDAY = Date.parse("2026-10-12T12:00:00Z");

function renderSummary(
	locale: "en-US" | "en-GB",
	numberNotation: "standard" | "compact" = "standard",
	limits: typeof NO_LIMITS = NO_LIMITS,
) {
	const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale, numberNotation, timeZone: "UTC" };
	jest.mocked(useDisplayFormatters).mockReturnValue({
		number: (value, options) => formatDisplayNumber(value, preferences, options),
		dateParts: (value, options, fallback) => formatDisplayDateParts(value, preferences, options, fallback),
	} as ReturnType<typeof useDisplayFormatters>);
	return renderToStaticMarkup(
		<KeyUsageSummary
			usage={{ daily_request_count: 1234567, daily_cost_nanos: 1250000000 }}
			limits={limits}
			observedAt={MIDDAY}
		/>,
	);
}

describe("key usage display preferences", () => {
	it("uses the saved US locale for USD amounts", () => {
		const html = renderSummary("en-US");
		expect(html).toContain("$1.25");
		expect(html).not.toContain("US$");
		expect(html).toContain("1,234,567");
	});

	it("uses the saved UK locale for USD amounts", () => {
		expect(renderSummary("en-GB")).toContain("US$1.25");
	});

	it("honors compact request counts while retaining precise currency", () => {
		const html = renderSummary("en-US", "compact");
		expect(html).toContain("1.2M");
		expect(html).toContain("$1.25");
	});
});

describe("key usage forecasts", () => {
	it("projects today's spend from the pace so far", () => {
		const html = renderSummary("en-US");
		expect(html).toContain("keyDetail.onPaceFor:$2.50");
		expect(html).not.toContain("keyDetail.reachesLimit");
	});

	it("dates a daily spend limit the pace will reach", () => {
		const html = renderSummary("en-US", "standard", { ...NO_LIMITS, daily_limit_cost_nanos: 2_000_000_000 });
		expect(html).toContain("keyDetail.ofLimit:$2.00");
		// $1.25 by midday reaches $2.00 at 19:12 UTC.
		expect(html).toMatch(/keyDetail\.reachesLimit:7:12\s?PM/);
		expect(html).toContain("text-amber-500");
	});
});
