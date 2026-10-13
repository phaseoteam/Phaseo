import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { formatSubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";

export default function SubscriptionPlanOffers({ plan }: { plan: SubscriptionPlanSummary }) {
	if (!plan.offers?.length) return null;
	return <section className="space-y-4">
		<h2 className="text-xl font-semibold">Pricing options</h2>
		<div className="divide-y border-y">{plan.offers.map((offer) => {
			const price = plan.prices.find((entry) => entry.offer_uuid === offer.offer_uuid);
			if (!price) return null;
			return <div key={offer.offer_uuid} className="space-y-1 py-3">
				<p className="font-medium">{formatSubscriptionPrice(price)}</p>
				<p className="text-sm text-muted-foreground">{[offer.minimum_seats ? `${offer.minimum_seats} seat minimum` : null,
					offer.region_code, offer.tax_treatment === "excluded" ? "Taxes excluded" : offer.tax_treatment === "included" ? "Taxes included" : null,
					...offer.components.map((component) => component.display_text)].filter(Boolean).join(" · ")}</p>
				{offer.purchase_url && <a className="text-sm underline underline-offset-4" href={offer.purchase_url} target="_blank" rel="noopener noreferrer">View plan</a>}
			</div>;
		})}</div>
	</section>;
}
