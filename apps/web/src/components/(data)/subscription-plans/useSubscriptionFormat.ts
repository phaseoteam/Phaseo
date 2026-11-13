import { useLocale, useTranslations } from "@/i18n/react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { formatSubscriptionPlanMessage, getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";
import { formatSubscriptionPrice, localizedSubscriptionPriceLabels, type SubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";
import { apiMultiple, MIN_API_MULTIPLE, perMillionFractionDigits, type SubscriptionPlanUsage } from "@/lib/fetchers/subscription-plans/usage";
import { sortSubscriptionPlanPricesForDisplay } from "@/components/(data)/model/pricing/ModelSubscriptionsClient";

/** Formatting shared by the subscription plan pages: prices, token counts and token value. */
export function useSubscriptionFormat() {
	const locale = useLocale();
	const t = useTranslations();
	const format = useDisplayFormatters();
	const messages = getSubscriptionPlansMessagesFor(locale);
	const priceLabels = localizedSubscriptionPriceLabels(locale, {
		custom: messages.detail.customPricing, usage: messages.detail.usageBased, unknown: t("Common.status.unknown"),
		from: t("Common.ui.subscriptionCatalog.starting_at"), seat: t("Common.ui.subscriptionCatalog.seat"),
		introductory: t("Common.ui.subscriptionCatalog.introductory"), firstCycle: t("Common.ui.subscriptionCatalog.first_billing_cycle"),
		cycleCount: t("Common.ui.subscriptionCatalog.number_of_cycles"),
	});
	const money = (amount: number, currency = "USD", options: Intl.NumberFormatOptions = {}) =>
		format.number(amount, { style: "currency", currency, notation: "standard", ...options });
	const usage = messages.usage;

	return {
		locale,
		messages,
		price: (price: SubscriptionPrice) => formatSubscriptionPrice(price, (amount, currency) => money(amount, currency, Number.isInteger(amount) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { maximumFractionDigits: 8 }), priceLabels),
		/** The plan's first price in display order (fixed monthly USD first), or null. */
		primaryPrice: (prices: SubscriptionPrice[] | null | undefined) => sortSubscriptionPlanPricesForDisplay(prices ?? [])[0] ?? null,
		tokens: (value: number) => format.number(value, { notation: "compact", maximumFractionDigits: value >= 1e9 ? 1 : 0 }),
		perMillion: (value: number | null | undefined) => value == null ? null : money(value, "USD", perMillionFractionDigits(value)),
		multiple: (row: Pick<SubscriptionPlanUsage, "share_of_api_price">) => {
			const multiple = apiMultiple(row);
			if (multiple == null || multiple < MIN_API_MULTIPLE) return null;
			return formatSubscriptionPlanMessage(usage.timesCheaper, { value: format.number(multiple, { maximumFractionDigits: multiple >= 10 ? 0 : 1 }) });
		},
		/** "63× cheaper", or "96% of the API price" when the saving is small; null without an API price. */
		vsApi: (row: Pick<SubscriptionPlanUsage, "share_of_api_price">) => {
			const multiple = apiMultiple(row);
			if (multiple == null) return null;
			return multiple >= MIN_API_MULTIPLE ? { text: formatSubscriptionPlanMessage(usage.timesCheaper, { value: format.number(multiple, { maximumFractionDigits: multiple >= 10 ? 0 : 1 }) }), saving: true }
				: { text: formatSubscriptionPlanMessage(usage.shareOfApi, { value: format.number(row.share_of_api_price ?? 0, { style: "percent", maximumFractionDigits: 0 }) }), saving: false };
		},
		shareOfApi: (row: Pick<SubscriptionPlanUsage, "share_of_api_price">) => row.share_of_api_price == null ? null
			: formatSubscriptionPlanMessage(usage.shareOfApi, { value: format.number(row.share_of_api_price, { style: "percent", maximumFractionDigits: row.share_of_api_price < 0.1 ? 1 : 0 }) }),
		scenario: (scenario: string) => scenario === "peak" ? usage.scenarioPeak : scenario === "off_peak" ? usage.scenarioOffPeak : scenario === "fast" ? usage.scenarioFast : null,
		basis: (basis: string) => basis === "measured" ? usage.measured : basis === "derived" ? usage.derived : basis === "official" ? usage.official : basis === "assumed" ? usage.assumed : usage.unknown,
		confidence: (confidence: string) => confidence === "high" ? usage.high : confidence === "medium" ? usage.medium : confidence === "low" ? usage.low : usage.assumed,
		date: (value: string) => format.date(value),
	};
}

export type SubscriptionFormat = ReturnType<typeof useSubscriptionFormat>;
