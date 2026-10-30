"use client";

import USvsChinaCard from "./USvsChina";
import OpenVsClosedCard from "./OpenvsClosed";
import OrgsOverTimeCard from "./OrgsOverTime";
import FamilyForecastCard from "./FamilyForecast";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export default function TrendsStrip() {
	const t = useTranslations("Site.home.trends");
	return (
		<section className="mt-8 space-y-8 rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-zinc-100/60 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900/70">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-2 text-left">
					<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400">
						<Sparkles className="h-3.5 w-3.5" />
						{t("eyebrow")}
					</div>
					<h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						{t("title")}
					</h2>
					<p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
						{t("description")}
					</p>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<USvsChinaCard />
				<OpenVsClosedCard />
				<OrgsOverTimeCard />
			</div>

			<FamilyForecastCard />
		</section>
	);
}
