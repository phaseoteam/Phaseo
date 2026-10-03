import { renderToStaticMarkup } from "react-dom/server";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { DEFAULT_DISPLAY_PREFERENCES, formatDisplayNumber } from "@/lib/displayPreferences";
import { KeyUsageSummary } from "./KeyUsageSummary";

jest.mock("@/components/providers/DisplayPreferencesProvider", () => ({ useDisplayFormatters: jest.fn() }));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { amount: string }) => values?.amount ?? key }));

function renderSummary(locale: "en-US" | "en-GB", numberNotation: "standard" | "compact" = "standard") {
	const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale, numberNotation };
	jest.mocked(useDisplayFormatters).mockReturnValue({
		number: (value, options) => formatDisplayNumber(value, preferences, options),
	} as ReturnType<typeof useDisplayFormatters>);
	return renderToStaticMarkup(<KeyUsageSummary usage={{ daily_request_count: 1234567, daily_cost_nanos: 1250000000 }} />);
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
