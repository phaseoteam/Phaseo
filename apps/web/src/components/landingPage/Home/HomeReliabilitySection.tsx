import { Activity, ArrowRightLeft, ShieldCheck, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";

const CAPABILITIES = [
	{
		titleKey: "smartRoutingTitle",
		bodyKey: "smartRoutingBody",
		icon: Workflow,
	},
	{
		titleKey: "failoverTitle",
		bodyKey: "failoverBody",
		icon: Activity,
	},
	{
		titleKey: "migrationsTitle",
		bodyKey: "migrationsBody",
		icon: ArrowRightLeft,
	},
	{
		titleKey: "controlsTitle",
		bodyKey: "controlsBody",
		icon: ShieldCheck,
	},
] as const;

export default function HomeReliabilitySection() {
	const t = useTranslations("Site.home.reliability");

	return (
		<section className="w-full border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
			<div className="space-y-8">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						{t("title")}
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						{t("description")}
					</p>
				</div>
				<div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
					{CAPABILITIES.map((item) => {
						const Icon = item.icon;
						return (
							<div key={item.titleKey} className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
								<div className="flex items-center gap-3">
									<div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-800/80">
										<Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
									</div>
									<h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
										{t(item.titleKey)}
									</h3>
								</div>
								<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
									{t(item.bodyKey)}
								</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
