import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CheckItem from "../page/CheckItem";

const PRICING_BENEFITS = [
	"Credits are consumed at model prices shown in the catalog.",
	"Top-up fees are applied when purchasing credits, not per request.",
	"Usage exports for finance and RevOps teams - Coming Soon.",
	"Per-key spend limits keep experiments safe - Beta.",
];

const PRICING_EXAMPLES = [
	{
		scenario: "Free model usage",
		gateway: "No credit purchase fee",
	},
	{
		scenario: "Basic tier top-up",
		gateway: "7.0% fee on credit purchases",
	},
	{
		scenario: "Enterprise tier top-up",
		gateway: "5.0% fee on credit purchases",
	},
];

export function PricingSection() {
	return (
		<section id="pricing" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="space-y-6">
				<div className="space-y-3">
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						Predictable pricing with clear credit economics
					</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						All model usage consumes credits using the prices shown in our
						model catalog. Top-up fees are only applied when you purchase
						credits (top-up), with tier-based rates for Basic and Enterprise
						teams.
					</p>
				</div>
				<Card className="border-slate-200">
					<CardHeader className="space-y-2">
						<CardTitle className="text-base">What is included</CardTitle>
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
								<th className="px-4 py-3 font-medium">Scenario</th>
								<th className="px-4 py-3 font-medium">Credit purchase fee</th>
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
					Review your live tier and top-up fee at{" "}
					<Link className="underline" href="/settings/tiers">
						/settings/tiers
					</Link>{" "}
					based on this month&apos;s spend.
				</p>
			</div>
		</section>
	);
}
