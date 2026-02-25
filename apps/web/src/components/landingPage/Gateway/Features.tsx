import Link from "next/link";
import {
	Activity,
	Route,
	Timer,
	Lock,
	Globe,
	Layers,
	ArrowRight,
	CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

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
		<section id="features" className="py-4">
			<div className="mx-auto px-6 lg:px-8">
				{/* Section header */}
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="outline"
						className="mb-4 border-zinc-200 bg-transparent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-600 hover:bg-transparent dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-transparent"
					>
						Why teams choose us
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						Reliability, routing, and control in one gateway
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						Standardise providers behind a single API, then enforce
						global policies across latency, cost, capability, and
						compliance requirements.
					</p>
				</div>

				{/* Feature cards grid */}
				<div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
					{FEATURE_CARDS.map((f) => {
						const Icon = f.icon;
						const isSecurity = f.tag === "Security";
						const hoverAccent = isSecurity ? "#52525b" : f.accent;
						return (
							<Card
								key={f.title}
								className="group relative overflow-hidden border border-zinc-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:border-zinc-300/80 hover:-translate-y-1 dark:border-zinc-800/70 dark:bg-zinc-950/70 dark:hover:border-zinc-700"
							>
								{/* Hover gradient */}
								<div
									className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
									style={{
										background: `linear-gradient(135deg, ${hoverAccent}20 0%, transparent 70%)`,
									}}
								/>
								{/* Hover border */}
								<div
									className="absolute inset-0 rounded-xl border border-transparent transition-colors duration-300 group-hover:border-current"
									style={{ color: hoverAccent }}
								/>

								<CardHeader className="relative pb-3">
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-3">
											<Badge
												variant="outline"
												className={`border bg-transparent text-xs font-semibold uppercase tracking-wide ${
													isSecurity
														? "border-zinc-900 text-zinc-900 dark:border-zinc-400 dark:text-zinc-100"
														: ""
												} hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent`}
												style={
													isSecurity
														? undefined
														: {
															borderColor: f.accent,
															color: f.accent,
														}
												}
											>
												{f.tag}
											</Badge>
											<h3
												className={`text-xl font-semibold ${
													isSecurity
														? "text-zinc-900 dark:text-zinc-100"
														: "text-zinc-900 dark:text-zinc-100"
												}`}
											>
												{f.title}
											</h3>
										</div>
										<div
											className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${
												isSecurity
													? "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
													: ""
											}`}
											style={
												isSecurity
													? undefined
													: {
														borderColor: `${f.accent}30`,
														backgroundColor: `${f.accent}08`,
													}
											}
										>
											<Icon
												className={`h-6 w-6 ${
													isSecurity
														? "text-zinc-900 dark:text-zinc-100"
														: ""
												}`}
												style={
													isSecurity
														? undefined
														: { color: f.accent }
												}
											/>
										</div>
									</div>
								</CardHeader>

								<CardContent className="relative space-y-4">
									<p
										className={`text-sm leading-relaxed ${
											isSecurity
												? "text-zinc-600 dark:text-zinc-200"
												: "text-zinc-600 dark:text-zinc-300"
										}`}
									>
										{f.body}
									</p>
									<ul className="space-y-2">
										{f.highlights.map((highlight) => (
											<li
												key={highlight}
												className={`flex items-center gap-2 text-sm ${
													isSecurity
														? "text-zinc-600 dark:text-zinc-200"
														: "text-zinc-600 dark:text-zinc-300"
												}`}
											>
												<CheckCircle2
													className={`h-4 w-4 shrink-0 ${
														isSecurity
															? "text-zinc-900 dark:text-zinc-100"
															: ""
													}`}
													style={
														isSecurity
															? undefined
															: { color: f.accent }
													}
												/>
												<span>{highlight}</span>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						);
					})}
				</div>

				{/* CTA */}
				<div className="mt-16 flex flex-wrap items-center justify-center gap-4">
					<Button
						asChild
						size="lg"
						className="h-12 gap-2 bg-zinc-900 px-6 text-base font-medium text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800"
					>
						<Link href={SALES_HREF}>
							Start free
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="h-12 border-zinc-200 px-6 text-base font-medium dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
					>
						<Link href={DOCS_HREF}>View documentation</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}

