import { useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
					<Table wrapInContainer={false} className="w-full text-left text-sm">
						<TableHeader className="bg-slate-50 text-slate-600 dark:bg-neutral-900 dark:text-slate-300">
							<TableRow className="border-0 hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto px-4 py-3 font-medium text-inherit dark:text-inherit">{t("landingGaps.scenario")}</TableHead>
								<TableHead className="h-auto px-4 py-3 font-medium text-inherit dark:text-inherit">{t("landingGaps.copyCreditPurchaseFee")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{PRICING_EXAMPLES.map((row) => (
								<TableRow key={row.scenario} className="border-slate-100 hover:bg-transparent dark:hover:bg-transparent">
									<TableCell className="px-4 py-3 text-slate-700 dark:text-slate-300">
										{row.scenario}
									</TableCell>
									<TableCell className="px-4 py-3 text-slate-600 dark:text-slate-400">
										{row.gateway}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
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
