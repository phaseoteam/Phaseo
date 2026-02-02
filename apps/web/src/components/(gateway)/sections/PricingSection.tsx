import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CheckItem from "../page/CheckItem";

const PRICING_BENEFITS = [
	"Transparent fees: deposit once, route freely.",
	"Provider-aligned bills with no hidden multipliers.",
	"Usage exports for finance and RevOps teams - Coming Soon.",
	"Per-key spend limits keep experiments safe - Beta.",
];

const PRICING_EXAMPLES = [
	{
		scenario: "Testing & hobby usage",
		gateway: "10% fee → $5.00 on $50 monthly spend",
	},
	{
		scenario: "Regular product usage",
		gateway: "9% fee → $45.00 on $500 monthly spend",
	},
	{
		scenario: "Enterprise traffic",
		gateway: "8% fee → $400.00 on $5k monthly spend",
	},
];

export function PricingSection() {
	return (
		<section id="pricing" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="space-y-6">
				<div className="space-y-3">
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						Predictable pricing, with an automatic sliding scale
					</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						Every top-up covers the raw provider bill plus our
						gateway fee, which starts at 10% and steps down toward
						7.5% as usage grows. This adaptive scale keeps fees
						aligned with your runway so higher-volume programs
						benefit from faster routing and deeper savings.
					</p>
				</div>
				<Card className="border-slate-200">
					<CardHeader className="space-y-2">
						<CardTitle className="text-base">
							What is included
						</CardTitle>
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
								<th className="px-4 py-3 font-medium">
									Scenario
								</th>
								<th className="px-4 py-3 font-medium">
									Gateway fee
								</th>
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
					Review your live tier and projected discount at{" "}
					<Link className="underline" href="/settings/tiers">
						/settings/tiers
					</Link>{" "}
					based on this month’s spend so you know how close you are to
					the next band.
				</p>
			</div>
		</section>
	);
}
