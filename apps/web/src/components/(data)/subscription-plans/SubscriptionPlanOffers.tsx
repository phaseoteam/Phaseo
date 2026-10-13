import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { formatSubscriptionPrice, localizedSubscriptionPriceLabels } from "@/lib/fetchers/subscription-plans/pricing";
import { getLocale, getTranslations } from "next-intl/server";
import { getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";

export default async function SubscriptionPlanOffers({ plan }: { plan: SubscriptionPlanSummary }) {
	if (!plan.offers?.length) return null;
	const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
	const messages = getSubscriptionPlansMessagesFor(locale).detail;
	const labels = localizedSubscriptionPriceLabels(locale, { custom: messages.customPricing, usage: messages.usageBased, unknown: t("Common.status.unknown"), from: t("Common.ui.subscriptionCatalog.starting_at"), seat: t("Common.ui.subscriptionCatalog.seat"), introductory: t("Common.ui.subscriptionCatalog.introductory"), firstCycle: t("Common.ui.subscriptionCatalog.first_billing_cycle"), cycleCount: t("Common.ui.subscriptionCatalog.number_of_cycles") });
	const formatAmount = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 8 }).format(amount);
	return <section className="space-y-4">
		<h2 className="text-xl font-semibold">{t("Common.ui.subscriptionCatalog.plan_offers")}</h2>
		<div className="divide-y border-y">{plan.offers.map((offer) => {
			const price = plan.prices.find((entry) => entry.offer_uuid === offer.offer_uuid);
			if (!price) return null;
			return <div key={offer.offer_uuid} className="space-y-1 py-3">
				<p className="font-medium">{formatSubscriptionPrice(price, formatAmount, labels)}</p>
				<p className="text-sm text-muted-foreground">{[offer.minimum_seats ? `${t("Common.ui.subscriptionCatalog.minimum_seats")}: ${new Intl.NumberFormat(locale).format(offer.minimum_seats)}` : null,
					offer.region_code, offer.tax_treatment === "excluded" ? `${t("Common.ui.subscriptionCatalog.taxes")}: ${t("Common.ui.providerCardCopy.excluded")}` : offer.tax_treatment === "included" ? `${t("Common.ui.subscriptionCatalog.taxes")}: ${t("Catalogue.models.included")}` : null,
					...offer.components.map((component) => component.display_text)].filter(Boolean).join(" · ")}</p>
				{offer.purchase_url && <a className="text-sm underline underline-offset-4" href={offer.purchase_url} target="_blank" rel="noopener noreferrer">{t("Common.ui.subscriptionCatalog.view_plan")}</a>}
			</div>;
		})}</div>
	</section>;
}
