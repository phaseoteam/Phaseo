import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Logo } from "@/components/Logo";



const PROVIDER_SET = [
	"openai",
	"anthropic",
	"google",
	"deepseek",
	"groq",
	"mistral",
	"spacex-ai",
	"amazon-bedrock",
] as const;

function ModelsVisual() {
	const locale = useLocale();
	const tCopy = useTranslations("Site.landingGaps");

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
					[tCopy("latency"), new Intl.NumberFormat(locale, { style: "unit", unit: "millisecond", unitDisplay: "short" }).format(472)],
					["GPQA", new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(86.4)],
					[tCopy("providers"), `${new Intl.NumberFormat(locale).format(60)}+`],
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
	const tCopy = useTranslations("Site.landingGaps");

	return (
		<div className="flex h-full flex-col gap-3 rounded-[1.65rem] border border-zinc-900/90 bg-zinc-950 p-4 text-white">
			<div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-400">
				<span>
{tCopy("copy075")}
</span>
				<span>
{tCopy("copy076")}
</span>
			</div>
			<div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
				<p className="text-sm font-semibold">openai/gpt-6-astra</p>
				<p className="mt-1 text-xs leading-5 text-zinc-400">
{tCopy("copy078")}
</p>
			</div>
			<div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
				<div className="flex items-center gap-2">
					<ShieldCheck className="h-4 w-4 text-zinc-300" />
					<p className="text-sm font-semibold">
{tCopy("copy079")}
</p>
				</div>
				<p className="mt-1 text-xs leading-5 text-zinc-400">
{tCopy("copy080")}
</p>
			</div>
		</div>
	);
}

export default function ExperimentalFeatureCards() {
	const tCopy = useTranslations("Site.landingGaps");

	const FEATURE_CARDS = [
	{
		title: tCopy("copy069"),
		body: tCopy("copy070"),
		href: "/models",
		cta: tCopy("copy071"),
		icon: Sparkles,
		type: "models" as const,
	},
	{
		title: tCopy("copy072"),
		body: tCopy("copy073"),
		href: "/",
		cta: tCopy("copy074"),
		icon: Workflow,
		type: "routing" as const,
	},
] as const;

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
