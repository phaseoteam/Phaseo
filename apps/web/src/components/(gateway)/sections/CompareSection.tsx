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
		description: "Gateway fee structure",
		gateway: {
			value: "7% basic, 5% enterprise",
			highlight: true,
			details: "Volume discounts, no per-request fees",
		},
		openRouter: {
			value: "5.5% flat",
			highlight: false,
			details: "Fixed rate for all usage",
		},
		vercel: {
			value: "0% gateway fee",
			highlight: false,
			details: "But limited routing capabilities",
		},
	},
];

export function CompareSection() {
	return (
		<section className="relative overflow-hidden py-20 sm:py-28">
			<div className="relative mx-auto max-w-7xl px-6 lg:px-8">
				{/* Section header */}
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="secondary"
						className="mb-4 border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600"
					>
						Comparison
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
						How we compare
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-slate-600">
						Optimised routing and observability built in — no
						homegrown adapters, no hidden markups.
					</p>
				</div>

				{/* Comparison table */}
				<Card className="mt-16 overflow-hidden border-slate-200/60 shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="border-b border-slate-200 bg-slate-50/80">
									<th className="px-6 py-4 text-sm font-semibold text-slate-900">
										Capability
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-slate-900">
										<div className="flex items-center gap-2">
											<span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
												AI
											</span>
											AI Stats Gateway
										</div>
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-slate-600">
										OpenRouter
									</th>
									<th className="px-6 py-4 text-sm font-semibold text-slate-600">
										Vercel AI SDK
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{COMPARISON_DATA.map((row) => (
									<tr
										key={row.capability}
										className="transition-colors hover:bg-slate-50/50"
									>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<p className="font-medium text-slate-900">
													{row.capability}
												</p>
												<p className="text-xs text-slate-500">
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
															row.gateway
																.highlight
																? "font-semibold text-slate-900"
																: "text-slate-600"
														}
													>
														{row.gateway.value}
													</span>
												</div>
												<p className="text-xs text-slate-500">
													{row.gateway.details}
												</p>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<Minus className="h-4 w-4 shrink-0 text-slate-400" />
													<span className="text-slate-600">
														{row.openRouter.value}
													</span>
												</div>
												<p className="text-xs text-slate-500">
													{row.openRouter.details}
												</p>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<Minus className="h-4 w-4 shrink-0 text-slate-400" />
													<span className="text-slate-600">
														{row.vercel.value}
													</span>
												</div>
												<p className="text-xs text-slate-500">
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
