"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";

const COMPARISON_DATA = [
	{
		capability: "Model Coverage",
		description: "Number of models and providers supported",
		gateway: {
			value: "500+ models, 50+ providers",
			highlight: true,
			details: "Largest verified catalogue updated nightly",
		},
		openRouter: {
			value: "200+ models",
			highlight: false,
			details: "Varies by provider availability",
		},
		vercel: {
			value: "Bring your own",
			highlight: false,
			details: "Manual adapter setup required",
		},
	},
	{
		capability: "Modalities",
		description: "Supported input and output types",
		gateway: {
			value: "Text, Vision, Audio, Video, Embeddings",
			highlight: true,
			details: "First-class multimodal support",
		},
		openRouter: {
			value: "Text, Vision",
			highlight: false,
			details: "Limited modality support",
		},
		vercel: {
			value: "Text, Vision",
			highlight: false,
			details: "Provider-dependent",
		},
	},
	{
		capability: "Routing Intelligence",
		description: "How requests are distributed across providers",
		gateway: {
			value: "Latency, cost, error-aware",
			highlight: true,
			details: "Deterministic fallbacks with circuit breakers",
		},
		openRouter: {
			value: "Priority ordering",
			highlight: false,
			details: "Manual fallback configuration",
		},
		vercel: {
			value: "Basic",
			highlight: false,
			details: "Limited multi-provider routing",
		},
	},
	{
		capability: "Observability",
		description: "Built-in monitoring and analytics",
		gateway: {
			value: "Full-stack telemetry",
			highlight: true,
			details: "Live dashboards, alerts, cost tracking",
		},
		openRouter: {
			value: "Basic analytics",
			highlight: false,
			details: "Requests and spend only",
		},
		vercel: {
			value: "Self-managed",
			highlight: false,
			details: "Requires external tools",
		},
	},
	{
		capability: "Pricing Model",
		description: "Credit purchase fee structure",
		gateway: {
			value: "7% basic, 5% enterprise top-up fee",
			highlight: true,
			details: "Applied on credit purchases, not token requests",
		},
		openRouter: {
			value: "5.5% flat",
			highlight: false,
			details: "Fixed rate for all usage",
		},
		vercel: {
			value: "0% platform fee",
			highlight: false,
			details: "But limited routing capabilities",
		},
	},
];

export function CompareSection() {
	return (
		<section className="relative overflow-hidden py-20 sm:py-28">
			<div className="relative mx-auto max-w-7xl px-6 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="secondary"
						className="mb-4 border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
					>
						Comparison
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						How we compare
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						Optimised routing and observability built in - no homegrown
						adapters, no hidden markups.
					</p>
				</div>

				<Card className="mt-16 overflow-hidden border-zinc-200/60 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/70">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/70">
									<th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
										Capability
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
										AI Stats Gateway
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

