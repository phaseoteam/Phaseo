import Link from "next/link";
import { Activity, Route, Timer, Lock, Globe, Layers, ArrowRight } from "lucide-react";

const DOCS_HREF = "https://docs.phaseo.ai/v1/quickstart";

const FEATURE_CARDS = [
	{
		title: "Any model, one surface",
		body: "Keep one integration while you swap providers, add new models, and expand modalities without rewriting clients.",
		highlights: [
			"OpenAI, Anthropic, Google, and 50+ more",
			"Text, vision, audio, video, embeddings",
			"Consistent response schemas",
		],
		tag: "Unified API",
		icon: Globe,
		accent: "#f59e0b",
	},
	{
		title: "Reliability by design",
		body: "Health-aware routing, automatic failover, and guardrails that protect production traffic when a provider degrades.",
		highlights: [
			"Real-time health monitoring",
			"Automatic failover routing",
			"Circuit breaker patterns",
		],
		tag: "Uptime",
		icon: Activity,
		accent: "#10b981",
	},
	{
		title: "Intelligent routing",
		body: "Route by latency, price, geography, capability, or your own rules. Apply consistent behaviour across every provider.",
		highlights: [
			"Latency-optimized routing",
			"Cost-aware load balancing",
			"Custom routing policies",
		],
		tag: "Routing",
		icon: Route,
		accent: "#f97316",
	},
	{
		title: "Deprecations handled",
		body: "Model retirement and breaking changes become predictable. Gateway surfaces alerts and migration paths before downtime.",
		highlights: [
			"Proactive deprecation alerts",
			"Automatic version mapping",
			"Zero-downtime migrations",
		],
		tag: "Always current",
		icon: Timer,
		accent: "#e11d48",
	},
	{
		title: "Built for multimodal",
		body: "Text, vision, audio, video, embeddings, tool-calling, and realtime are treated as first-class, not bolt-ons.",
		highlights: [
			"Native multimodal support",
			"Streaming and real-time APIs",
			"Function calling built-in",
		],
		tag: "Modalities",
		icon: Layers,
		accent: "#ec4899",
	},
	{
		title: "Security-first operations",
		body: "Scoped keys, audit trails, and encrypted BYOK workflows. Built for teams who can't afford surprises.",
		highlights: [
			"Fine-grained API key scopes",
			"Full request audit logging",
			"Encrypted BYOK support",
		],
		tag: "Security",
		icon: Lock,
		accent: "#111827",
	},
];

export function Features() {
	return (
		<section id="features" className="py-8">
			<div className="mx-auto px-6 lg:px-8">
				<div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
					<div className="space-y-6">
						<h2 className="max-w-xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
							One control plane for a provider market that changes every week.
						</h2>
						<p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
							The gateway is built for teams that care about model portability,
							routing quality, and operational discipline more than raw provider
							counts on a slide.
						</p>

						<div className="space-y-4 border-l border-zinc-200 pl-4 dark:border-zinc-800">
							<div className="flex items-start gap-3">
								<Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
									Health-aware routing means degraded providers stop being a
									midnight incident.
								</p>
							</div>
							<div className="flex items-start gap-3">
								<Route className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
									Swap models and clouds without rewriting product integrations.
								</p>
							</div>
							<div className="flex items-start gap-3">
								<Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
									Keep policy, spend controls, and auditability in the same place
									as execution.
								</p>
							</div>
						</div>

						<div className="pt-2">
							<Link
								href={DOCS_HREF}
								className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
							>
								View documentation
								<ArrowRight className="h-4 w-4" />
							</Link>
						</div>
					</div>

					<div className="border-t border-zinc-200/80 dark:border-zinc-800">
						<div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
							{FEATURE_CARDS.map((feature) => {
								const Icon = feature.icon;
								return (
									<div
										key={feature.title}
										className="grid gap-5 py-5 sm:grid-cols-[auto_1fr]"
									>
										<div
											className="flex h-11 w-11 items-center justify-center rounded-2xl border"
											style={{
												borderColor: `${feature.accent}28`,
												backgroundColor: `${feature.accent}10`,
											}}
										>
											<Icon className="h-5 w-5" style={{ color: feature.accent }} />
										</div>
										<div className="space-y-3">
											<p className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
												{feature.title}
											</p>
											<p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
												{feature.body}
											</p>
											<div className="flex flex-wrap gap-x-4 gap-y-2">
												{feature.highlights.map((highlight) => (
													<p
														key={highlight}
														className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
													>
														{highlight}
													</p>
												))}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

