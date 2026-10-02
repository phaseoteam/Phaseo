import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CheckItem from "../page/CheckItem";

export function PricingSection() {
	const t = useTranslations("SettingsUI");
const PRICING_BENEFITS = [
	t("landingGaps.catalogCredits"),
	t("landingGaps.purchaseOnly"),
	t("landingGaps.usageExports"),
	t("landingGaps.keyLimits"),
];

const PRICING_EXAMPLES = [
	{
		scenario: t("landingGaps.freeUsage"),
		gateway: t("landingGaps.noPurchaseFee"),
	},
	{
		scenario: t("landingGaps.paidTopUp"),
		gateway: t("landingGaps.purchaseFeeFive"),
	},
];


	return (
		<section id="pricing" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="space-y-6">
				<div className="space-y-3">
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						{t("landingGaps.pricingTitle")}</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						{t("landingGaps.pricingHelp")}</p>
				</div>
				<Card className="border-slate-200">
					<CardHeader className="space-y-2">
						<CardTitle className="text-base">{t("landingGaps.included")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<ul className="space-y-2 text-sm text-slate-700">
							{PRICING_BENEFITS.map((benefit) => (
								<CheckItem key={benefit}>{benefit}</CheckItem>
							))}
						</ul>
					</CardContent>
				</Card>

				<div className="overflow-hidden rounded-xl border border-slate-200">
					<table className="w-full text-left text-sm">
						<thead className="bg-slate-50 text-slate-600 dark:bg-neutral-900 dark:text-slate-300">
							<tr>
								<th className="px-4 py-3 font-medium">{t("landingGaps.scenario")}</th>
								<th className="px-4 py-3 font-medium">{t("landingGaps.copyCreditPurchaseFee")}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{PRICING_EXAMPLES.map((row) => (
								<tr key={row.scenario}>
									<td className="px-4 py-3 text-slate-700 dark:text-slate-300">
										{row.scenario}
									</td>
									<td className="px-4 py-3 text-slate-600 dark:text-slate-400">
										{row.gateway}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="text-xs text-slate-500 dark:text-slate-300">
					{t("landingGaps.reviewFee")}{" "}
					<Link className="underline" href="/settings/credits">
						/settings/credits
					</Link>{" "}
					{t("landingGaps.monthlySpend")}
				</p>
			</div>
		</section>
	);
}
