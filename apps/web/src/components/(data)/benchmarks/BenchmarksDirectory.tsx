import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQueryState } from "nuqs";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeCategory, type BenchmarkCategory } from "@/lib/benchmarks/boardResults";
import type { BenchmarkDirectoryEntry } from "@/lib/fetchers/benchmarks/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 60;
const ALL = "all";
type Sort = "models" | "updated" | "name";

export function relativeAge(value: string | undefined, locale: string, now = Date.now()): string | null {
	if (!value) return null;
	const time = new Date(value).getTime();
	if (Number.isNaN(time)) return null;
	const days = Math.round((time - now) / 86_400_000);
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	if (Math.abs(days) < 1) return format.format(0, "day");
	if (Math.abs(days) < 45) return format.format(days, "day");
	if (Math.abs(days) < 540) return format.format(Math.round(days / 30), "month");
	return format.format(Math.round(days / 365), "year");
}

/** Every benchmark with public results, browsable by category and source. Rows arrive pre-aggregated. */
export function BenchmarksDirectory({ entries }: { entries: BenchmarkDirectoryEntry[] }) {
	const t = useTranslations("Catalogue.benchmarks");
	const categoryT = useTranslations("Catalogue.benchmarks.categories");
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const [search, setSearch] = useQueryState("search", { defaultValue: "" });
	const [categoryParam, setCategory] = useQueryState("category", { defaultValue: "", shallow: true, scroll: false });
	const [sourceParam, setSource] = useQueryState("source", { defaultValue: "", shallow: true, scroll: false });
	const [sortParam, setSort] = useQueryState("sort", { defaultValue: "models", shallow: true, scroll: false });
	const [limit, setLimit] = useState(PAGE_SIZE);
	const sort: Sort = sortParam === "updated" || sortParam === "name" ? sortParam : "models";

	const withCategory = useMemo(() => entries.map((entry) => ({ ...entry, categoryKey: normalizeCategory(entry.category) })), [entries]);
	const sources = useMemo(() => {
		const counts = new Map<string, { id: string; label: string; count: number }>();
		for (const entry of withCategory) {
			if (!entry.sourceId) continue;
			const current = counts.get(entry.sourceId) ?? { id: entry.sourceId, label: entry.publisher && entry.sourceName && entry.publisher !== entry.sourceName ? `${entry.sourceName} (${entry.publisher})` : entry.sourceName ?? entry.publisher ?? entry.sourceId, count: 0 };
			current.count += 1;
			counts.set(entry.sourceId, current);
		}
		return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, locale));
	}, [withCategory, locale]);
	const source = sources.some((item) => item.id === sourceParam) ? sourceParam : null;
	const query = search.trim().toLocaleLowerCase();
	const matchesText = (entry: (typeof withCategory)[number]) => !query || `${entry.name} ${entry.id} ${entry.sourceName ?? ""} ${entry.publisher ?? ""}`.toLocaleLowerCase().includes(query);
	const inScope = withCategory.filter((entry) => matchesText(entry) && (!source || entry.sourceId === source));
	const categories = useMemo(() => {
		const counts = new Map<BenchmarkCategory, number>();
		for (const entry of inScope) counts.set(entry.categoryKey, (counts.get(entry.categoryKey) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : b[1] - a[1]));
	}, [inScope]);
	const category = categories.some(([key]) => key === categoryParam) ? (categoryParam as BenchmarkCategory) : null;
	const filtered = inScope
		.filter((entry) => !category || entry.categoryKey === category)
		.sort((a, b) => {
			if (sort === "name") return a.name.localeCompare(b.name, locale);
			if (sort === "updated") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.models - a.models;
			return b.models - a.models || a.name.localeCompare(b.name, locale);
		});
	const reset = () => setLimit(PAGE_SIZE);
	const sortLabel = sort === "name" ? t("nameAlphabetically") : sort === "updated" ? t("directory.recentlyUpdated") : t("mostModels");

	const categoryButton = (key: BenchmarkCategory | null, count: number) => (
		<button
			key={key ?? ALL}
			type="button"
			aria-pressed={category === key}
			onClick={() => { void setCategory(key); reset(); }}
			className={cn("flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted", category === key ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}
		>
			<span className="truncate">{key ? categoryT(key) : t("directory.allCategories")}</span>
			<span className="text-xs tabular-nums">{number.format(count)}</span>
		</button>
	);

	return (
		<section className="space-y-5" aria-label={t("allBenchmarks")}>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold">{t("allBenchmarks")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("directory.summary", { benchmarks: number.format(entries.length), sources: number.format(sources.length) })}</p>
				</div>
				<div className="flex w-full flex-wrap gap-2 sm:w-auto">
					<div className="relative min-w-48 flex-1 sm:w-64 sm:flex-none">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input aria-label={t("searchPlaceholder")} placeholder={t("searchPlaceholder")} value={search} onChange={(event) => { void setSearch(event.target.value); reset(); }} className="pl-9" />
					</div>
					{sources.length > 1 ? (
						<Select value={source ?? ALL} onValueChange={(value: string) => { void setSource(value === ALL ? null : value); reset(); }}>
							<SelectTrigger aria-label={t("directory.source")} className="w-44 shrink-0"><SelectValue>{source ? sources.find((item) => item.id === source)?.label : t("directory.allSources")}</SelectValue></SelectTrigger>
							<SelectContent align="end" alignItemWithTrigger={false} className="max-h-80">
								<SelectItem value={ALL}>{t("directory.allSources")}</SelectItem>
								{sources.map((item) => <SelectItem key={item.id} value={item.id}>{item.label} <span className="text-muted-foreground">({number.format(item.count)})</span></SelectItem>)}
							</SelectContent>
						</Select>
					) : null}
					<Select value={sort} onValueChange={(value: string) => { void setSort(value === "models" ? null : value); }}>
						<SelectTrigger aria-label={t("sortBenchmarks")} className="shrink-0"><SelectValue>{sortLabel}</SelectValue></SelectTrigger>
						<SelectContent align="end" alignItemWithTrigger={false}>
							<SelectItem value="models">{t("mostModels")}</SelectItem>
							<SelectItem value="updated">{t("directory.recentlyUpdated")}</SelectItem>
							<SelectItem value="name">{t("nameAlphabetically")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
				<nav aria-label={t("directory.categories")} className="hidden lg:block">
					<div className="sticky top-20 space-y-0.5">
						{categoryButton(null, inScope.length)}
						{categories.map(([key, count]) => categoryButton(key, count))}
					</div>
				</nav>
				<div className="lg:hidden">
					<Select value={category ?? ALL} onValueChange={(value: string) => { void setCategory(value === ALL ? null : value); reset(); }}>
						<SelectTrigger aria-label={t("directory.categories")} className="w-full"><SelectValue>{category ? categoryT(category) : t("directory.allCategories")}</SelectValue></SelectTrigger>
						<SelectContent className="max-h-80">
							<SelectItem value={ALL}>{t("directory.allCategories")} ({number.format(inScope.length)})</SelectItem>
							{categories.map(([key, count]) => <SelectItem key={key} value={key}>{categoryT(key)} ({number.format(count)})</SelectItem>)}
						</SelectContent>
					</Select>
				</div>

				<div className="min-w-0">
					<div className="hidden grid-cols-[minmax(0,1fr)_9rem_5rem_7rem] gap-4 border-b pb-2 text-xs text-muted-foreground sm:grid">
						<span>{t("directory.benchmark")}</span>
						<span>{t("directory.category")}</span>
						<span className="text-right">{t("models")}</span>
						<span className="text-right">{t("directory.updated")}</span>
					</div>
					<ul>
						{filtered.slice(0, limit).map((entry) => (
							<li key={entry.id}>
								<Link href={`/benchmarks/${entry.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b py-3 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_7rem]">
									<span className="min-w-0">
										<span className="block truncate text-sm font-medium group-hover:underline">{entry.name}</span>
										<span className="block truncate text-xs text-muted-foreground">{entry.publisher ?? entry.sourceName ?? t("directory.curated")}</span>
									</span>
									<span className="hidden truncate text-sm text-muted-foreground sm:block">{categoryT(entry.categoryKey)}</span>
									<span className="text-right text-sm tabular-nums">{number.format(entry.models)}<span className="sr-only"> {t("models")}</span></span>
									<span className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">{relativeAge(entry.updatedAt, locale) ?? "—"}</span>
								</Link>
							</li>
						))}
					</ul>
					{!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p> : null}
					{filtered.length > limit ? (
						<div className="pt-4 text-center">
							<Button variant="outline" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t("showMoreBenchmarks")}</Button>
							<p className="mt-2 text-xs text-muted-foreground">{t("showingCount", { shown: number.format(limit), total: number.format(filtered.length) })}</p>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
