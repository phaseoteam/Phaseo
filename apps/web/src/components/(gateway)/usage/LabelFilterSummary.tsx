"use client";

import { useTranslations } from "next-intl";

// Money reads "$0.00003", not "US$0.00003", whatever the page locale.
const MONEY_LOCALE = "en-US";

export function formatLabelSpend(nanos: number): string {
	const usd = Number.isFinite(nanos) ? nanos / 1e9 : 0;
	return new Intl.NumberFormat(MONEY_LOCALE, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: usd !== 0 && Math.abs(usd) < 0.01 ? 6 : 2,
	}).format(usd);
}

/**
 * One quiet line under the toolbar while a label filter is on: how many
 * requests match and what they cost. The filter chip already names the label.
 */
export default function LabelFilterSummary({
	requestCount,
	totalCostNanos,
	isSampled,
}: {
	requestCount: number;
	totalCostNanos: number;
	isSampled?: boolean;
}) {
	const t = useTranslations("SettingsUI.requestClassifierUsage");
	return (
		<p className="text-sm text-muted-foreground">
			{t.rich("filterSummary", {
				count: requestCount,
				spend: formatLabelSpend(totalCostNanos),
				strong: (chunks) => <span className="font-medium tabular-nums text-foreground">{chunks}</span>,
			})}
			{isSampled ? <span> · {t("filterSummarySampled")}</span> : null}
		</p>
	);
}
