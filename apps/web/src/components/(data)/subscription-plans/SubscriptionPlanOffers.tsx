import { ExternalLink } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { useSubscriptionFormat } from "./useSubscriptionFormat";

export default function SubscriptionPlanOffers({ plan }: { plan: SubscriptionPlanSummary }) {
	const t = useTranslations();
	const format = useSubscriptionFormat();
	const { messages, locale } = format;
	const offers = (plan.offers ?? []).flatMap((offer) => {
		const price = plan.prices.find((entry) => entry.offer_uuid === offer.offer_uuid);
		return price ? [{ offer, price }] : [];
	});
	if (!offers.length) return null;
	const details = (offer: (typeof offers)[number]["offer"]) => [
		offer.minimum_seats ? `${t("Common.ui.subscriptionCatalog.minimum_seats")}: ${new Intl.NumberFormat(locale).format(offer.minimum_seats)}` : null,
		offer.region_code,
		offer.tax_treatment === "excluded" ? `${t("Common.ui.subscriptionCatalog.taxes")}: ${t("Common.ui.providerCardCopy.excluded")}` : offer.tax_treatment === "included" ? `${t("Common.ui.subscriptionCatalog.taxes")}: ${t("Catalogue.models.included")}` : null,
		...offer.components.map((component) => component.display_text),
	].filter(Boolean).join(" · ");
	return (
		<section id="plan-offers" className="scroll-mt-36 space-y-4">
			<h2 className="text-xl font-semibold">{messages.detail.pricing}</h2>
			<div className="overflow-x-auto rounded-md border border-border/70">
				<Table aria-label={messages.detail.pricing}>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead scope="col" className="px-4">{messages.detail.billing}</TableHead>
							<TableHead scope="col" className="px-4">{messages.detail.details}</TableHead>
							<TableHead scope="col" className="px-4"><span className="sr-only">{t("Common.ui.subscriptionCatalog.view_plan")}</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{offers.map(({ offer, price }) => (
							<TableRow key={offer.offer_uuid}>
								<TableCell className="px-4 py-3 font-medium tabular-nums">{format.price(price)}</TableCell>
								<TableCell className="px-4 py-3 text-sm text-muted-foreground">{details(offer) || "—"}</TableCell>
								<TableCell className="px-4 py-3 text-right">
									{offer.purchase_url ? (
										<a className="inline-flex items-center gap-1 text-sm underline decoration-transparent underline-offset-4 hover:decoration-current" href={offer.purchase_url} target="_blank" rel="noopener noreferrer">
											{t("Common.ui.subscriptionCatalog.view_plan")}<ExternalLink className="size-3.5" aria-hidden="true" />
										</a>
									) : null}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}
