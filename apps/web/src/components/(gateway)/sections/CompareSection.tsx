"use client";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";

export function CompareSection() {
	const t = useTranslations("SettingsUI");
const COMPARISON_DATA = [
	{
		capability: t("landingGaps.copyModelCoverage"),
		description: t("landingGaps.coverageHelp"),
		gateway: {
			value: t("landingGaps.coverageBoth"),
			highlight: true,
			details: t("landingGaps.verifiedCatalogue"),
		},
		openRouter: {
			value: t("landingGaps.coverageModels"),
			highlight: false,
			details: t("landingGaps.providerAvailability"),
		},
		vercel: {
			value: t("landingGaps.bringOwn"),
			highlight: false,
			details: t("landingGaps.manualAdapters"),
		},
	},
	{
		capability: t("landingGaps.copyModalities"),
		description: t("landingGaps.modalitiesHelp"),
		gateway: {
			value: t("landingGaps.allModalities"),
			highlight: true,
			details: t("landingGaps.multimodal"),
		},
		openRouter: {
			value: t("landingGaps.textVision"),
			highlight: false,
			details: t("landingGaps.limitedModality"),
		},
		vercel: {
			value: t("landingGaps.textVision"),
			highlight: false,
			details: t("landingGaps.providerDependent"),
		},
	},
	{
		capability: t("landingGaps.routingIntelligence"),
		description: t("landingGaps.routingDistribution"),
		gateway: {
			value: t("landingGaps.routingAware"),
			highlight: true,
			details: t("landingGaps.circuitFallbacks"),
		},
		openRouter: {
			value: t("landingGaps.priorityOrder"),
			highlight: false,
			details: t("landingGaps.manualFallback"),
		},
		vercel: {
			value: t("landingGaps.copyBasic"),
			highlight: false,
			details: t("landingGaps.limitedRouting"),
		},
	},
	{
		capability: t("landingGaps.copyObservability"),
		description: t("landingGaps.monitoringHelp"),
		gateway: {
			value: t("landingGaps.fullTelemetry"),
			highlight: true,
			details: t("landingGaps.liveDashboards"),
		},
		openRouter: {
			value: t("landingGaps.basicAnalytics"),
			highlight: false,
			details: t("landingGaps.requestsSpend"),
		},
		vercel: {
			value: t("landingGaps.selfManaged"),
			highlight: false,
			details: t("landingGaps.externalTools"),
		},
	},
	{
		capability: t("landingGaps.pricingModel"),
		description: t("landingGaps.feeStructure"),
		gateway: {
			value: t("landingGaps.feeFive"),
			highlight: true,
			details: t("landingGaps.purchaseNotTokens"),
		},
		openRouter: {
			value: t("landingGaps.flatFiveFive"),
			highlight: false,
			details: t("landingGaps.fixedRate"),
		},
		vercel: {
			value: t("landingGaps.zeroFee"),
			highlight: false,
			details: t("landingGaps.butLimited"),
		},
	},
];


	return (
		<section className="relative overflow-hidden py-12 sm:py-16">
			<div className="relative mx-auto max-w-7xl px-6 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						{t("landingGaps.compareTitle")}</h2>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						{t("landingGaps.compareHelp")}</p>
				</div>

				<Card className="mt-10 overflow-hidden border-zinc-200/60 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/70">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/70">
									<th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
										{t("landingGaps.copyCapability")}</th>
									<th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
										Phaseo Gateway
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
										OpenRouter
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
										Vercel AI SDK
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
								{COMPARISON_DATA.map((row) => (
									<tr
										key={row.capability}
										className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50"
									>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<p className="font-medium text-zinc-900 dark:text-zinc-100">
													{row.capability}
												</p>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{row.description}
												</p>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													{row.gateway.highlight && (
														<Check className="h-4 w-4 shrink-0 text-emerald-500" />
													)}
													<span
														className={
															row.gateway.highlight
																? "font-semibold text-zinc-900 dark:text-zinc-100"
																: "text-zinc-600 dark:text-zinc-300"
														}
													>
														{row.gateway.value}
													</span>
												</div>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{row.gateway.details}
												</p>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<Minus className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
													<span className="text-zinc-600 dark:text-zinc-300">
														{row.openRouter.value}
													</span>
												</div>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{row.openRouter.details}
												</p>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<Minus className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
													<span className="text-zinc-600 dark:text-zinc-300">
														{row.vercel.value}
													</span>
												</div>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{row.vercel.details}
												</p>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			</div>
		</section>
	);
}

