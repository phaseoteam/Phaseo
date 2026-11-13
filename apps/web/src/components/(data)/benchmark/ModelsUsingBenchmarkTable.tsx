import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";

import React from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArtificialAnalysisScore, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { isEpochCapabilitiesIndex } from "@/lib/benchmarks/epoch";
import {
	formatBenchmarkScore,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

interface ClientProps {
	models: any[]; // flat list of models with provider and benchmark_results
	benchmarkId: string;
	benchmarkType: string | null;
	isLowerBetter: boolean;
}

function formatReportedDate(value: string | null | undefined, locale: string) {
	if (!value) return "-";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "-";
	return new Intl.DateTimeFormat(locale, {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(parsed);
}

function configurationCode(result: any) {
	const variant = typeof result?.variant === "string" ? result.variant : null;


	if (variant) return variant.toLowerCase();
	const description = typeof result?.other_info === "string" ? result.other_info.split(";")[0] : "";
	const detail = description.match(/\((.+)\)$/)?.[1] ?? "";
	if (/max effort/i.test(detail)) return "max";
	const namedEffort = detail.match(/\b(none|low|medium|high|xhigh|max)\b/i)?.[1];
	return namedEffort?.toLowerCase() ?? "default";
}

export default function ModelsUsingBenchmarkClient({
	models,
	benchmarkId,
	benchmarkType,
	isLowerBetter,
}: ClientProps) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.benchmarks");
	const tx = useTranslations();
	const [openRows, setOpenRows] = React.useState<Record<string, boolean>>({});
	const [search, setSearch] = React.useState("");
	const [configuration, setConfiguration] = React.useState("all");
	const [limit, setLimit] = React.useState(25);
	const filteredModels = models.filter((model) => `${model.name} ${model.organisation?.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
	const artificialAnalysis = isArtificialAnalysisBenchmark(benchmarkId);
	const epochCapabilitiesIndex = isEpochCapabilitiesIndex(benchmarkId);
	const rankedLeaderboard = artificialAnalysis || epochCapabilitiesIndex;
	const allArtificialAnalysisRows = models.flatMap((model) => (model.benchmark_results || []).map((result: any) => ({ model, result })));
	const configurations = [...new Set(allArtificialAnalysisRows.map(({ result }) => configurationCode(result)))].sort();
	const artificialAnalysisRows = allArtificialAnalysisRows.filter(({ result }) => configuration === "all" || configurationCode(result) === configuration).sort((left, right) => {
		const difference = Number(left.result.score) - Number(right.result.score);
		return isLowerBetter ? difference : -difference;
	}).map((row, index, rows) => ({
		...row,
		rank: index > 0 && Number(rows[index - 1].result.score) === Number(row.result.score) ? rows.slice(0, index).findIndex((item) => Number(item.result.score) === Number(row.result.score)) + 1 : index + 1,
	}));
	const visibleArtificialAnalysisRows = artificialAnalysisRows.filter(({ model }) => `${model.name} ${model.organisation?.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));

	function formatScoreDisplay(r: any) {
		const rawScore = r?.score ?? tx("Product.latency.nA" as never);
		const isPercentage = resolveBenchmarkIsPercentage({
			benchmarkType,
			rawScore,
		});
		const parsed = normalizeBenchmarkScoreValue(
			parseBenchmarkScore(rawScore),
			isPercentage
		);
		if (parsed !== null) {
			if (isArtificialAnalysisBenchmark(benchmarkId)) return formatArtificialAnalysisScore(benchmarkId, parsed, locale);
			return formatBenchmarkScore({
				value: parsed,
				isPercentage,
				fallback: rawScore,
				locale,
			});
		}
		if (rawScore !== tx("Product.latency.nA" as never) && typeof rawScore === "string") return rawScore;
		return tx("Catalogue.modelDetail.pricing.notAvailable" as never);
	}

	function sortResults(resultsArr: any[], isLowerBetter = false) {
		return [...resultsArr].sort((a, b) => {
			if (a.rank != null && b.rank != null) {
				const diff = a.rank - b.rank;
				if (diff !== 0) return diff;
			}
			const isAPercentage = resolveBenchmarkIsPercentage({
				benchmarkType,
				rawScore: a.score,
			});
			const isBPercentage = resolveBenchmarkIsPercentage({
				benchmarkType,
				rawScore: b.score,
			});
			const pb = normalizeBenchmarkScoreValue(
				parseBenchmarkScore(b.score ?? ""),
				isBPercentage
			);
			const pa = normalizeBenchmarkScoreValue(
				parseBenchmarkScore(a.score ?? ""),
				isAPercentage
			);
			if (pa != null && pb != null) {
				return isLowerBetter ? pa - pb : pb - pa;
			}
			return (a.score || "")
				.toString()
				.localeCompare((b.score || "").toString());
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h3 className="text-lg font-semibold">
					{t("tocModelResults")}
				</h3>
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
					{artificialAnalysis ? <Select value={configuration} onValueChange={(value) => { setConfiguration(value); setLimit(25); }}><SelectTrigger aria-label={tx("Common.ui.benchmarkChartCopy.filterResultsByConfiguration" as never)} className="sm:w-48"><SelectValue>{configuration === "all" ? tx("Catalogue.benchmarks.allConfigurations" as never) : localizedBenchmarkConfiguration(configuration, tx)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{tx("Catalogue.benchmarks.allConfigurations" as never)}</SelectItem>{configurations.map((value) => <SelectItem key={value} value={value}>{localizedBenchmarkConfiguration(value, tx)}</SelectItem>)}</SelectContent></Select> : null}
					<Input aria-label={tx("Common.ui.benchmarkChartCopy.searchBenchmarkResults" as never)} placeholder={tx("Product.internalTools.dataEditor.searchModelsPlaceholder" as never)} value={search} onChange={(event) => { setSearch(event.target.value); setLimit(25); }} className="sm:w-64" />
				</div>
			</div>
			{visibleArtificialAnalysisRows.length > 0 && rankedLeaderboard ? (
				<div className="overflow-hidden rounded-xl border">
					<div className="overflow-x-auto">
						<Table wrapInContainer={false} className="min-w-[580px] w-full text-sm">
							<TableHeader className="border-b bg-muted/40 text-xs text-muted-foreground [&_tr]:border-0">
								<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
									<TableHead className="h-auto text-inherit dark:text-inherit w-14 px-4 py-3 text-left font-medium">{tx("Site.homeQuickstart.rank" as never)}</TableHead>
									<TableHead className="h-auto text-inherit dark:text-inherit px-3 py-3 text-left font-medium">{tx("Common.ui.chatComposer.model" as never)}</TableHead>
									<TableHead className="h-auto text-inherit dark:text-inherit w-24 px-3 py-3 text-right font-medium">{tx("Common.ui.modelEditor.score" as never)}</TableHead>
									<TableHead className="h-auto text-inherit dark:text-inherit w-32 px-3 py-3 text-left font-medium">{tx("Common.ui.modelEditor.modelStatuses.released" as never)}</TableHead>
									<TableHead className="h-auto text-inherit dark:text-inherit w-14 px-3 py-3"><span className="sr-only">{tx("Common.ui.modelEditor.advanced.benchmarks.source" as never)}</span></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className="divide-y">
								{visibleArtificialAnalysisRows.slice(0, limit).map(({ model, result, rank }, index) => {
									const organisationLabel = model.organisation?.display_name || model.organisation?.name || tx("Common.status.unknown" as never);
									const configuration = localizedBenchmarkConfiguration(configurationCode(result), tx);
									return <TableRow key={result.id ?? `${model.id}-${configuration}-${index}`} className="transition-colors hover:bg-muted/25 dark:hover:bg-muted/25">
											<TableCell className="px-4 py-3 font-medium tabular-nums text-muted-foreground">{rank}</TableCell>
											<TableCell className="px-3 py-3"><div className="flex items-center gap-3">
												<span className="relative size-7 shrink-0 overflow-hidden rounded-md bg-muted"><Logo id={model.organisation?.organisation_id ?? model.id} alt="" fill className="object-contain p-1" /></span>
												<div className="min-w-0"><Link href={`/models/${model.id}`} className="block truncate font-medium hover:underline">{model.name}{artificialAnalysis ? <span className="text-muted-foreground"> ({configuration})</span> : null}</Link><span className="block truncate text-xs text-muted-foreground">{organisationLabel}</span></div>
											</div></TableCell>
											<TableCell className="px-3 py-3 text-right font-semibold tabular-nums">{formatScoreDisplay(result)}{epochCapabilitiesIndex && typeof result.other_info === "string" && result.other_info.match(/95% CI\s+([\d.]+)[–-]([\d.]+)/i) ? <span className="block whitespace-nowrap text-[10px] font-normal text-muted-foreground">{tx("Catalogue.benchmarks.confidenceInterval", { low: Number(result.other_info.match(/95% CI\s+([\d.]+)[–-]([\d.]+)/i)?.[1]).toLocaleString(locale), high: Number(result.other_info.match(/95% CI\s+([\d.]+)[–-]([\d.]+)/i)?.[2]).toLocaleString(locale) })}</span> : null}</TableCell>
											<TableCell className="px-3 py-3 text-muted-foreground">{formatReportedDate(model.reported_date, locale)}</TableCell>
											<TableCell className="px-3 py-3 text-right">{result.source_link ? <Button asChild variant="ghost" size="icon-sm"><a href={result.source_link} target="_blank" rel="noreferrer" aria-label={tx("Common.ui.benchmarkChartCopy.openSourceForModelConfiguration", { model: model.name, configuration })}><ExternalLink /></a></Button> : null}</TableCell>
										</TableRow>
									;
								})}
							</TableBody>
						</Table>
					</div>
				</div>
			) : filteredModels.length > 0 ? (
				<div className="overflow-x-auto">
					<Table wrapInContainer={false} className="min-w-full overflow-hidden rounded-2xl border border-zinc-200 text-sm shadow-xs dark:border-zinc-800">
						<TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-0">
							<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">
									{t("columnOrganization")}
								</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">{t("models")}</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">
									{t("columnReported")}
								</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">
									{t("columnTopScore")}
								</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">{t("columnInfo")}</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-center">
									{t("columnSelfReported")}
								</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit px-4 py-2 text-left">{t("columnSource")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredModels.slice(0, limit).map((model: any) => {
								const sorted = sortResults(
									model.benchmark_results || [],
									isLowerBetter
								);
								const top =
									model.top_score ?? sorted[0] ?? null;
								const topId = top?.id;
								const extraScores = topId
									? sorted.filter((item) => item.id !== topId)
									: sorted.slice(1);
								const anySelf = sorted.some(
									(s) => s.is_self_reported
								);
								const hasMultiple = extraScores.length > 0;
								const isOpen = openRows[model.id] || false;
								const organisationLabel =
									model.organisation?.display_name ||
									model.organisation?.name ||
									model.organisation?.organisation_id ||
									tx("Common.status.unknown" as never);
								const organisationTitle =
									model.organisation?.display_name ??
									model.organisation?.name ??
									organisationLabel;
								const organisationHref = model.organisation
									?.organisation_id
									? `/organisations/${model.organisation.organisation_id}`
									: undefined;
								const organisationNameElement = (
									<span
										className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200"
										title={organisationTitle}
									>
										{organisationLabel}
									</span>
								);

								return (
									<React.Fragment key={model.id}>
										<TableRow className="border-t border-zinc-200 dark:border-zinc-800">
											<TableCell className="px-4 py-2 text-left">
												<div className="flex items-center gap-3">
													{model.organisation
														?.organisation_id ? (
														<div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
															<Logo
																id={
																	model
																		.organisation
																		.organisation_id
																}
																alt={
																	model
																		.organisation
																		?.display_name ||
																	model
																		.organisation
																		?.name ||
												t("organizationLogoAlt")
																}
																width={24}
																height={24}
																className="object-contain"
															/>
														</div>
													) : (
														<div className="h-6 w-6 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />
													)}

													{organisationHref ? (
														<Link
															href={
																organisationHref
															}
															className="group inline-block"
														>
															{
																organisationNameElement
															}
														</Link>
													) : (
														<span className="group inline-block">
															{
																organisationNameElement
															}
														</span>
													)}
												</div>
											</TableCell>

											<TableCell className="px-4 py-2 font-semibold">
												{hasMultiple && (
													<button
														type="button"
														className="mr-2 inline-flex h-5 w-5 items-center justify-center text-indigo-600 underline decoration-transparent hover:decoration-current transition-colors duration-200 focus:outline-hidden align-middle"
														onClick={() =>
															setOpenRows(
																(prev) => ({
																	...prev,
																	[model.id]:
																		!isOpen,
																})
															)
														}
														aria-label={
															isOpen
										? t("hideScores")
										: t("showScores")
														}
													>
														{isOpen ? (
															<ChevronDown className="h-4 w-4" />
														) : (
															<ChevronRight className="h-4 w-4" />
														)}
													</button>
												)}
												<Link
													href={`/models/${model.id}`}
												>
													<span
														className="relative inline-block align-middle truncate font-semibold underline decoration-transparent hover:decoration-current transition-colors duration-200"
														title={model.name}
													>
														{model.name}
													</span>
												</Link>
											</TableCell>
							<TableCell className="px-4 py-2 text-left">
								{formatReportedDate(
									model.reported_date,
									locale
								)}
											</TableCell>
											<TableCell className="px-4 py-2 font-mono">
												{top
													? formatScoreDisplay(top)
													: "-"}
											</TableCell>
											<TableCell className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
												{top?.other_info || "-"}
											</TableCell>
											<TableCell className="px-4 py-2 text-center">
												<span
													className={
														anySelf
															? "rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
															: "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
													}
												>
									{anySelf ? t("yes") : t("no")}
												</span>
											</TableCell>
											<TableCell className="px-4 py-2 text-left">
												{top?.source_link ? (
													<a
														href={top.source_link}
														target="_blank"
														rel="noopener noreferrer"
														className="group inline-flex items-center text-indigo-600 dark:text-indigo-400"
													>
														<span className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
															{t("columnSource")}
														</span>
														<ExternalLink className="ml-1 h-3 w-3 text-indigo-500 opacity-0 transition-all group-hover:opacity-100 group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300" />
													</a>
												) : (
													"-"
												)}
											</TableCell>
										</TableRow>

										{hasMultiple &&
											isOpen &&
											extraScores.map(
												(item: any, idx: number) => (
													<TableRow
														key={`${item.id}-${idx}`}
														className={`border-t border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-900 ${
															idx ===
															extraScores.length -
																1
																? "rounded-b-xl"
																: ""
														}`}
													>
														<TableCell
															className="px-4 py-2 pl-8 font-mono"
															colSpan={3}
														></TableCell>
														<TableCell className="px-4 py-2 font-mono">
															{formatScoreDisplay(
																item
															)}
														</TableCell>
														<TableCell className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
															{item.other_info ||
																"-"}
														</TableCell>
														<TableCell className="px-4 py-2 text-center">
															<span
																className={
																	item.is_self_reported
																		? "rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
																		: "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
																}
																title={
																	item.is_self_reported
											? t("selfReportedTitle")
											: t("notSelfReportedTitle")
																}
															>
																{item.is_self_reported
											? t("yes")
											: t("no")}
															</span>
														</TableCell>
														<TableCell className="px-4 py-2">
															{item.source_link ? (
																<a
																	href={
																		item.source_link
																	}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="group inline-flex items-center text-indigo-600 dark:text-indigo-400"
																>
																	<span className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
																		{t("columnSource")}
																	</span>
																	<ExternalLink className="ml-1 h-3 w-3 text-indigo-500 opacity-0 transition-all group-hover:opacity-100 group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300" />
																</a>
															) : (
																"-"
															)}
														</TableCell>
													</TableRow>
												)
											)}
									</React.Fragment>
								);
							})}
						</TableBody>
					</Table>
				</div>
			) : (
				<p className="text-muted-foreground">
					{search ? t("noModelsMatchSearch") : t("noBenchmarkResults")}
				</p>
			)}
			{(rankedLeaderboard ? visibleArtificialAnalysisRows.length : filteredModels.length) > limit ? <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + 25)}>{tx("Common.ui.benchmarkChartCopy.showMoreResultsShownOfTotal", { shown: limit, total: rankedLeaderboard ? visibleArtificialAnalysisRows.length : filteredModels.length })}</Button> : null}
		</div>
	);
}
