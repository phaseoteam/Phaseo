import { type CSSProperties } from "react";
import { type Metadata } from "next";
import {
	Activity,
	ArrowUpRight,
	CircleDot,
	Clock3,
	HardDrive,
	Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const throughputProfiles = [
	{
		id: "fp32",
		title: "FP32 fidelity",
		tokensPerSec: 32,
		streamDuration: 16,
		warmStart: "Warm start: 1.8s",
		narrative:
			"Research-grade output with highest stability. Best for evals and long prompts.",
		snippet:
			"The model reasons step-by-step, keeping nuance and calibration intact for safety critical paths.",
		accent: "from-sky-500/20 via-sky-500/8 to-sky-500/5",
	},
	{
		id: "fp16",
		title: "FP16 balanced",
		tokensPerSec: 68,
		streamDuration: 9,
		warmStart: "Warm start: 0.9s",
		narrative:
			"Balanced latency and quality. Ideal for chat and product surfaces with steady demand.",
		snippet:
			"Responses land quickly while preserving tone and structure for multi-turn conversations.",
		accent: "from-emerald-500/20 via-emerald-500/8 to-emerald-500/5",
	},
	{
		id: "int8",
		title: "INT8 turbo",
		tokensPerSec: 112,
		streamDuration: 6,
		warmStart: "Warm start: 0.4s",
		narrative:
			"Throughput-first for routing and A/B sweeps. Expect tiny perplexity drift on edge cases.",
		snippet:
			"Text pours out almost instantly; great for precomputation, drafts, or agent inner loops.",
		accent: "from-amber-500/25 via-amber-500/10 to-amber-500/5",
	},
];

const latencyProfiles = [
	{
		id: "edge",
		label: "Edge POP + sticky sessions",
		latencyMs: 220,
		reliability: "Regional failover, p95 < 360ms",
		color: "from-emerald-400/40 via-emerald-400/10 to-transparent",
	},
	{
		id: "gpu-batch",
		label: "GPU cluster w/ smart batching",
		latencyMs: 480,
		reliability: "p95 < 760ms, burst handling enabled",
		color: "from-sky-400/40 via-sky-400/10 to-transparent",
	},
	{
		id: "cold-start",
		label: "Cold start + long context",
		latencyMs: 940,
		reliability: "Extra 400–600ms for cache fill & safety",
		color: "from-amber-400/40 via-amber-400/10 to-transparent",
	},
];

const uptimeBands = [
	{
		id: "three-nines",
		label: "99.9% (three nines)",
		minutesMonthly: 43.8,
		coverage: "≈ 8h 45m/year of potential interruption.",
		bestFor: "Chat surfaces where brief brownouts are acceptable.",
	},
	{
		id: "three-nine-five",
		label: "99.95%",
		minutesMonthly: 21.9,
		coverage: "≈ 4h 23m/year — typical for production LLM APIs.",
		bestFor: "Customer-facing flows with retries and fallbacks.",
	},
	{
		id: "four-nines",
		label: "99.99% (four nines)",
		minutesMonthly: 4.4,
		coverage: "≈ 52m/year — continuous delivery with redundancy.",
		bestFor: "Billing, assistants, gateways with multi-region quorum.",
	},
];

const quantizationOptions = [
	{
		id: "q-fp32",
		title: "FP32 — highest fidelity",
		size: "100%",
		speed: "1×",
		offset: "Baseline perplexity, best calibration for evals.",
		use: "Safety reviews, eval harnesses, research reproduction.",
	},
	{
		id: "q-fp16",
		title: "FP16 — balanced",
		size: "≈ 50%",
		speed: "1.6×",
		offset: "Identical vocab coverage with half the memory footprint, minimal drift.",
		use: "Interactive apps, streaming chat, steady workloads.",
	},
	{
		id: "q-int8",
		title: "INT8 — throughput",
		size: "≈ 25%",
		speed: "2.4×",
		offset: "Small perplexity lift on rare tokens, big gains in tokens/sec and cold starts.",
		use: "Batch inference, agent inner loops, rapid drafts.",
	},
];

export const metadata: Metadata = {
	title: "Model Performance Storyboard",
	description:
		"See how FP32, FP16, and INT8 deployments feel in practice—throughput, latency, uptime budgets, and quantization trade-offs in one place.",
	alternates: {
		canonical: "/performance",
	},
};

export default function PerformancePage() {
	return (
		<main className="bg-gradient-to-b from-white via-zinc-50/70 to-white dark:from-zinc-950 dark:via-zinc-900/50 dark:to-zinc-950">
			<div className="container mx-auto px-4 py-12 sm:px-6 lg:px-10">
				<header className="mb-12 space-y-4">
					<div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
						Model performance brief
						<ArrowUpRight className="h-4 w-4" />
					</div>
					<div className="space-y-3">
						<h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
							Throughput, latency, uptime — visualized for every
							model tier
						</h1>
						<p className="max-w-3xl text-lg text-slate-600 dark:text-slate-200">
							Benchmarks are one part of the story. This page
							shows how deployments actually feel: how fast tokens
							stream, what latency to expect, what uptime budgets
							mean in minutes, and how quantization changes
							performance.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<StatCard
							icon={Zap}
							label="Gateway median throughput"
							value="75 tokens/sec"
							footer="Across balanced FP16 routes"
						/>
						<StatCard
							icon={Clock3}
							label="P95 end-to-end latency"
							value="610 ms"
							footer="With routing + caching enabled"
						/>
						<StatCard
							icon={Activity}
							label="Observed availability"
							value="99.95%"
							footer="Multi-region gateway SLO"
						/>
					</div>
				</header>

				<section className="mb-12 space-y-6">
					<SectionHeader
						title="Throughput in practice"
						subtitle="See how FP32, FP16, and INT8 feel when tokens stream back-to-back."
					/>
					<div className="grid gap-6 lg:grid-cols-3">
						{throughputProfiles.map((profile) => (
							<ThroughputCard
								key={profile.id}
								profile={profile}
							/>
						))}
					</div>
				</section>

				<section className="mb-12 space-y-6">
					<SectionHeader
						title="Latency story"
						subtitle="Dots show request travel time from client to model and back. Shorter lanes = faster round trips."
					/>
					<div className="grid gap-4 lg:grid-cols-3">
						{latencyProfiles.map((lane) => (
							<LatencyLane key={lane.id} lane={lane} />
						))}
					</div>
				</section>

				<section className="mb-12 space-y-6">
					<SectionHeader
						title="Uptime budgets translated"
						subtitle="Availability targets converted into real downtime so you can pick the right SLO for each feature."
					/>
					<div className="grid gap-4 md:grid-cols-3">
						{uptimeBands.map((band) => (
							<UptimeCard key={band.id} band={band} />
						))}
					</div>
				</section>

				<section className="mb-4 space-y-6">
					<SectionHeader
						title="Quantization trade-offs"
						subtitle="How model size, speed, and quality shift across FP32, FP16, and INT8."
					/>
					<div className="grid gap-4 md:grid-cols-3">
						{quantizationOptions.map((option) => (
							<QuantizationCard key={option.id} option={option} />
						))}
					</div>
				</section>
			</div>
		</main>
	);
}

function SectionHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle: string;
}) {
	return (
		<div className="space-y-2">
			<h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
				{title}
			</h2>
			<p className="text-sm text-slate-600 dark:text-slate-300">
				{subtitle}
			</p>
		</div>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	footer,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	footer: string;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
			<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
				<span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-100">
					<Icon className="h-4 w-4" />
				</span>
				{label}
			</div>
			<div className="text-2xl font-semibold text-slate-900 dark:text-white">
				{value}
			</div>
			<p className="text-xs text-slate-500 dark:text-slate-400">
				{footer}
			</p>
		</div>
	);
}

function ThroughputCard({
	profile,
}: {
	profile: (typeof throughputProfiles)[number];
}) {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90 dark:ring-white/5">
			<div
				className={`absolute inset-x-4 top-3 h-20 rounded-2xl bg-gradient-to-r blur-3xl ${profile.accent}`}
				aria-hidden
			/>
			<div className="relative flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
						{profile.title}
					</p>
					<h3 className="text-2xl font-bold text-slate-900 dark:text-white">
						{profile.tokensPerSec} tokens/sec
					</h3>
				</div>
				<span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:border-zinc-700 dark:text-slate-200">
					{profile.warmStart}
				</span>
			</div>
			<p className="relative mt-3 text-sm text-slate-600 dark:text-slate-300">
				{profile.narrative}
			</p>
			<div className="relative mt-4 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50 p-3 shadow-inner dark:border-zinc-800/70 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
				<div className="flex items-center justify-between text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
					<span>Generation trace</span>
					<span>{profile.tokensPerSec} t/s</span>
				</div>
				<TokenStream
					text={profile.snippet}
					duration={profile.streamDuration}
				/>
			</div>
		</div>
	);
}

function TokenStream({ text, duration }: { text: string; duration: number }) {
	const tokens = text.split(" ");

	return (
		<div className="mt-2 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 dark:border-zinc-800/80 dark:bg-zinc-900/70">
			<div
				className="relative flex w-[200%] items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium text-slate-800 animate-token-stream dark:text-slate-100"
				style={
					{
						"--stream-duration": `${duration}s`,
					} as CSSProperties
				}
			>
				{tokens.map((token, index) => (
					<span
						key={`${token}-${index}`}
						className="rounded-md bg-white/90 px-2 py-1 text-[13px] shadow-sm ring-1 ring-black/5 dark:bg-zinc-800/80 dark:ring-white/5"
					>
						{token}
					</span>
				))}
				{tokens.map((token, index) => (
					<span
						key={`${token}-clone-${index}`}
						className="rounded-md bg-white/90 px-2 py-1 text-[13px] shadow-sm ring-1 ring-black/5 dark:bg-zinc-800/80 dark:ring-white/5"
						aria-hidden
					>
						{token}
					</span>
				))}
			</div>
		</div>
	);
}

function LatencyLane({ lane }: { lane: (typeof latencyProfiles)[number] }) {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
			<div
				className={`absolute inset-x-4 top-3 h-16 rounded-full bg-gradient-to-r blur-3xl ${lane.color}`}
				aria-hidden
			/>
			<div className="relative flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
				<span>{lane.label}</span>
				<span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-zinc-700 dark:text-slate-200">
					{lane.latencyMs} ms
				</span>
			</div>
			<p className="relative mt-2 text-xs text-slate-600 dark:text-slate-300">
				{lane.reliability}
			</p>
			<div className="relative mt-4 h-16 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50 to-white px-3 shadow-inner dark:border-zinc-800/70 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
				<div className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:ring-white/5">
					<div className="flex h-full w-full items-center justify-center text-[10px] font-semibold">
						You
					</div>
				</div>
				<div className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-slate-900 text-xs font-semibold text-white shadow-lg ring-2 ring-white/50 dark:bg-white dark:text-slate-900 dark:ring-zinc-200/60">
					<div className="flex h-full w-full items-center justify-center">
						LLM
					</div>
				</div>
				<div className="absolute left-12 right-12 top-1/2 -translate-y-1/2">
					<div className="relative h-2 rounded-full bg-slate-200/90 dark:bg-zinc-800">
						<span
							className="animate-latency-dot absolute -top-1 left-0 inline-flex h-4 w-4 rounded-full bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 shadow-lg ring-2 ring-white/60 dark:from-white dark:via-slate-200 dark:to-white dark:ring-zinc-800"
							style={
								{
									"--latency-duration": `${Math.max(
										lane.latencyMs / 300,
										0.6
									)}s`,
								} as CSSProperties
							}
						>
							<span className="absolute inset-0 rounded-full bg-slate-900/20 blur-md dark:bg-white/20" />
						</span>
					</div>
					<div
						className="animate-latency-ping absolute left-0 top-0 h-2 w-full rounded-full bg-gradient-to-r from-transparent via-slate-900/20 to-transparent dark:via-white/15"
						style={
							{
								"--latency-duration": `${Math.max(
									lane.latencyMs / 300,
									0.6
								)}s`,
							} as CSSProperties
						}
						aria-hidden
					/>
				</div>
			</div>
		</div>
	);
}

function UptimeCard({ band }: { band: (typeof uptimeBands)[number] }) {
	const downtimeHoursYear = (band.minutesMonthly * 12) / 60;
	const downtimeHoursRounded = Math.round(downtimeHoursYear * 10) / 10;
	const availability = band.label.split(" ")[0];

	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
						Availability target
					</p>
					<h3 className="text-2xl font-bold text-slate-900 dark:text-white">
						{availability}
					</h3>
				</div>
				<CircleDot className="h-6 w-6 text-emerald-500 dark:text-emerald-300" />
			</div>
			<div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm shadow-inner dark:border-zinc-800/80 dark:bg-zinc-900/70">
				<div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
					<span>Downtime allowance</span>
					<span>{band.minutesMonthly.toFixed(1)} min/month</span>
				</div>
				<div className="h-2 rounded-full bg-slate-200 dark:bg-zinc-800">
					<div
						className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500"
						style={{
							width: `${Math.min(
								(band.minutesMonthly / 60) * 100,
								100
							)}%`,
						}}
					/>
				</div>
				<p className="text-xs text-slate-600 dark:text-slate-300">
					{band.coverage}
				</p>
			</div>
			<div className="rounded-xl border border-slate-200/80 bg-white p-3 text-sm shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/60">
				<p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
					What it means
				</p>
				<p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
					{band.bestFor}
				</p>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Yearly allowance: ~{downtimeHoursRounded} hours
				</p>
			</div>
		</div>
	);
}

function QuantizationCard({
	option,
}: {
	option: (typeof quantizationOptions)[number];
}) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
			<div className="flex items-center justify-between gap-2">
				<div>
					<p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
						Quantization
					</p>
					<h3 className="text-xl font-semibold text-slate-900 dark:text-white">
						{option.title}
					</h3>
				</div>
				<HardDrive className="h-5 w-5 text-slate-500 dark:text-slate-300" />
			</div>
			<div className="mt-3 grid grid-cols-2 gap-3 text-sm">
				<div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/70">
					<p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
						Model size
					</p>
					<p className="text-lg font-semibold text-slate-900 dark:text-white">
						{option.size}
					</p>
				</div>
				<div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/70">
					<p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
						Relative speed
					</p>
					<p className="text-lg font-semibold text-slate-900 dark:text-white">
						{option.speed}
					</p>
				</div>
			</div>
			<div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm shadow-inner dark:border-zinc-800/70 dark:bg-zinc-900/70">
				<p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
					Quality shift
				</p>
				<p className="text-sm text-slate-700 dark:text-slate-200">
					{option.offset}
				</p>
			</div>
			<div className="mt-3 rounded-xl border border-dashed border-slate-200/80 bg-white/70 p-3 text-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
					Best for
				</p>
				<p className="text-sm text-slate-700 dark:text-slate-200">
					{option.use}
				</p>
			</div>
		</div>
	);
}
