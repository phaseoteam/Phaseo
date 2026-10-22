import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import LabelFilterSummary, { formatLabelSpend } from "./LabelFilterSummary";

const render = (props: React.ComponentProps<typeof LabelFilterSummary>) => renderToStaticMarkup(
	<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages }}>
		<LabelFilterSummary {...props} />
	</NextIntlClientProvider>,
);

describe("LabelFilterSummary", () => {
	it("is one plain line with the count and spend", () => {
		const html = render({ requestCount: 1, totalCostNanos: 26_980 });
		expect(html.replace(/<[^>]+>/g, "")).toBe("1 request · $0.000027 spent");
		expect(html).not.toMatch(/uppercase|font-mono|rounded-(lg|xl|full)/);
	});

	it("pluralises and notes a sample", () => {
		const text = render({ requestCount: 1234, totalCostNanos: 12.5e9, isSampled: true }).replace(/<[^>]+>/g, "");
		expect(text).toBe("1,234 requests · $12.50 spent · estimated from a 5,000-request sample");
	});

	it("formats money in US style", () => {
		expect(formatLabelSpend(0)).toBe("$0.00");
		expect(formatLabelSpend(30_000)).toBe("$0.00003");
		expect(formatLabelSpend(Number.NaN)).toBe("$0.00");
	});
});
