"use client";

import Link from "next/link";
import {
	BarChart3,
	Boxes,
	Network,
	ArrowRight,
	Globe2,
	Cpu,
	Route,
	ShieldCheck,
	Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GatewayHeroVariant } from "@/lib/statsig/shared";
import { WordRotate } from "@/components/ui/word-rotate";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://phaseo.app/docs/v1/quickstart";

type GatewayHeroStats = {
	tokens24h: number;
	supportedModels: number | null;
	supportedProviders: number | null;
};

type HeroStatItem = {
	label: string;
	value: string;
	icon: React.ElementType;
	accent: string;
};

function HeroActions({ ctaVariant }: { ctaVariant: "classic" | "experimental" }) {
	return (
		<div className="mt-10 flex flex-wrap items-center gap-4">
			<Button
				asChild
				size="lg"
				className={
					ctaVariant === "experimental"
						? "h-12 gap-2 bg-emerald-600 px-6 text-base font-medium text-white hover:bg-emerald-500"
						: "h-12 gap-2 bg-zinc-900 px-6 text-base font-medium text-white hover:bg-zinc-800"
				}
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
				className="h-12 gap-2 border-zinc-300 px-6 text-base font-medium dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
			>
				<Link href={DOCS_HREF}>
					<Globe2 className="h-4 w-4" />
					View documentation
				</Link>
			</Button>
		</div>
	);
}

function ClassicHeroIntro({
	heroStats,
}: {
	heroStats: HeroStatItem[];
}) {
	const [tokensStat, modelsStat, providersStat] = heroStats;

	return (
		<div className="space-y-10">
			<div className="mx-auto max-w-4xl text-center">
				<h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl lg:text-6xl">
					The Unified AI Gateway for{" "}
					<span className="relative text-sky-700 dark:text-sky-300">
						<WordRotate
							words={[
								"AI Models",
								"LLMs",
								"Vision Models",
								"Audio Models",
								"Embeddings",
								"Agents",
							]}
							duration={4000}
						/>
					</span>
				</h1>

				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
					Keep your existing SDK shape, route across providers, and control
					latency, pricing, and failover from one OpenAI-compatible surface.
				</p>

				<div className="flex justify-center">
					<HeroActions ctaVariant="classic" />
				</div>
			</div>
			<div className="mx-auto grid max-w-3xl gap-8 border-t border-zinc-200/80 pt-6 text-center text-sm dark:border-zinc-800 md:grid-cols-3">
				<div className="space-y-1">
					<p className="text-zinc-500 dark:text-zinc-400">
						{tokensStat?.label ?? "Monthly tokens"}
					</p>
					<p className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
						{tokensStat?.value ?? "--"}
					</p>
				</div>
				<div className="space-y-1">
					<p className="text-zinc-500 dark:text-zinc-400">
						{modelsStat?.label ?? "Models"}
					</p>
					<p className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
						{modelsStat?.value ?? "--"}
					</p>
				</div>
				<div className="space-y-1">
					<p className="text-zinc-500 dark:text-zinc-400">
						{providersStat?.label ?? "Providers"}
					</p>
					<p className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
						{providersStat?.value ?? "--"}
					</p>
				</div>
			</div>
		</div>
	);
}

function ExperimentalHeroIntro({ heroStats }: { heroStats: HeroStatItem[] }) {
	return (
		<div className="rounded-[2.25rem] border border-zinc-200/70 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:p-10">
			<div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
				<div>
					<Badge className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
						Experimental Gateway Hero
					</Badge>

					<h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl lg:text-6xl">
						Routing Infrastructure For{" "}
						<span className="relative whitespace-nowrap text-emerald-700 dark:text-emerald-300">
							<WordRotate
								words={[
									"Production AI",
									"Latency SLAs",
									"Multi-Cloud Failover",
									"Cost Controls",
								]}
								duration={4200}
							/>
						</span>
					</h1>

					<p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						Keep your current model stack, remove provider lock-in, and ship
						with tighter control over routing, reliability, and spend under one
						unified API contract.
					</p>

					<HeroActions ctaVariant="experimental" />

					<div className="mt-8 grid gap-3 sm:grid-cols-3">
						{heroStats.map((s) => (
							<div
								key={`chip-${s.label}`}
								className="rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
							>
								<p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
									{s.label}
								</p>
								<p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
									{s.value}
								</p>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-3xl border border-zinc-200/80 bg-zinc-950 p-6 text-zinc-100 dark:border-zinc-800">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
						Routing cockpit
					</p>
					<div className="mt-5 space-y-4">
						<div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
							<div className="mt-0.5 rounded-xl bg-emerald-500/20 p-2">
								<Route className="h-4 w-4 text-emerald-300" />
							</div>
							<div>
								<p className="text-sm font-semibold">Policy-driven routing</p>
								<p className="mt-1 text-xs leading-relaxed text-zinc-400">
									Route by latency budget, model quality, and provider health
									in real time.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
							<div className="mt-0.5 rounded-xl bg-sky-500/20 p-2">
								<Cpu className="h-4 w-4 text-sky-300" />
							</div>
							<div>
								<p className="text-sm font-semibold">Model portability</p>
								<p className="mt-1 text-xs leading-relaxed text-zinc-400">
									Swap providers without rewriting your SDK integration layer.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
							<div className="mt-0.5 rounded-xl bg-amber-500/20 p-2">
								<ShieldCheck className="h-4 w-4 text-amber-300" />
							</div>
							<div>
								<p className="text-sm font-semibold">Production guardrails</p>
								<p className="mt-1 text-xs leading-relaxed text-zinc-400">
									Enforce rate limits, spending boundaries, and fallback rules
									with one control plane.
								</p>
							</div>
						</div>
					</div>

					<div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
						<div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-400">
							<span>Live request efficiency</span>
							<span className="inline-flex items-center gap-1 text-emerald-300">
								<Zap className="h-3.5 w-3.5" />
								Stable
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-zinc-800">
							<div className="h-full w-[82%] rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function Hero({
	stats,
	tokensWindowHours = 24,
	heroVariant = "classic",
}: {
	stats?: GatewayHeroStats;
	tokensWindowHours?: number;
	heroVariant?: GatewayHeroVariant;
}) {
	const roundTo = (value: number | null, step: number) => {
		if (value == null) return null;
		return Math.max(0, Math.round(value / step) * step);
	};
	const formatWithPlus = (value: number | null, fallback = "--") => {
		if (value == null) return fallback;
		return `${new Intl.NumberFormat().format(value)}+`;
	};
	const formatTokens = (value: number | null, fallback = "0+") => {
		if (value == null) return fallback;
		const abs = Math.abs(value);
		if (abs < 1000) return `${Math.floor(value)}+`;
		const units = [
			{ threshold: 1e12, suffix: "T" },
			{ threshold: 1e9, suffix: "B" },
			{ threshold: 1e6, suffix: "M" },
			{ threshold: 1e3, suffix: "K" },
		];
		const unit = units.find((u) => abs >= u.threshold) ?? units[3];
		const scaled = Math.floor(value / unit.threshold);
		return `${scaled}${unit.suffix}+`;
	};
	const formatWindow = (hours: number) => {
		if (!Number.isFinite(hours) || hours <= 0) return "24h";
		if (hours % (24 * 30) === 0) return `${Math.round(hours / (24 * 30))}mo`;
		if (hours % 24 === 0) return `${Math.round(hours / 24)}d`;
		return `${Math.round(hours)}h`;
	};
	const tokensWindowLabel =
		tokensWindowHours >= 24 * 28
			? "Monthly tokens"
			: `${formatWindow(tokensWindowHours)} tokens`;

	const heroStats = [
		{
			label: tokensWindowLabel,
			value: formatTokens(stats?.tokens24h ?? null),
			icon: BarChart3,
			accent: "#10b981",
		},
		{
			label: "Models",
			value: formatWithPlus(roundTo(stats?.supportedModels ?? null, 25)),
			icon: Boxes,
			accent: "#f59e0b",
		},
		{
			label: "Providers",
			value: formatWithPlus(roundTo(stats?.supportedProviders ?? null, 5)),
			icon: Network,
			accent: "#8b5cf6",
		},
	] as HeroStatItem[];

	return (
		<section className="w-full">
			<div className="mx-auto px-6 pb-16 lg:px-8">
				{heroVariant === "experimental" ? (
					<ExperimentalHeroIntro heroStats={heroStats} />
				) : (
					<ClassicHeroIntro heroStats={heroStats} />
				)}
			</div>
		</section>
	);
}

