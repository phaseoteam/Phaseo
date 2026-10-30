import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Activity, Route, Timer, Lock, Globe, Layers, ArrowRight } from "lucide-react";

const DOCS_HREF = "https://phaseo.app/docs/v1/quickstart";



export function Features() {
	const tCopy = useTranslations("Site.landingGaps");

	const FEATURE_CARDS = [
	{
		title: tCopy("copy014"),
		body: tCopy("copy015"),
		highlights: [
			tCopy("copy016"),
			tCopy("copy017"),
			tCopy("copy018"),
		],
		tag: tCopy("copy019"),
		icon: Globe,
		accent: "#f59e0b",
	},
	{
		title: tCopy("copy020"),
		body: tCopy("copy021"),
		highlights: [
			tCopy("copy022"),
			tCopy("copy023"),
			tCopy("copy024"),
		],
		tag: tCopy("copy025"),
		icon: Activity,
		accent: "#10b981",
	},
	{
		title: tCopy("copy026"),
		body: tCopy("copy027"),
		highlights: [
			tCopy("copy028"),
			tCopy("copy029"),
			tCopy("copy030"),
		],
		tag: tCopy("copy031"),
		icon: Route,
		accent: "#f97316",
	},
	{
		title: tCopy("copy032"),
		body: tCopy("copy033"),
		highlights: [
			tCopy("copy034"),
			tCopy("copy035"),
			tCopy("copy036"),
		],
		tag: tCopy("copy037"),
		icon: Timer,
		accent: "#e11d48",
	},
	{
		title: tCopy("copy038"),
		body: tCopy("copy039"),
		highlights: [
			tCopy("copy040"),
			tCopy("copy041"),
			tCopy("copy042"),
		],
		tag: tCopy("copy043"),
		icon: Layers,
		accent: "#ec4899",
	},
	{
		title: tCopy("copy044"),
		body: tCopy("copy045"),
		highlights: [
			tCopy("copy046"),
			tCopy("copy047"),
			tCopy("copy048"),
		],
		tag: tCopy("copy049"),
		icon: Lock,
		accent: "#111827",
	},
];

	return (
		<section id="features" className="py-8">
			<div className="mx-auto px-6 lg:px-8">
				<div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
					<div className="space-y-6">
						<h2 className="max-w-xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
{tCopy("copy050")}
</h2>
						<p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
{tCopy("copy051")}
</p>

						<div className="space-y-4 border-l border-zinc-200 pl-4 dark:border-zinc-800">
							<div className="flex items-start gap-3">
								<Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
{tCopy("copy052")}
</p>
							</div>
							<div className="flex items-start gap-3">
								<Route className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
{tCopy("copy053")}
</p>
							</div>
							<div className="flex items-start gap-3">
								<Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
								<p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
{tCopy("copy054")}
</p>
							</div>
						</div>

						<div className="pt-2">
							<Link
								href={DOCS_HREF}
								className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
							>
{tCopy("copy055")}
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

