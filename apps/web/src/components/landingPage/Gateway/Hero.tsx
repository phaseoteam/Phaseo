"use client";

import Link from "next/link";
import {
	Activity,
	BarChart3,
	Boxes,
	Network,
	ArrowRight,
	Shield,
	Zap,
	Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { WordRotate } from "@/components/ui/word-rotate";
import { Logo } from "@/components/Logo";
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/marquee";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

const TRUSTED_PROVIDERS = [
	{ id: "openai", label: "OpenAI" },
	{ id: "anthropic", label: "Anthropic" },
	{ id: "google", label: "Google" },
	{ id: "mistral", label: "Mistral" },
	{ id: "meta", label: "Meta" },
	{ id: "amazon-bedrock", label: "Amazon Bedrock" },
	{ id: "azure", label: "Azure" },
	{ id: "deepseek", label: "DeepSeek" },
	{ id: "x-ai", label: "xAI" },
	{ id: "cohere", label: "Cohere" },
];

type GatewayHeroStats = {
	uptimePct: number | null;
	tokens24h: number;
	supportedModels: number | null;
	supportedProviders: number | null;
};

function StatCard({
	label,
	value,
	icon: Icon,
	accent,
}: {
	label: string;
	value: string;
	icon: React.ElementType;
	accent: string;
}) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-300/80 hover:-translate-y-0.5">
			<div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
			<div className="relative flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-3xl font-bold tracking-tight text-slate-900">
						{value}
					</p>
					<p className="text-sm font-medium text-slate-500">
						{label}
					</p>
				</div>
				<div
					className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
					style={{ backgroundColor: `${accent}10` }}
				>
					<Icon className="h-6 w-6" style={{ color: accent }} />
				</div>
			</div>
		</div>
	);
}

export function Hero({
	stats,
	statsWindowHours = 24,
	tokensWindowHours = 24,
	popularModels,
}: {
	stats?: GatewayHeroStats;
	statsWindowHours?: number;
	tokensWindowHours?: number;
	popularModels?: ModelCardType[];
}) {
	const roundTo = (value: number | null, step: number) => {
		if (value == null) return null;
		return Math.max(0, Math.round(value / step) * step);
	};
	const formatWithPlus = (value: number | null, fallback = "—") => {
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
	const formatPercent = (value: number | null, fallback = "—") => {
		if (value == null) return fallback;
		return `${value.toFixed(2)}%`;
	};

		const formatWindow = (hours: number) => {
			if (!Number.isFinite(hours) || hours <= 0) return "24h";
			if (hours % (24 * 30) === 0)
				return `${Math.round(hours / (24 * 30))}mo`;
			if (hours % 24 === 0) return `${Math.round(hours / 24)}d`;
			return `${Math.round(hours)}h`;
		};
		const statsWindowLabel =
			statsWindowHours >= 24 * 28
				? "Monthly uptime"
				: `${formatWindow(statsWindowHours)} uptime`;
		const tokensWindowLabel =
			tokensWindowHours >= 24 * 28
				? "monthly tokens"
				: `${formatWindow(tokensWindowHours)} tokens`;

		const heroStats = [
			{
				label: statsWindowLabel,
				value: formatPercent(stats?.uptimePct ?? null),
				icon: Activity,
				accent: "#0ea5e9",
			},
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
			value: formatWithPlus(
				roundTo(stats?.supportedProviders ?? null, 5),
			),
			icon: Network,
			accent: "#8b5cf6",
		},
	];

	const featuredModels =
		popularModels && popularModels.length > 0 ? popularModels : [];

	return (
		<section className="w-full">
			{/* Content */}
			{/* Hero content */}
			<div className="mx-auto px-6 pb-16 lg:px-8">
				<div className="mx-auto max-w-4xl text-center">
					{/* Headline */}
					<h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
						The Single API For{" "}
						<span className="relative">
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

					{/* Subheadline */}
					<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
						Unify 50+ AI providers behind one API. Route
						intelligently by latency, cost, and availability. Ship
						production workloads with confidence.
					</p>

					{/* CTA buttons */}
					<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
						<Button
							asChild
							size="lg"
							className="h-12 gap-2 bg-slate-900 px-6 text-base font-medium text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800"
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
							className="h-12 gap-2 border-slate-200 px-6 text-base font-medium"
						>
							<Link href={DOCS_HREF}>
								<Globe2 className="h-4 w-4" />
								View documentation
							</Link>
						</Button>
					</div>
				</div>

				{/* Stats grid */}
				<div className="mx-auto mt-16 max-w-5xl">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{heroStats.map((s) => (
							<StatCard
								key={s.label}
								label={s.label}
								value={s.value}
								icon={s.icon}
								accent={s.accent}
							/>
						))}
					</div>
				</div>

				{/* Provider marquee */}
				<div className="border-y border-slate-200/60 bg-slate-50/50 py-8 my-8">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<p className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-slate-500">
							Trusted by teams using
						</p>
						<Marquee className="[--duration:40s]">
							<MarqueeFade side="left" />
							<MarqueeFade side="right" />
							<MarqueeContent>
								{TRUSTED_PROVIDERS.map((provider) => (
									<MarqueeItem key={provider.id}>
										<div className="flex items-center gap-3 rounded-full border border-slate-200/80 bg-white px-5 py-2.5 shadow-sm">
											<Logo
												id={provider.id}
												alt={provider.label}
												width={20}
												height={20}
												className="h-5 w-5 object-contain"
											/>
											<span className="text-sm font-medium text-slate-700">
												{provider.label}
											</span>
										</div>
									</MarqueeItem>
								))}
							</MarqueeContent>
						</Marquee>
					</div>
				</div>

				{/* Popular models */}
				{featuredModels.length > 0 && (
					<div className="mx-auto px-6 py-16 lg:px-8">
						<Card className="border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm">
							<CardHeader className="border-b border-slate-100 pb-4">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-lg font-semibold text-slate-900">
											Popular models
										</CardTitle>
										<CardDescription className="mt-1 text-slate-500">
											Access the models your team already
											trusts — same integration, any
											provider.
										</CardDescription>
									</div>
									<Button
										asChild
										variant="ghost"
										size="sm"
										className="text-slate-600 hover:text-slate-900"
									>
										<Link href="/models">
											View all
											<ArrowRight className="ml-1 h-3 w-3" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-6">
								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
									{featuredModels.map((model) => (
										<ModelCard
											key={model.model_id}
											model={model}
										/>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</section>
	);
}
