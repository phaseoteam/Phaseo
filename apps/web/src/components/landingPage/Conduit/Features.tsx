import Link from "next/link";
import { Activity, Route, Timer, Lock, Globe, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ProviderLogoRow } from "@/components/landingPage/Conduit/ProviderLogoRow";

const SALES_HREF = "/sign-up";

const FEATURE_CARDS = [
	{
		title: "Any model, one surface",
		body: "Keep one integration while you swap providers, add new models, and expand modalities without rewriting clients.",
		tag: "Unified API",
		icon: Globe,
		accent: "#0ea5e9",
	},
	{
		title: "Reliability by design",
		body: "Health-aware routing, automatic failover, and guardrails that protect production traffic when a provider degrades.",
		tag: "Uptime",
		icon: Activity,
		accent: "#10b981",
	},
	{
		title: "Policies that actually ship",
		body: "Route by latency, price, geography, capability, or your own rules. Apply consistent behaviour across every provider.",
		tag: "Routing",
		icon: Route,
		accent: "#f97316",
	},
	{
		title: "Deprecations handled",
		body: "Model retirement and breaking changes become predictable. Conduit surfaces alerts and migration paths before downtime.",
		tag: "Always current",
		icon: Timer,
		accent: "#6366f1",
	},
	{
		title: "Built for multimodal",
		body: "Text, vision, audio, video, embeddings, tool-calling, and realtime are treated as first-class, not bolt-ons.",
		tag: "Modalities",
		icon: Layers,
		accent: "#ec4899",
	},
	{
		title: "Security-first operations",
		body: "Scoped keys, audit trails, and encrypted BYOK workflows. Built for teams who can't afford surprises.",
		tag: "Security",
		icon: Lock,
		accent: "#111827",
	},
];

export function Features() {
	return (
		<section id="features" className="py-16 sm:py-20">
			<div className="container mx-auto flex flex-col items-center">
				<h2 className="mb-8 text-3xl font-bold text-center text-slate-900">
					What can we offer?
				</h2>
				<div className="w-full flex justify-center">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{FEATURE_CARDS.map((f) => {
							const Icon = f.icon;
							return (
								<Card
									key={f.title}
									className="shadow-sm border-t-2"
									style={{ borderTopColor: f.accent }}
								>
									<CardHeader>
										<div className="flex items-center justify-between">
											<Badge
												variant="secondary"
												className="border bg-white"
												style={{
													borderColor: f.accent,
													color: f.accent,
												}}
											>
												{f.tag}
											</Badge>
											<span
												className="rounded-md border bg-white p-2"
												style={{
													borderColor: f.accent,
												}}
											>
												<Icon
													className="h-4 w-4"
													style={{ color: f.accent }}
												/>
											</span>
										</div>
										<CardTitle className="text-lg">
											{f.title}
										</CardTitle>
									</CardHeader>
									<CardContent className="text-sm leading-relaxed text-slate-600">
										{f.body}
									</CardContent>
								</Card>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}
