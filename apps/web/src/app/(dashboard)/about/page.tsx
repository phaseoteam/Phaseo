import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	BookOpen,
	Database,
	GitBranch,
	LineChart,
	Route,
	ShieldCheck,
	Sparkles,
	Wallet,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = buildMetadata({
	title: "About AI Stats",
	description:
		"Learn what AI Stats does, how the gateway and model directory work together, and where to find updates, pricing, and platform policies.",
	path: "/about",
	keywords: ["AI Stats", "about", "AI gateway", "model database", "pricing"],
});

function SectionTitle({
	eyebrow,
	title,
	description,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			{eyebrow ? (
				<div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-muted-foreground">
					{eyebrow}
				</div>
			) : null}
			<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
			{description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
		</div>
	);
}

function ResourceButton({
	href,
	label,
	external,
	variant = "outline",
}: {
	href: string;
	label: string;
	external?: boolean;
	variant?: "outline" | "ghost";
}) {
	return (
		<Button asChild variant={variant} className="justify-between">
			<Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
				{label}
				<ArrowRight className="h-4 w-4" />
			</Link>
		</Button>
	);
}

const platformFlow = [
	{
		title: "Unified Model Access",
		description: "Browse and compare model capabilities and pricing across providers in one surface.",
		points: [
			"Access as many models and providers as possible from one place.",
			"Compare capabilities, benchmarks, and cost using a consistent structure.",
		],
		href: "/models",
		icon: Database,
	},
	{
		title: "Gateway Execution",
		description: "Route requests across providers with an OpenAI-compatible API layer.",
		points: [
			"Keep integration code stable while provider offerings evolve.",
			"Apply practical routing and control policies without lock-in.",
		],
		href: "/gateway",
		icon: Route,
	},
	{
		title: "Release Intelligence",
		description: "Stay current on launches, deprecations, and retirements as they happen.",
		points: [
			"Track release events without manual monitoring.",
			"See what changed, what is sunsetting, and what to migrate to.",
		],
		href: "/updates/models",
		icon: GitBranch,
	},
	{
		title: "Request Observability",
		description: "Get clear signal on request behavior, reliability, and provider performance.",
		points: [
			"Inspect usage, errors, latency, and model/provider distribution.",
			"Audit behavior over time and spot drift quickly.",
		],
		href: "/settings/usage",
		icon: LineChart,
	},
] as const;

const offerings = [
	{
		title: "Model Directory",
		description: "Decision-ready model data with benchmarks, pricing, and provider coverage.",
		href: "/models",
		badges: ["Coverage", "Benchmarks", "Pricing"],
		icon: Database,
	},
	{
		title: "Gateway",
		description: "OpenAI-compatible API surface to execute across many providers.",
		href: "/gateway",
		badges: ["Compatibility", "Routing", "Controls"],
		icon: Route,
	},
	{
		title: "Release Intelligence",
		description: "Track new releases, deprecations, and retirements in one feed.",
		href: "/updates/models",
		badges: ["Releases", "Deprecations", "Retirements"],
		icon: GitBranch,
	},
	{
		title: "Gateway Observability",
		description: "Clear operational insight into requests, latency, errors, and behavior shifts.",
		href: "/settings/usage",
		badges: ["Usage", "Reliability", "Auditability"],
		icon: LineChart,
	},
] as const;

export default function AboutPage() {
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary" className="text-[11px]">
							Company
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							AI Models
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							Gateway
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							Observability
						</Badge>
					</div>

					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						One unified, open layer to access models across providers and ship reliably.
					</h1>

					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						AI Stats is built around practical openness: broad model and provider access, explicit release/deprecation/retirement tracking, and clear observability so teams can run production workloads with low surprise.
					</p>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/models">
								Explore models
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="/pricing">
								AI Stats Pricing
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10 sm:px-3">
							<Link href="https://docs.ai-stats.phaseo.app" target="_blank" rel="noopener noreferrer">
								<BookOpen className="mr-2 h-4 w-4" />
								Documentation
							</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow="How It Works"
						title="A clear path from exploration to production operations."
						description="Research models, execute through one API layer, stay current on lifecycle changes, and monitor behavior over time."
					/>

					<ol className="relative space-y-4 before:absolute before:left-4 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
						{platformFlow.map((item, idx) => {
							const Icon = item.icon;
							return (
								<li key={item.title} className="relative pl-11">
									<div className="absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
										<Icon className="h-4 w-4" />
									</div>
									<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
										<CardHeader className="space-y-2 pb-3">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<CardTitle className="text-base">{item.title}</CardTitle>
												<Badge variant="outline" className="text-[11px]">
													Step {idx + 1}
												</Badge>
											</div>
											<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
										</CardHeader>
										<CardContent className="pt-0">
											<ul className="space-y-2 text-sm text-muted-foreground">
												{item.points.map((point) => (
													<li key={point} className="flex items-start gap-2">
														<span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
														<span>{point}</span>
													</li>
												))}
											</ul>
											<div className="mt-4">
												<Button asChild variant="ghost" className="h-9 px-2 -ml-2">
													<Link href={item.href}>Open {item.title}</Link>
												</Button>
											</div>
										</CardContent>
									</Card>
								</li>
							);
						})}
					</ol>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow="What We Build"
						title="Durable product surfaces that stay useful as AI changes."
						description="Our goal is simple: keep access broad, interfaces stable, and operations understandable."
					/>

					<div className="space-y-4">
						{offerings.map((item) => {
							const Icon = item.icon;
							return (
								<Card key={item.title} className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
									<CardContent className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200/70 bg-white dark:border-zinc-800/70 dark:bg-zinc-950">
											<Icon className="h-4 w-4 text-foreground" />
										</div>
										<div className="space-y-2">
											<h3 className="text-base font-semibold text-foreground">{item.title}</h3>
											<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
											<div className="flex flex-wrap gap-2">
												{item.badges.map((badge) => (
													<Badge key={badge} variant="secondary" className="text-[11px]">
														{badge}
													</Badge>
												))}
											</div>
										</div>
										<Button asChild variant="outline" className="justify-between">
											<Link href={item.href}>
												Open
												<ArrowRight className="h-4 w-4" />
											</Link>
										</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow="Pricing"
						title="Platform pricing and model pricing are separate surfaces."
						description="Use AI Stats Pricing for our platform/service pricing, and use the Pricing Calculator for model-level estimation."
					/>

					<div className="grid gap-4 md:grid-cols-2">
						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
									<Wallet className="h-4 w-4" />
									AI Stats Pricing
								</div>
								<p className="text-sm leading-6 text-muted-foreground">
									See platform pricing details, including credit purchase fee tiers and billing coverage.
								</p>
							</CardHeader>
							<CardContent className="pt-0">
								<ResourceButton href="/pricing" label="Open AI Stats Pricing" />
							</CardContent>
						</Card>

						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
									<LineChart className="h-4 w-4" />
									Model Pricing Tools
								</div>
								<p className="text-sm leading-6 text-muted-foreground">
									Use model-level pricing references and cost estimation tools for scenario planning.
								</p>
							</CardHeader>
							<CardContent className="pt-0 space-y-2">
								<ResourceButton href="/tools/pricing-calculator" label="Open Pricing Calculator" />
								<ResourceButton href="/models" label="Browse Models" variant="ghost" />
							</CardContent>
						</Card>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="space-y-6">
						<SectionTitle
							eyebrow="Company"
							title="Open by default, explicit in behavior, clear in operations."
							description="We prioritize transparent coverage and public documentation over vague claims. Compatibility, lifecycle updates, and observability are first-class."
						/>

						<div className="grid gap-4 sm:grid-cols-2">
							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<Sparkles className="h-4 w-4" />
										Open by default
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										Access should be broad and practical, with consistent naming and clear docs.
									</p>
								</CardHeader>
							</Card>

							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<GitBranch className="h-4 w-4" />
										Clear lifecycle signals
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										New releases, deprecations, and retirements are tracked so migration work is predictable.
									</p>
								</CardHeader>
							</Card>

							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:col-span-2">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<ShieldCheck className="h-4 w-4" />
										Operational clarity
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										Request-level observability keeps behavior auditable and easier to debug in production.
									</p>
								</CardHeader>
							</Card>
						</div>
					</div>

					<Card className="border-zinc-200/70 bg-white/75 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardHeader className="space-y-2">
							<CardTitle className="text-base">Where to find things</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								Everything company, product, and policy related in one place.
							</p>
						</CardHeader>
							<CardContent className="grid gap-3">
								<ResourceButton href="https://docs.ai-stats.phaseo.app/v1/changelog" label="Announcements" external />
								<ResourceButton href="/updates/models" label="Model Updates" />
								<ResourceButton href="/settings/usage" label="Gateway Usage" />
								<ResourceButton href="/roadmap" label="Roadmap" />
								<ResourceButton href="/contact" label="Contact" />
							<Separator className="my-1 bg-zinc-200/70 dark:bg-zinc-800/70" />
							<div className="grid gap-2 sm:grid-cols-2">
								<ResourceButton href="/terms" label="Terms" variant="ghost" />
								<ResourceButton href="/privacy" label="Privacy" variant="ghost" />
							</div>
							<ResourceButton href="https://github.com/AI-Stats/AI-Stats" label="GitHub" external variant="ghost" />
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}
