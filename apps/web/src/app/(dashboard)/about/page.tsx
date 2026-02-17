import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	BookOpen,
	Boxes,
	Database,
	GitBranch,
	LineChart,
	Route,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildMetadata({
	title: "About AI Stats",
	description:
		"Who we are, what we offer, and where to find announcements and policies.",
	path: "/about",
	keywords: ["AI Stats", "about", "AI gateway", "model database", "announcements"],
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
				<div className="text-[11px] font-semibold tracking-[0.28em] uppercase text-muted-foreground">
					{eyebrow}
				</div>
			) : null}
			<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
				{title}
			</h2>
			{description ? (
				<p className="text-sm leading-6 text-muted-foreground">
					{description}
				</p>
			) : null}
		</div>
	);
}

function FeatureCard({
	icon,
	title,
	description,
	href,
	badges = [],
	className,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	href: string;
	badges?: string[];
	className?: string;
}) {
	return (
		<Card
			className={cn(
				"group relative overflow-hidden border-zinc-200/70 bg-white/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/70 dark:bg-zinc-950/60",
				className
			)}
		>
			<div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
				<div className="absolute -left-10 -top-16 h-40 w-40 rounded-full bg-emerald-400/15 blur-2xl dark:bg-emerald-400/10" />
				<div className="absolute -right-8 -bottom-16 h-44 w-44 rounded-full bg-sky-400/15 blur-2xl dark:bg-sky-400/10" />
			</div>

			<CardHeader className="relative space-y-3">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
							{icon}
						</div>
						<CardTitle className="text-base">{title}</CardTitle>
					</div>
					<ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
				</div>

				<p className="text-sm leading-6 text-muted-foreground">
					{description}
				</p>

				{badges.length ? (
					<div className="flex flex-wrap gap-2">
						{badges.map((b) => (
							<Badge key={b} variant="secondary" className="text-[11px]">
								{b}
							</Badge>
						))}
					</div>
				) : null}
			</CardHeader>

			<CardContent className="relative pt-0">
				<Button asChild variant="ghost" className="h-9 px-2 -ml-2">
					<Link href={href} aria-label={`Learn more about ${title}`}>
						Learn more
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}

export default function AboutPage() {
	return (
		<main className="relative flex min-h-screen flex-col overflow-hidden">
			{/* Background atmosphere */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				{/* soft glows */}
				<div className="absolute -bottom-56 right-[-180px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.18),transparent_60%)] blur-2xl dark:bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.12),transparent_60%)]" />

				{/* subtle grid */}
				<div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(circle_at_50%_20%,black,transparent_62%)] dark:opacity-[0.16] dark:[background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)]" />

				<div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.7),rgba(255,255,255,1))] dark:bg-[linear-gradient(to_bottom,rgba(9,9,11,0.0),rgba(9,9,11,0.75),rgba(9,9,11,1))]" />
			</div>

			<div className="container mx-auto px-4 py-10 sm:py-14">
				{/* Hero */}
				<section className="grid gap-10 md:grid-cols-[1.25fr_0.75fr] md:items-start">
					<div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" className="text-[11px]">
								Company
							</Badge>
							<Badge variant="outline" className="text-[11px]">
								AI models
							</Badge>
							<Badge variant="outline" className="text-[11px]">
								Gateway
							</Badge>
							<Badge variant="outline" className="text-[11px]">
								Observability
							</Badge>
						</div>

						<h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
							AI Stats is the place to{" "}
							<span className="bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 bg-clip-text text-transparent dark:from-zinc-50 dark:via-zinc-200 dark:to-zinc-50">
								compare models
							</span>
							, track change, and ship with confidence.
						</h1>

						<p className="max-w-2xl text-base leading-7 text-muted-foreground">
							We build a product-focused model directory and an OpenAI-compatible
							gateway. The goal is simple: make it easier to pick the right
							model, understand what changed, and keep your integrations stable
							as providers evolve.
						</p>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
							<Button asChild className="h-10">
								<Link href="/models" aria-label="Explore models">
									Explore models
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="h-10">
								<Link
									href="https://docs.ai-stats.phaseo.app/v1/changelog"
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Read announcements"
								>
									Read announcements
								</Link>
							</Button>
							<Button asChild variant="ghost" className="h-10 sm:px-3">
								<Link
									href="https://docs.ai-stats.phaseo.app"
									aria-label="Open documentation"
								>
									<BookOpen className="mr-2 h-4 w-4" />
									Docs
								</Link>
							</Button>
						</div>

						{/* Signal strip */}
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/55">
								<div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">
									Focus
								</div>
								<div className="mt-1 text-sm font-semibold text-foreground">
									Decision-ready model data
								</div>
							</div>
							<div className="rounded-xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/55">
								<div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">
									Interface
								</div>
								<div className="mt-1 text-sm font-semibold text-foreground">
									OpenAI-compatible gateway
								</div>
							</div>
							<div className="rounded-xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/55">
								<div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">
									Signal
								</div>
								<div className="mt-1 text-sm font-semibold text-foreground">
									Announcements and policies
								</div>
							</div>
						</div>
					</div>

					<Card className="relative overflow-hidden border-zinc-200/70 bg-white/70 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-700 delay-150">
						<ShineBorder
							shineColor={["#0ea5e9", "#10b981", "#f59e0b"]}
							duration={12}
							borderWidth={1}
						/>
						<CardHeader className="space-y-3">
							<CardTitle className="text-base">What this is for</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								If you ship AI features and you need clarity across providers,
								this is for you.
							</p>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="relative overflow-hidden rounded-xl border border-zinc-200/70 bg-gradient-to-br from-white/80 to-white/40 p-4 dark:border-zinc-800/70 dark:from-zinc-950/65 dark:to-zinc-950/30">
								<div
									aria-hidden="true"
									className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/15 blur-2xl dark:bg-sky-400/10"
								/>
								<div className="flex items-center justify-between gap-3">
									<div className="text-xs font-semibold text-foreground">
										System map
									</div>
									<div className="font-mono text-[11px] text-muted-foreground">
										DIRECTORY {"->"} GATEWAY {"->"} OPS
									</div>
								</div>

								<svg
									viewBox="0 0 320 110"
									className="mt-3 h-[92px] w-full"
									aria-hidden="true"
								>
									<defs>
										<linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
											<stop offset="0" stopColor="rgba(14,165,233,0.65)" />
											<stop offset="0.55" stopColor="rgba(16,185,129,0.55)" />
											<stop offset="1" stopColor="rgba(245,158,11,0.55)" />
										</linearGradient>
									</defs>

									<path
										d="M70 58 C110 18, 150 18, 190 58 S 270 98, 290 58"
										fill="none"
										stroke="url(#a)"
										strokeWidth="2.25"
										strokeLinecap="round"
									/>

									<g>
										<circle cx="70" cy="58" r="10" fill="rgba(14,165,233,0.14)" />
										<circle
											cx="70"
											cy="58"
											r="5.5"
											fill="rgba(14,165,233,0.72)"
										/>
										<text
											x="70"
											y="92"
											textAnchor="middle"
											fontSize="10"
											fill="currentColor"
											className="text-muted-foreground"
										>
											Directory
										</text>
									</g>

									<g>
										<circle
											cx="190"
											cy="58"
											r="10"
											fill="rgba(16,185,129,0.14)"
										/>
										<circle
											cx="190"
											cy="58"
											r="5.5"
											fill="rgba(16,185,129,0.72)"
										/>
										<text
											x="190"
											y="92"
											textAnchor="middle"
											fontSize="10"
											fill="currentColor"
											className="text-muted-foreground"
										>
											Gateway
										</text>
									</g>

									<g>
										<circle
											cx="290"
											cy="58"
											r="10"
											fill="rgba(245,158,11,0.14)"
										/>
										<circle
											cx="290"
											cy="58"
											r="5.5"
											fill="rgba(245,158,11,0.72)"
										/>
										<text
											x="290"
											y="92"
											textAnchor="middle"
											fontSize="10"
											fill="currentColor"
											className="text-muted-foreground"
										>
											Ops
										</text>
									</g>
								</svg>
							</div>

							<div className="space-y-2">
								<div className="text-xs font-semibold text-foreground">
									Common workflows
								</div>
								<ul className="space-y-2 text-sm text-muted-foreground">
									<li className="flex items-start gap-2">
										<span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
										<span>Compare model pricing, benchmarks, and modality fit.</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-500/70" />
										<span>Track announcements and lifecycle changes over time.</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-500/70" />
										<span>Route requests with a consistent API surface.</span>
									</li>
								</ul>
							</div>

							<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />

							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-lg border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/50">
									<div className="text-[11px] font-semibold text-muted-foreground">
										Design principle
									</div>
									<div className="mt-1 text-sm font-semibold text-foreground">
										Pragmatic
									</div>
								</div>
								<div className="rounded-lg border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/50">
									<div className="text-[11px] font-semibold text-muted-foreground">
										Interface
									</div>
									<div className="mt-1 text-sm font-semibold text-foreground">
										OpenAI-compatible
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				{/* Who we are */}
				<section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
					<div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
						<SectionTitle
							eyebrow="Who We Are"
							title="We build the boring infrastructure that makes AI apps easier to ship."
							description="Our focus is stability: consistent naming, durable interfaces, and clarity around what changed and when."
						/>

						<div className="rounded-xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/55">
							<div className="flex items-center justify-between gap-4">
								<div className="text-sm font-semibold text-foreground">
									What we optimize for
								</div>
								<div className="font-mono text-[11px] text-muted-foreground">
									NO SURPRISES
								</div>
							</div>
							<div className="mt-3 grid gap-3 sm:grid-cols-2">
								<div className="rounded-lg border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/50">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<GitBranch className="h-4 w-4" />
										Compatibility
									</div>
									<p className="mt-1 text-sm leading-6 text-muted-foreground">
										Stable request/response behavior across providers.
									</p>
								</div>
								<div className="rounded-lg border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/50">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<LineChart className="h-4 w-4" />
									Decision signal
									</div>
									<p className="mt-1 text-sm leading-6 text-muted-foreground">
										Data that answers "which model should I use?".
									</p>
								</div>
							</div>
						</div>
					</div>

					<Card className="relative overflow-hidden border-zinc-200/70 bg-white/70 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-700 delay-150">
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(16,185,129,0.15),transparent_55%)]"
						/>
						<CardHeader className="relative space-y-2">
							<CardTitle className="text-base">Where to find what</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								We keep company info in one place so product pages can stay
								product-focused.
							</p>
						</CardHeader>
						<CardContent className="relative grid gap-3 sm:grid-cols-2">
							<Button asChild variant="outline" className="justify-between">
								<Link
									href="https://docs.ai-stats.phaseo.app/v1/changelog"
									target="_blank"
									rel="noopener noreferrer"
								>
									Announcements
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="justify-between">
								<Link href="/terms">
									Terms
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="justify-between">
								<Link href="/privacy">
									Privacy
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="justify-between">
								<Link href="/contact">
									Contact
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardContent>
					</Card>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				{/* Offerings */}
				<section className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow="What We Build"
						title="Tools that stay useful even when the model landscape changes."
						description="AI moves fast. We focus on durable primitives: clear data, consistent interfaces, and visibility into what changed."
					/>

					<div className="grid gap-4 md:grid-cols-2">
						<FeatureCard
							icon={<Database className="h-4 w-4 text-foreground" />}
							title="Model Directory"
							description="Browse models with benchmarks, pricing, and capability signals designed for decision-making."
							href="/models"
							badges={["Benchmarks", "Pricing", "Availability"]}
						/>
						<FeatureCard
							icon={<Route className="h-4 w-4 text-foreground" />}
							title="Gateway"
							description="Route across providers with a stable, OpenAI-compatible API surface and practical controls."
							href="/gateway"
							badges={["Compatibility", "Routing", "Controls"]}
						/>
						<FeatureCard
							icon={<LineChart className="h-4 w-4 text-foreground" />}
							title="Monitoring"
							description="Understand request behavior and model changes with auditing and operational visibility."
							href="/monitor"
							badges={["Audit", "Usage", "Ops"]}
						/>
						<FeatureCard
							icon={<Boxes className="h-4 w-4 text-foreground" />}
							title="Tools"
							description="Small utilities for day-to-day AI work: formatting, request building, and sanity checks."
							href="/tools"
							badges={["Utilities", "Dev UX"]}
						/>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				{/* Values + Links */}
				<section className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-start">
					<div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
						<SectionTitle
							eyebrow="How We Think"
							title="Opinionated about the boring parts."
							description="The value is in the details: definitions, edge cases, and consistent behavior."
						/>

						<div className="grid gap-4 sm:grid-cols-2">
							<Card className="border-zinc-200/70 bg-white/70 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<Sparkles className="h-4 w-4" />
										Clarity over hype
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										We bias toward concrete data, consistent naming, and practical
										comparisons.
									</p>
								</CardHeader>
							</Card>
							<Card className="border-zinc-200/70 bg-white/70 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<GitBranch className="h-4 w-4" />
										Stable interfaces
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										Compatibility matters. The gateway is designed to keep
										integrations resilient.
									</p>
								</CardHeader>
							</Card>
							<Card className="border-zinc-200/70 bg-white/70 dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:col-span-2">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<ShieldCheck className="h-4 w-4" />
										Safety and trust
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										We keep docs and policies explicit so you can understand what
										data is collected and how the product behaves.
									</p>
								</CardHeader>
							</Card>
						</div>
					</div>

					<Card className="border-zinc-200/70 bg-white/70 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-700 delay-150">
						<CardHeader className="space-y-2">
							<CardTitle className="text-base">Links</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								Everything you might look for from a company page.
							</p>
						</CardHeader>
						<CardContent className="grid gap-3">
							<Button asChild variant="outline" className="justify-between">
								<Link
									href="https://docs.ai-stats.phaseo.app/v1/changelog"
									target="_blank"
									rel="noopener noreferrer"
								>
									Announcements
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="justify-between">
								<Link href="/roadmap">
									Roadmap
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="justify-between">
								<Link href="/contact">
									Contact
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>

							<Separator className="my-1 bg-zinc-200/70 dark:bg-zinc-800/70" />

							<div className="grid gap-2 sm:grid-cols-2">
								<Button asChild variant="ghost" className="justify-between">
									<Link href="/terms">
										Terms
										<ArrowRight className="h-4 w-4" />
									</Link>
								</Button>
								<Button asChild variant="ghost" className="justify-between">
									<Link href="/privacy">
										Privacy
										<ArrowRight className="h-4 w-4" />
									</Link>
								</Button>
							</div>

							<Button
								asChild
								variant="ghost"
								className="justify-between"
							>
								<Link
									href="https://github.com/AI-Stats/AI-Stats"
									target="_blank"
									rel="noopener noreferrer"
								>
									GitHub
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}
