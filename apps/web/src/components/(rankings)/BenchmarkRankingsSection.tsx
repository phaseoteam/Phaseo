import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/Logo";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { HorizontalRankingChart } from "@/components/(rankings)/HorizontalRankingChart";

function scoreValue(score: number, type: string | null) {
	return type === "percentage" && Math.abs(score) <= 1 ? score * 100 : score;
}

function scoreLabel(score: number, type: string | null, locale: string) {
	const value = scoreValue(score, type);
	const formatted = value.toLocaleString(locale, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 2,
	});
	return type === "percentage" ? `${formatted}%` : formatted;
}

export async function BenchmarkRankingsSection({ benchmark }: { benchmark: PublicBenchmarkRanking }) {
	const [t, locale] = await Promise.all([
		getTranslations("Catalogue.rankings"),
		getLocale(),
	]);
	const chartEntries = benchmark.entries.slice(0, 20);
	const tableEntries = benchmark.entries.slice(0, 20);

	return (
		<section id="benchmarks" className="scroll-mt-32 space-y-6 border-t border-border pt-12">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="space-y-0.5">
					<h2 className="text-2xl font-semibold leading-8">{t("intelligenceIndex")}</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{t("benchmarkSectionDescription")}
					</p>
				</div>
				<Link
					href="https://artificialanalysis.ai/models"
					target="_blank"
					rel="noreferrer"
					className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					{t("viewBenchmarkMethodology")}
					<ExternalLink className="size-3.5" />
				</Link>
			</div>

			<div className="space-y-3">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
					<div>
						<h3 className="text-lg font-semibold">{benchmark.name}</h3>
						<p className="text-xs text-muted-foreground">
							{t("matchedPhaseoModels", { count: new Intl.NumberFormat(locale).format(benchmark.entries.length) })} · {t("higherIsBetter")}
						</p>
					</div>
					<span className="text-xs text-muted-foreground">{t("sourceLabel")}: Artificial Analysis</span>
				</div>
				<HorizontalRankingChart
					entries={chartEntries.map((entry) => ({
						key: entry.model_id,
						label: entry.model_name,
						value: scoreValue(entry.score, benchmark.benchmark_type),
						valueLabel: scoreLabel(entry.score, benchmark.benchmark_type, locale),
						logoId: entry.organisation_id ?? entry.model_id,
					}))}
				/>
			</div>

			<div className="grid gap-x-16 gap-y-1 md:grid-cols-2">
					{tableEntries.map((entry, index) => (
								<div key={entry.model_id} className="grid min-h-14 grid-cols-[2rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5">
									<span className="tabular-nums text-muted-foreground">{index + 1}.</span>
									<span className="relative flex size-7 items-center justify-center rounded-md border bg-background">
										<Logo id={entry.organisation_id ?? entry.model_id} alt="" width={18} height={18} className="object-contain" />
									</span>
									<div className="min-w-0">
										<Link href={`/models/${entry.model_id}`} className="block truncate font-semibold underline decoration-transparent underline-offset-2 hover:decoration-current">
											{entry.model_name}
										</Link>
										{entry.organisation_id ? (
											<Link href={`/organisations/${entry.organisation_id}`} className="text-xs text-muted-foreground underline decoration-transparent underline-offset-2 hover:decoration-current">
												{t("modelByOrganisation", { name: entry.organisation_name ?? entry.organisation_id })}
											</Link>
										) : null}
									</div>
								<span className="text-sm font-medium tabular-nums">{scoreLabel(entry.score, benchmark.benchmark_type, locale)}</span>
								</div>
					))}
			</div>
		</section>
	);
}
