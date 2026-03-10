import { Activity, ArrowRightLeft, ShieldCheck, Workflow } from "lucide-react";

const CAPABILITIES = [
	{
		title: "Smart routing",
		body: "Route by latency, price, geography, or your own policy layer without forcing app teams to understand every provider quirk.",
		icon: Workflow,
	},
	{
		title: "Health-aware failover",
		body: "Shift traffic automatically when a provider slows down, errors spike, or a model rollout creates instability.",
		icon: Activity,
	},
	{
		title: "Predictable migrations",
		body: "Track model releases, deprecations, and replacements in the same platform you use to make routing decisions.",
		icon: ArrowRightLeft,
	},
	{
		title: "Controls for production teams",
		body: "Layer scopes, keys, policies, and auditability into the gateway so reliability does not depend on tribal knowledge.",
		icon: ShieldCheck,
	},
] as const;

export default function HomeReliabilitySection() {
	return (
		<section className="w-full border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
			<div className="space-y-8">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Reliability for production AI.
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Use one gateway layer to keep model access stable as providers shift, degrade,
						and evolve.
					</p>
				</div>
				<div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
					{CAPABILITIES.map((item) => {
						const Icon = item.icon;
						return (
							<div key={item.title} className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
								<div className="flex items-center gap-3">
									<div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-800/80">
										<Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
									</div>
									<h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
										{item.title}
									</h3>
								</div>
								<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
									{item.body}
								</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}

