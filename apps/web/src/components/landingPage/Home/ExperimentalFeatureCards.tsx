import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Logo } from "@/components/Logo";

const FEATURE_CARDS = [
	{
		title: "Model intelligence without the noise",
		body: "Browse benchmarks, pricing, provider coverage, and release movement in one calmer view before committing engineering time.",
		href: "/models",
		cta: "Explore the database",
		icon: Sparkles,
		type: "models" as const,
	},
	{
		title: "Gateway control that stays readable",
		body: "Ship through one OpenAI-compatible surface, then keep routing, fallback, and BYOK decisions flexible as providers shift.",
		href: "/",
		cta: "See platform overview",
		icon: Workflow,
		type: "routing" as const,
	},
] as const;

const PROVIDER_SET = [
	"openai",
	"anthropic",
	"google",
	"deepseek",
	"groq",
	"mistral",
	"x-ai",
	"amazon-bedrock",
] as const;

function ModelsVisual() {
	return (
		<div className="flex h-full flex-col justify-between rounded-[1.65rem] border border-zinc-200/80 bg-white p-4">
			<div className="flex flex-wrap gap-2">
				{PROVIDER_SET.slice(0, 6).map((provider) => (
					<div
						key={provider}
						className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/80 bg-white"
					>
						<div className="relative h-4.5 w-4.5">
							<Logo
								id={provider}
								alt={provider}
								variant="color"
								fill
								sizes="18px"
								className="object-contain"
							/>
						</div>
					</div>
				))}
			</div>
			<div className="grid grid-cols-3 gap-2">
				{[
					["Latency", "472ms"],
					["GPQA", "86.4"],
					["Providers", "60+"],
				].map(([label, value]) => (
					<div
						key={label}
						className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2"
					>
						<p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
							{label}
						</p>
						<p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
					</div>
				))}
			</div>
		</div>
	);
}

function RoutingVisual() {
	return (
		<div className="flex h-full flex-col gap-3 rounded-[1.65rem] border border-zinc-900/90 bg-zinc-950 p-4 text-white">
			<div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-400">
				<span>Gateway route</span>
				<span>healthy</span>
			</div>
			<div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
				<p className="text-sm font-semibold">openai/gpt-5.4</p>
				<p className="mt-1 text-xs leading-5 text-zinc-400">
					Primary route selected by latency policy.
				</p>
			</div>
			<div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
				<div className="flex items-center gap-2">
					<ShieldCheck className="h-4 w-4 text-zinc-300" />
					<p className="text-sm font-semibold">Fallback ready</p>
				</div>
				<p className="mt-1 text-xs leading-5 text-zinc-400">
					Anthropic and DeepSeek stay available without changing client code.
				</p>
			</div>
		</div>
	);
}

export default function ExperimentalFeatureCards() {
	return (
		<section className="grid gap-5 xl:grid-cols-2">
			{FEATURE_CARDS.map((card) => {
				const Icon = card.icon;
				return (
					<Link
						key={card.title}
						href={card.href}
						className="group rounded-[2rem] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(24,22,18,0.05)] transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-950/78 dark:hover:border-zinc-700"
					>
						<div className="flex h-full flex-col gap-6">
							<div className="flex items-center justify-between gap-3">
								<div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900/70">
									<Icon className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
								</div>
								<ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 dark:text-zinc-400" />
							</div>
							<div className="h-52">
								{card.type === "models" ? <ModelsVisual /> : <RoutingVisual />}
							</div>
							<div className="space-y-3">
								<h2 className="max-w-lg text-[1.8rem] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50">
									{card.title}
								</h2>
								<p className="max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
									{card.body}
								</p>
							</div>
							<span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
								{card.cta}
								<ArrowRight className="h-4 w-4" />
							</span>
						</div>
					</Link>
				);
			})}
		</section>
	);
}
