const COMPARISON_ROWS = [
	{
		capability: "Model coverage",
		gateway:
			"Largest verified catalogue across text, image, video, audio updated nightly.",
		openRouter: "Large, varies by provider availability.",
		vercel: "Bring your own adapters.",
	},
	{
		capability: "Routing intelligence",
		gateway:
			"Latency and error-aware routing with deterministic fallbacks and breaker states.",
		openRouter: "Priority ordering per request.",
		vercel: "Minimal routing across a few providers.",
	},
	{
		capability: "Observability",
		gateway:
			"Live dashboards, exportable logs, anomaly alerts, and cost tracking built in.",
		openRouter: "Minimal analytics (requests and spend).",
		vercel: "Require self-managed telemetry.",
	},
	{
		capability: "Pricing model",
		gateway:
			"Automatic sliding scale from 10% down to 7.5% depending on usage, with no per-request add-ons.",
		openRouter: "Flat 5.5% gateway fee.",
		vercel: "0% gateway fee but no multi-provider routing.",
	},
];

export function CompareSection() {
	return (
		<section id="compare" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="space-y-6">
				<div>
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						How we compare
					</h2>
					<p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
						Optimised routing and observability are built in - no
						homegrown adapters, no hidden markups.
					</p>
				</div>
				<div className="overflow-hidden rounded-xl border border-slate-200">
					<table className="w-full text-left text-sm">
						<thead className="bg-slate-50 text-slate-600 dark:bg-neutral-900 dark:text-slate-300">
							<tr>
								<th className="px-4 py-3 font-medium">
									Capability
								</th>
								<th className="px-4 py-3 font-medium">
									AI Stats Conduit
								</th>
								<th className="px-4 py-3 font-medium">
									OpenRouter
								</th>
								<th className="px-4 py-3 font-medium">
									Vercel AI SDK
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{COMPARISON_ROWS.map((row) => (
								<tr key={row.capability}>
									<td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
										{row.capability}
									</td>
									<td className="px-4 py-3 text-slate-600 dark:text-slate-400">
										{row.gateway}
									</td>
									<td className="px-4 py-3 text-slate-600 dark:text-slate-400">
										{row.openRouter}
									</td>
									<td className="px-4 py-3 text-slate-600 dark:text-slate-400">
										{row.vercel}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
