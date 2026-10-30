import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const OBSERVABILITY_ITEMS = [
	{
		titleKey: "traceTitle",
		bodyKey: "traceBody",
	},
	{
		titleKey: "routingTitle",
		bodyKey: "routingBody",
	},
	{
		titleKey: "regressionsTitle",
		bodyKey: "regressionsBody",
	},
] as const;

export default function HomeObservabilitySection() {
	const t = useTranslations("Site.home.observability");

	return (
		<section className="w-full border-b border-zinc-200/80 pb-16 dark:border-zinc-800/80">
			<div className="space-y-8">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						{t("title")}
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						{t("description")}
					</p>
					<div className="flex justify-center">
						<Button asChild variant="outline" className="h-11 rounded-xl px-6 text-sm font-semibold">
							<Link href="/settings/usage">
								{t("dashboard")}
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>
				<div className="grid gap-6 sm:grid-cols-3">
					{OBSERVABILITY_ITEMS.map((item) => (
						<div key={item.titleKey} className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
							<h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
								{t(item.titleKey)}
							</h3>
							<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
								{t(item.bodyKey)}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
