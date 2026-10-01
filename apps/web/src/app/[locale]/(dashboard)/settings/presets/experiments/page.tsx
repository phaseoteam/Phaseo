import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Suspense } from "react";
import {
	BarChart3,
	BookOpen,
	ChevronDown,
	ChevronUp,
	ChevronsUpDown,
	GitCompareArrows,
	MessageSquareText,
	Plus,
	SlidersHorizontal,
} from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import {
	PresetFeedbackDetailDialog,
	type PresetFeedbackDetail,
} from "@/components/(gateway)/settings/presets/experiments/PresetFeedbackDetailDialog";
import { PresetFeedbackFilters } from "@/components/(gateway)/settings/presets/experiments/PresetFeedbackFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PresetComparisonExplorer } from "@/components/(gateway)/settings/presets/experiments/PresetComparisonExplorer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { getLocale, getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.presetFeedback")} - ${t("headers.settings")}` };
}

type SearchParams = Record<string, string | string[] | undefined>;

type PresetRow = {
	id: string;
	name: string;
	slug: string | null;
	description: string | null;
	config: unknown;
};

type FeedbackRow = {
	id: string;
	request_id: string | null;
	session_id: string | null;
	preset_id: string | null;
	rating: string | null;
	score: number | string | null;
	reason: string | null;
	reason_tags: string[] | null;
	comment: string | null;
	metadata_dimensions: unknown;
	end_user_id: string | null;
	created_at: string | null;
};

type RangeFilter = "7d" | "30d" | "90d" | "custom";
type RatingFilter =
	| "all"
	| "thumbs_up"
	| "thumbs_down"
	| "correct"
	| "partly_correct"
	| "incorrect"
	| "unsafe"
	| "unrated";
type SortDirection = "asc" | "desc";
type SortKey =
	| "preset"
	| "feedback"
	| "delta"
	| "positive"
	| "negative"
	| "partial"
	| "requests"
	| "sessions"
	| "last_feedback";

type Filters = {
	range: RangeFilter;
	from: string;
	to: string;
	fromIso: string;
	toIso: string;
	baselineId: string | null;
	metadataKey: string;
	metadataValue: string;
	presetQuery: string;
	rating: RatingFilter;
	sort: SortKey;
	direction: SortDirection;
};

type Summary = {
	preset: PresetRow;
	count: number;
	positive: number;
	negative: number;
	partial: number;
	requestIds: Set<string>;
	sessionIds: Set<string>;
	latestFeedbackAt: string | null;
	ratings: Record<string, number>;
	metadataKeys: Set<string>;
};

type CohortSummary = {
	value: string;
	count: number;
	positive: number;
	negative: number;
	partial: number;
};

const DEFAULT_SORT: SortKey = "positive";
const DEFAULT_DIRECTION: SortDirection = "desc";
const RATING_FILTERS = new Set<RatingFilter>([
	"all",
	"thumbs_up",
	"thumbs_down",
	"correct",
	"partly_correct",
	"incorrect",
	"unsafe",
	"unrated",
]);
const SORT_KEYS = new Set<SortKey>([
	"preset",
	"feedback",
	"delta",
	"positive",
	"negative",
	"partial",
	"requests",
	"sessions",
	"last_feedback",
]);

function getParam(params: SearchParams | undefined, key: string): string | undefined {
	const value = params?.[key];
	if (Array.isArray(value)) return value[0];
	return value;
}

function toDateInput(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function validDateInput(value: string | undefined): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(date.getTime()) && toDateInput(date) === value;
}

function startOfDayIso(value: string): string {
	return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function endOfDayIso(value: string): string {
	return new Date(`${value}T23:59:59.999Z`).toISOString();
}

function parseFilters(params: SearchParams | undefined): Filters {
	const now = new Date();
	const rangeParam = getParam(params, "range");
	const range: RangeFilter =
		rangeParam === "7d" || rangeParam === "90d" || rangeParam === "custom"
			? rangeParam
			: "30d";
	const today = toDateInput(now);
	const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
	const defaultFromDate = new Date(now);
	defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - days);
	const defaultFrom = toDateInput(defaultFromDate);
	const requestedFrom = getParam(params, "from");
	const requestedTo = getParam(params, "to");
	const from = range === "custom" && validDateInput(requestedFrom) ? requestedFrom : defaultFrom;
	const to = range === "custom" && validDateInput(requestedTo) ? requestedTo : today;
	const ratingParam = getParam(params, "rating") as RatingFilter | undefined;
	const sortParam = getParam(params, "sort") as SortKey | undefined;
	const directionParam = getParam(params, "direction");
	return {
		range,
		from,
		to,
		fromIso: startOfDayIso(from),
		toIso: endOfDayIso(to),
		baselineId: getParam(params, "baseline_id") ?? null,
		metadataKey: cleanDimensionKey(getParam(params, "metadata_key") ?? "") ?? "",
		metadataValue: (getParam(params, "metadata_value") ?? "").trim().slice(0, 256),
		presetQuery: (getParam(params, "preset_q") ?? "").trim().slice(0, 120),
		rating: ratingParam && RATING_FILTERS.has(ratingParam) ? ratingParam : "all",
		sort: sortParam && SORT_KEYS.has(sortParam) ? sortParam : DEFAULT_SORT,
		direction: directionParam === "asc" ? "asc" : DEFAULT_DIRECTION,
	};
}

function cleanDimensionKey(value: string): string | null {
	const key = value.trim().slice(0, 64);
	return /^[a-zA-Z0-9_.:-]+$/.test(key) ? key : null;
}

function getDimensions(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const dimensions: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
		if (typeof rawValue !== "string") continue;
		dimensions[key] = rawValue;
	}
	return dimensions;
}

function createSummary(preset: PresetRow): Summary {
	return {
		preset,
		count: 0,
		positive: 0,
		negative: 0,
		partial: 0,
		requestIds: new Set(),
		sessionIds: new Set(),
		latestFeedbackAt: null,
		ratings: {},
		metadataKeys: new Set(),
	};
}

function toFiniteScore(value: number | string | null): number | null {
	if (value === null || value === "") return null;
	const score = Number(value);
	return Number.isFinite(score) ? score : null;
}

function addFeedback(summary: Summary, row: FeedbackRow) {
	summary.count += 1;
	const rating = row.rating ?? "unrated";
	summary.ratings[rating] = (summary.ratings[rating] ?? 0) + 1;
	if (rating === "thumbs_up" || rating === "correct") summary.positive += 1;
	if (rating === "thumbs_down" || rating === "incorrect" || rating === "unsafe") {
		summary.negative += 1;
	}
	if (rating === "partly_correct") summary.partial += 1;
	if (row.request_id) summary.requestIds.add(row.request_id);
	if (row.session_id) summary.sessionIds.add(row.session_id);
	if (row.created_at && (!summary.latestFeedbackAt || row.created_at > summary.latestFeedbackAt)) {
		summary.latestFeedbackAt = row.created_at;
	}
	for (const key of Object.keys(getDimensions(row.metadata_dimensions))) {
		summary.metadataKeys.add(key);
	}
}

function buildCohorts(rows: FeedbackRow[], metadataKey: string): CohortSummary[] {
	if (!metadataKey) return [];
	const cohorts = new Map<string, CohortSummary>();
	for (const row of rows) {
		const value = getDimensions(row.metadata_dimensions)[metadataKey];
		if (!value) continue;
		const summary =
			cohorts.get(value) ?? {
				value,
				count: 0,
				positive: 0,
				negative: 0,
				partial: 0,
			};
		summary.count += 1;
		const rating = row.rating ?? "";
		if (rating === "thumbs_up" || rating === "correct") summary.positive += 1;
		if (rating === "thumbs_down" || rating === "incorrect" || rating === "unsafe") {
			summary.negative += 1;
		}
		if (rating === "partly_correct") summary.partial += 1;
		cohorts.set(value, summary);
	}
	return Array.from(cohorts.values())
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
		.slice(0, 30);
}

function formatDate(value: string | null | undefined, locale: string, neverLabel: string): string {
	if (!value) return neverLabel;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return neverLabel;
	return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateInput(value: string, locale: string): string {
	const date = new Date(value + "T00:00:00.000Z");
	return new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}
function formatScore(value: number | null, locale: string, notAvailableLabel: string): string {
	if (value === null || !Number.isFinite(value)) return notAvailableLabel;
	return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function formatRate(numerator: number, denominator: number, locale: string, notAvailableLabel: string): string {
	if (denominator === 0) return notAvailableLabel;
	return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(numerator / denominator);
}

function formatDelta(value: number | null, baseline: number | null, locale: string, notAvailableLabel: string, percentagePointsLabel: string): string {
	if (value === null || baseline === null) return notAvailableLabel;
	const delta = Math.round((value - baseline) * 100);
	return (delta > 0 ? "+" : "") + new Intl.NumberFormat(locale).format(delta) + " " + percentagePointsLabel;
}

function compactDimensions(value: unknown, noMetadataLabel: string): string {
	const dimensions = getDimensions(value);
	const entries = Object.entries(dimensions).slice(0, 3);
	if (entries.length === 0) return noMetadataLabel;
	return entries.map(([key, val]) => `${key}: ${val}`).join(", ");
}

function positiveRate(summary: Summary): number | null {
	if (summary.count === 0) return null;
	return summary.positive / summary.count;
}

function negativeRate(summary: Summary): number | null {
	if (summary.count === 0) return null;
	return summary.negative / summary.count;
}

function partialRate(summary: Summary): number | null {
	if (summary.count === 0) return null;
	return summary.partial / summary.count;
}

function deltaFromBaseline(summary: Summary, baselinePositiveRate: number | null): number | null {
	const rate = positiveRate(summary);
	if (rate === null || baselinePositiveRate === null) return null;
	return rate - baselinePositiveRate;
}

function compareNullableNumbers(
	a: number | null,
	b: number | null,
	direction: SortDirection,
): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	const diff = a - b;
	return direction === "asc" ? diff : -diff;
}

function sortSummaries(
	summaries: Summary[],
	sort: SortKey,
	direction: SortDirection,
	baselinePositiveRate: number | null,
): Summary[] {
	return summaries.slice().sort((a, b) => {
		let result = 0;
		if (sort === "preset") {
			result = a.preset.name.localeCompare(b.preset.name, undefined, {
				sensitivity: "base",
			});
			result = direction === "asc" ? result : -result;
		} else if (sort === "feedback") {
			result = compareNullableNumbers(a.count, b.count, direction);
		} else if (sort === "delta") {
			result = compareNullableNumbers(
				deltaFromBaseline(a, baselinePositiveRate),
				deltaFromBaseline(b, baselinePositiveRate),
				direction,
			);
		} else if (sort === "positive") {
			result = compareNullableNumbers(positiveRate(a), positiveRate(b), direction);
		} else if (sort === "negative") {
			result = compareNullableNumbers(negativeRate(a), negativeRate(b), direction);
		} else if (sort === "partial") {
			result = compareNullableNumbers(partialRate(a), partialRate(b), direction);
		} else if (sort === "requests") {
			result = compareNullableNumbers(a.requestIds.size, b.requestIds.size, direction);
		} else if (sort === "sessions") {
			result = compareNullableNumbers(a.sessionIds.size, b.sessionIds.size, direction);
		} else if (sort === "last_feedback") {
			const aTime = a.latestFeedbackAt ? Date.parse(a.latestFeedbackAt) : null;
			const bTime = b.latestFeedbackAt ? Date.parse(b.latestFeedbackAt) : null;
			result = compareNullableNumbers(aTime, bTime, direction);
		}
		return result || a.preset.name.localeCompare(b.preset.name);
	});
}

function buildFeedbackHref(
	filters: Filters,
	overrides: Partial<Pick<Filters, "sort" | "direction" | "presetQuery">>,
): string {
	const next = { ...filters, ...overrides };
	const params = new URLSearchParams();
	if (next.baselineId) params.set("baseline_id", next.baselineId);
	if (next.range !== "30d") params.set("range", next.range);
	if (next.range === "custom") {
		params.set("from", next.from);
		params.set("to", next.to);
	}
	if (next.metadataKey) params.set("metadata_key", next.metadataKey);
	if (next.metadataValue) params.set("metadata_value", next.metadataValue);
	if (next.presetQuery) params.set("preset_q", next.presetQuery);
	if (next.rating !== "all") params.set("rating", next.rating);
	if (next.sort !== DEFAULT_SORT) params.set("sort", next.sort);
	if (next.direction !== DEFAULT_DIRECTION) params.set("direction", next.direction);
	const query = params.toString();
	return `/settings/presets/experiments${query ? `?${query}` : ""}`;
}

function presetDisplayName(preset: Pick<PresetRow, "name" | "slug">): string {
	const rawName = preset.name.trim().replace(/^@/, "");
	const slug = (preset.slug ?? "").trim().replace(/^@/, "");
	if (rawName && (!slug || rawName.toLowerCase() !== slug.toLowerCase())) return rawName;
	const source = slug || rawName || "Untitled Preset";
	return source
		.split(/[-_]+/)
		.filter(Boolean)
		.map((word) => {
			if (word.toLowerCase() === "xs") return "XS";
			if (/^\d+$/.test(word)) return word;
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(" ");
}

async function loadPresetFeedbackData(filters: Filters) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) return { workspaceId: null };
	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	const { data: presetsData, error: presetsError } = await supabase
		.from("presets")
		.select("id,name,slug,description,config")
		.eq("workspace_id", workspaceId)
		.order("name", { ascending: true });
	if (presetsError) throw presetsError;
	const presets = (presetsData ?? []) as PresetRow[];
	const presetIds = presets.map((preset) => preset.id);

	let feedback: FeedbackRow[] = [];
	let feedbackTruncated = false;
	if (presetIds.length > 0) {
		const pageSize = 1_000;
		const maxFeedbackRows = 10_000;
		for (let offset = 0; offset < maxFeedbackRows; offset += pageSize) {
			let query = supabase
				.from("gateway_feedback")
				.select(
					"id,request_id,session_id,preset_id,rating,score,reason,reason_tags,comment,metadata_dimensions,end_user_id,created_at",
				)
				.eq("workspace_id", workspaceId)
				.in("preset_id", presetIds)
				.gte("created_at", filters.fromIso)
				.lte("created_at", filters.toIso)
				.order("created_at", { ascending: false })
				.order("id", { ascending: false })
				.range(offset, offset + pageSize - 1);
			if (filters.rating === "unrated") {
				query = query.is("rating", null);
			} else if (filters.rating !== "all") {
				query = query.eq("rating", filters.rating);
			}
			if (filters.metadataKey && filters.metadataValue) {
				query = query.contains("metadata_dimensions", {
					[filters.metadataKey]: filters.metadataValue,
				});
			}
			const { data, error } = await query;
			if (error) throw error;
			const page = (data ?? []) as FeedbackRow[];
			feedback.push(...page);
			if (page.length < pageSize) break;
			if (feedback.length >= maxFeedbackRows) feedbackTruncated = true;
		}
	}

	return { workspaceId, presets, feedback, feedbackTruncated };
}

export default function PresetExperimentsPage(props: {
	searchParams?: Promise<SearchParams>;
}) {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<PresetFeedbackContent searchParams={props.searchParams} />
		</Suspense>
	);
}

async function PresetFeedbackContent({
	searchParams,
}: {
	searchParams?: Promise<SearchParams>;
}) {
	await connection();
	const [t, locale] = await Promise.all([getTranslations("SettingsUI"), getLocale()]);
	const tStr = (key: string, values?: Record<string, string | number>) => t(`strings.${key}` as never, values as never);
	const resolvedSearchParams = await searchParams;
	const parsedFilters = parseFilters(resolvedSearchParams);
	const data = await loadPresetFeedbackData(parsedFilters).catch((error) => {
		if (String(error?.message ?? "").toLowerCase().includes("unauthorized")) {
			redirect("/sign-in");
		}
		throw error;
	});
	if (!data.workspaceId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title={t("headers.presetFeedback")}
					titleKey="headers.presetFeedback"
					description={t("headers.presetFeedbackCompareDescription")}
					descriptionKey="headers.presetFeedbackCompareDescription"
					meta={<Badge variant="outline">{t("oauthAppsPage.alphaLabel")}</Badge>}
					actions={
						<ProductFeedbackButton
							surface="settings_preset_feedback"
							prompt={tStr("presetFeedbackPrompt")}
						/>
					}
				/>
				<div className="border-y border-border/70 py-8">
					<p className="text-sm text-muted-foreground">
						{tStr("presetFeedbackSelectWorkspace")}
					</p>
				</div>
			</div>
		);
	}

	const summariesByPreset = new Map(data.presets.map((preset) => [preset.id, createSummary(preset)]));
	for (const row of data.feedback) {
		if (!row.preset_id) continue;
		const summary = summariesByPreset.get(row.preset_id);
		if (summary) addFeedback(summary, row);
	}
	const allSummaries = Array.from(summariesByPreset.values());
	const baselineId =
		parsedFilters.baselineId && summariesByPreset.has(parsedFilters.baselineId)
			? parsedFilters.baselineId
			: null;
	const baseline = baselineId ? summariesByPreset.get(baselineId) ?? null : null;
	const summaries = sortSummaries(
		allSummaries,
		parsedFilters.sort,
		parsedFilters.direction,
		baseline ? positiveRate(baseline) : null,
	);
	const visiblePresetIds = new Set(summaries.map((summary) => summary.preset.id));
	const visibleFeedback = data.feedback.filter((row) =>
		row.preset_id ? visiblePresetIds.has(row.preset_id) : false,
	);
	const totalFeedback = visibleFeedback.length;
	const totalPositive = summaries.reduce((total, summary) => total + summary.positive, 0);
	const totalNegative = summaries.reduce((total, summary) => total + summary.negative, 0);
	const metadataKeys = Array.from(
		new Set(data.feedback.flatMap((row) => Object.keys(getDimensions(row.metadata_dimensions)))),
	).sort();
	const cohorts = buildCohorts(visibleFeedback, parsedFilters.metadataKey);

	return (
		<div className="min-w-0 max-w-full space-y-7 overflow-hidden lg:max-w-[calc(100vw-18rem)]">
			<SettingsPageHeader
				title={t("headers.presetFeedback")}
				titleKey="headers.presetFeedback"
				description={t("headers.presetFeedbackMeasureDescription")}
				descriptionKey="headers.presetFeedbackMeasureDescription"
				meta={<Badge variant="outline">{t("oauthAppsPage.alphaLabel")}</Badge>}
				className="sm:flex-col sm:items-stretch xl:flex-row xl:items-start"
				actions={
					<div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
						<Button asChild size="sm" variant="ghost" className="rounded-md">
							<a href={getLocalizedDocsHref(locale, "https://phaseo.app/docs/v1/guides/preset-feedback")} target="_blank" rel="noreferrer">
								<BookOpen className="h-4 w-4" />
								{t("oauthAppsPage.viewDocs")}
							</a>
						</Button>
						<Button asChild size="sm" variant="outline" className="rounded-md">
							<Link href="/settings/presets/new">
								<Plus className="h-4 w-4" />
								{t("headers.createNewPreset")}
							</Link>
						</Button>
						<ProductFeedbackButton
							surface="settings_preset_feedback"
							prompt={tStr("presetFeedbackPrompt")}
						/>
					</div>
				}
			/>

			{data.presets.length === 0 ? (
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GitCompareArrows className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>{t("credits.No presets yet" as never)}</EmptyTitle>
						<EmptyDescription>
							{tStr("presetFeedbackNoPresetsDescription")}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild>
							<Link href="/settings/presets/new">
								<Plus className="h-4 w-4" />
								{t("headers.createNewPreset")}
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<>
					<PresetFeedbackFilters
						filters={{
							range: parsedFilters.range,
							from: parsedFilters.from,
							to: parsedFilters.to,
							baselineId,
							metadataKey: parsedFilters.metadataKey,
							metadataValue: parsedFilters.metadataValue,
							presetQuery: parsedFilters.presetQuery,
							rating: parsedFilters.rating,
							sort: parsedFilters.sort,
							direction: parsedFilters.direction,
						}}
						presets={data.presets.map((preset) => ({
							...preset,
							displayName: presetDisplayName(preset),
						}))}
						baselineId={baselineId}
						metadataKeys={metadataKeys}
					/>

					<div className={cn("grid border-y border-border/70 md:divide-x md:divide-border/70", baseline ? "md:grid-cols-4" : "md:grid-cols-3")}>
						<MetricStat
							title={tStr("presetFeedbackLabel")}
							value={new Intl.NumberFormat(locale).format(totalFeedback)}
							detail={tStr("presetFeedbackDateRange", { from: formatDateInput(parsedFilters.from, locale), to: formatDateInput(parsedFilters.to, locale) })}
						/>
						<MetricStat
							title={tStr("presetFeedbackPositiveRate")}
							value={formatRate(totalPositive, totalFeedback, locale, tStr("presetFeedbackNotAvailable"))}
							detail={tStr("presetFeedbackPositiveDetail")}
						/>
						<MetricStat
							title={tStr("presetFeedbackNegativeRate")}
							value={formatRate(totalNegative, totalFeedback, locale, tStr("presetFeedbackNotAvailable"))}
							detail={tStr("presetFeedbackNegativeDetail")}
						/>
						{baseline ? (
							<MetricStat
								title={tStr("presetFeedbackBaseline")}
								value={presetDisplayName(baseline.preset)}
								detail={baseline.count > 0 ? `${formatRate(baseline.positive, baseline.count, locale, tStr("presetFeedbackNotAvailable"))} ${tStr("presetFeedbackPositive")}` : tStr("presetFeedbackNoFeedback")}
							/>
						) : null}
					</div>

					<section className="min-w-0 space-y-3">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
							<div className="space-y-1">
								<h2 className="flex items-center gap-2 text-base font-semibold">
									<BarChart3 className="h-4 w-4" />
									{tStr("presetFeedbackComparisonHeading")}
								</h2>
								<p className="max-w-3xl text-sm text-muted-foreground">
									{baseline
										? tStr("presetFeedbackCompareBaselineDescription")
										: tStr("presetFeedbackCompareNoBaselineDescription")}
								</p>
							</div>
						</div>
						<PresetComparisonExplorer initialQuery={parsedFilters.presetQuery}>
						<ScrollArea className="min-w-0 w-full border-y border-border/70" scrollBarOrientation="horizontal">
							<Table wrapInContainer={false} className="min-w-[980px]">
								<TableHeader className="bg-muted/30">
									<TableRow>
										<SortableComparisonHead translate={tStr}
											label={tStr("Preset")}
											sortKey="preset"
											filters={parsedFilters}
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("presetFeedbackLabel")}
											sortKey="feedback"
											filters={parsedFilters}
											className="text-right"
										/>
						{baseline ? <SortableComparisonHead translate={tStr} label={tStr("presetFeedbackVsBaseline")} sortKey="delta" filters={parsedFilters} className="text-right" /> : null}
										<SortableComparisonHead translate={tStr}
											label={tStr("presetFeedbackPositiveColumn")}
											sortKey="positive"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("presetFeedbackNegativeColumn")}
											sortKey="negative"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("presetFeedbackPartialColumn")}
											sortKey="partial"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("Requests")}
											sortKey="requests"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("Sessions")}
											sortKey="sessions"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead translate={tStr}
											label={tStr("presetFeedbackLastFeedback")}
											sortKey="last_feedback"
											filters={parsedFilters}
											className="text-right"
										/>
									</TableRow>
								</TableHeader>
								<TableBody>
									{summaries.length === 0 ? (
										<TableRow>
											<TableCell colSpan={baseline ? 9 : 8} className="h-24 text-center text-muted-foreground">
												{tStr("presetFeedbackNoPresetsMatch")}
											</TableCell>
										</TableRow>
									) : (
										summaries.map((summary) => (
										<TableRow key={summary.preset.id} data-preset-search={`${presetDisplayName(summary.preset)} ${summary.preset.name} ${summary.preset.slug ?? ""}`.toLowerCase()}>
												<TableCell>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
													<p className="font-medium">{presetDisplayName(summary.preset)}</p>
															{summary.preset.id === baselineId ? (
																<Badge variant="secondary">{tStr("presetFeedbackBaseline")}</Badge>
															) : null}
														</div>
														<p className="font-mono text-xs text-muted-foreground">
															@{summary.preset.slug ?? summary.preset.name.replace(/^@/, "")}
														</p>
													</div>
												</TableCell>
												<TableCell className="text-right">{new Intl.NumberFormat(locale).format(summary.count)}</TableCell>
											{baseline ? <TableCell className="text-right">
												{summary.preset.id === baselineId
													? tStr("presetFeedbackBaseline")
													: formatDelta(positiveRate(summary), baseline ? positiveRate(baseline) : null, locale, tStr("presetFeedbackNotAvailable"), tStr("presetFeedbackPercentagePoints"))}
											</TableCell> : null}
												<TableCell className="text-right">
													{formatRate(summary.positive, summary.count, locale, tStr("presetFeedbackNotAvailable"))}
												</TableCell>
												<TableCell className="text-right">
													{formatRate(summary.negative, summary.count, locale, tStr("presetFeedbackNotAvailable"))}
												</TableCell>
												<TableCell className="text-right">
													{formatRate(summary.partial, summary.count, locale, tStr("presetFeedbackNotAvailable"))}
												</TableCell>
												<TableCell className="text-right">{new Intl.NumberFormat(locale).format(summary.requestIds.size)}</TableCell>
												<TableCell className="text-right">{new Intl.NumberFormat(locale).format(summary.sessionIds.size)}</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{formatDate(summary.latestFeedbackAt, locale, tStr("presetFeedbackNever"))}
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</ScrollArea>
						</PresetComparisonExplorer>
					</section>

					{parsedFilters.metadataKey ? (
						<section className="min-w-0 space-y-3">
							<div className="space-y-1">
								<h2 className="flex items-center gap-2 text-base font-semibold">
									<SlidersHorizontal className="h-4 w-4" />
									{tStr("presetFeedbackCohortHeading")}
								</h2>
								<p className="text-sm text-muted-foreground">
									{tStr("presetFeedbackGroupedByDimension", { dimension: parsedFilters.metadataKey, valueSuffix: parsedFilters.metadataValue ? ` = ${parsedFilters.metadataValue}` : "" })}
								</p>
							</div>
							<ScrollArea className="min-w-0 w-full border-y border-border/70" scrollBarOrientation="horizontal">
								{cohorts.length === 0 ? (
									<div className="px-4 py-8 text-sm text-muted-foreground">
										{tStr("presetFeedbackNoMetadataMatches")}
									</div>
								) : (
									<Table wrapInContainer={false} className="min-w-[720px]">
										<TableHeader className="bg-muted/30">
											<TableRow>
												<TableHead>{tStr("presetFeedbackValue")}</TableHead>
												<TableHead className="text-right">{tStr("presetFeedbackLabel")}</TableHead>
												<TableHead className="text-right">{tStr("presetFeedbackPositiveColumn")}</TableHead>
												<TableHead className="text-right">{tStr("presetFeedbackPartialColumn")}</TableHead>
												<TableHead className="text-right">{tStr("presetFeedbackNegativeColumn")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{cohorts.map((cohort) => (
												<TableRow key={cohort.value}>
													<TableCell>{cohort.value}</TableCell>
													<TableCell className="text-right">{new Intl.NumberFormat(locale).format(cohort.count)}</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.positive, cohort.count, locale, tStr("presetFeedbackNotAvailable"))}
													</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.partial, cohort.count, locale, tStr("presetFeedbackNotAvailable"))}
													</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.negative, cohort.count, locale, tStr("presetFeedbackNotAvailable"))}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</ScrollArea>
						</section>
					) : null}

					<section className="min-w-0 space-y-3">
						<div className="space-y-1">
							<h2 className="flex items-center gap-2 text-base font-semibold">
								<MessageSquareText className="h-4 w-4" />
								{tStr("presetFeedbackEventsHeading")}
							</h2>
							<p className="text-sm text-muted-foreground">
								{tStr("presetFeedbackEventsDescription", { shown: new Intl.NumberFormat(locale).format(Math.min(visibleFeedback.length, 50)), total: new Intl.NumberFormat(locale).format(totalFeedback) })}{data.feedbackTruncated ? " " + tStr("presetFeedbackTruncatedNotice") : ""}
							</p>
						</div>
						<ScrollArea className="min-w-0 w-full border-y border-border/70" scrollBarOrientation="horizontal">
							{visibleFeedback.length === 0 ? (
								<Empty size="compact" className="py-10">
									<EmptyHeader>
										<EmptyTitle>{tStr("presetFeedbackEmptyHeading")}</EmptyTitle>
										<EmptyDescription>
											{tStr("presetFeedbackEmptyDescription")}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<Table wrapInContainer={false} className="min-w-[980px]">
									<TableHeader className="bg-muted/30">
										<TableRow>
											<TableHead>{tStr("presetFeedbackLabel")}</TableHead>
											<TableHead>{tStr("Preset")}</TableHead>
											<TableHead>{tStr("Metadata")}</TableHead>
											<TableHead>{tStr("presetFeedbackRequestSession")}</TableHead>
											<TableHead className="text-right">{tStr("Created")}</TableHead>
											<TableHead className="w-[92px] text-right">{tStr("presetFeedbackDetail")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visibleFeedback.slice(0, 50).map((row) => {
											const preset = row.preset_id
												? summariesByPreset.get(row.preset_id)?.preset
												: null;
											const detail = toFeedbackDetail(row, preset, locale, tStr);
											return (
												<TableRow key={row.id}>
													<TableCell>
														<div className="space-y-1">
															<div className="flex flex-wrap items-center gap-2">
																<Badge variant="outline">{translateRating(row.rating, tStr)}</Badge>
															</div>
															<p className="line-clamp-2 text-xs text-muted-foreground">
																{row.comment ?? row.reason ?? tStr("presetFeedbackNoComment")}
															</p>
														</div>
													</TableCell>
												<TableCell>
													{preset ? (
														<div className="min-w-0">
															<p className="truncate font-medium">{presetDisplayName(preset)}</p>
															{preset.slug ? <p className="truncate font-mono text-xs text-muted-foreground">@{preset.slug.replace(/^@/, "")}</p> : null}
														</div>
													) : tStr("presetFeedbackUnknownPreset")}
												</TableCell>
													<TableCell className="max-w-xs truncate text-xs text-muted-foreground">
														{compactDimensions(row.metadata_dimensions, tStr("strings.No metadata"))}
													</TableCell>
													<TableCell className="max-w-[220px]">
														{row.request_id ? (
															<span className="break-all font-mono text-xs">{row.request_id}</span>
														) : row.session_id ? (
															<span className="break-all font-mono text-xs">{row.session_id}</span>
														) : (
															<span className="text-muted-foreground">{tStr("presetFeedbackPresetLevel")}</span>
														)}
													</TableCell>
													<TableCell className="text-right text-muted-foreground">
														{formatDate(row.created_at, locale, t("strings.presetFeedbackNever" as never))}
													</TableCell>
													<TableCell className="text-right">
														<PresetFeedbackDetailDialog feedback={detail} />
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							)}
						</ScrollArea>
					</section>
				</>
			)}
		</div>
	);
}

function SortableComparisonHead({
	label,
	sortKey,
	filters,
	className,
	translate,
}: {
	label: string;
	sortKey: SortKey;
	filters: Filters;
	className?: string;
	translate: (key: string, values?: Record<string, string | number>) => string;
}) {
	const active = filters.sort === sortKey;
	const nextDirection: SortDirection =
		active && filters.direction === "desc" ? "asc" : "desc";
	const Icon = !active
		? ChevronsUpDown
		: filters.direction === "desc"
			? ChevronDown
			: ChevronUp;
	return (
		<TableHead
			className={cn("group", className)}
			aria-sort={active ? (filters.direction === "asc" ? "ascending" : "descending") : "none"}
		>
			<Link
				href={buildFeedbackHref(filters, {
					sort: sortKey,
					direction: nextDirection,
				})}
				aria-label={translate("presetFeedbackSortAria", { label, direction: translate(nextDirection === "asc" ? "presetFeedbackAscending" : "presetFeedbackDescending") })}
				className={cn(
					"inline-flex w-full items-center gap-1 text-left",
					className?.includes("text-right") ? "justify-end" : "justify-start",
				)}
			>
				<span>{label}</span>
				<Icon
					aria-hidden="true"
					className={cn(
						"h-3.5 w-3.5 transition-opacity",
						active
							? "opacity-100"
							: "opacity-0 group-hover:opacity-60 group-focus-within:opacity-60",
					)}
				/>
			</Link>
		</TableHead>
	);
}

function MetricStat({
	title,
	value,
	detail,
}: {
	title: string;
	value: string;
	detail: string;
}) {
	return (
		<div className="min-w-0 border-b border-border/70 px-4 py-3 last:border-b-0 md:border-b-0">
			<p className="text-sm font-medium text-muted-foreground">{title}</p>
			<p className="mt-2 truncate text-2xl font-semibold">{value}</p>
			<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}

function translateRating(rating: string | null, t: (key: string) => string): string {
	const labels: Record<string, string> = {
		thumbs_up: "Thumbs up", thumbs_down: "Thumbs down", correct: "Correct",
		partly_correct: "Partly correct", incorrect: "Incorrect", unsafe: "Unsafe", unrated: "Unrated",
	};
	return rating ? (labels[rating] ? t(labels[rating]) : rating) : t("Unrated");
}

function toFeedbackDetail(
	row: FeedbackRow,
	preset: PresetRow | null | undefined,
	locale: string,
	t: (key: string) => string,
): PresetFeedbackDetail {
	const score = toFiniteScore(row.score);
	return {
		id: row.id,
		presetName: preset?.name ?? t("presetFeedbackUnknownPreset"),
		presetSlug: preset?.slug ?? null,
		rating: translateRating(row.rating, t),
		scoreLabel: formatScore(score, locale, t("presetFeedbackNotAvailable")),
		scoreRaw: score,
		comment: row.comment,
		reason: row.reason,
		reasonTags: Array.isArray(row.reason_tags)
			? row.reason_tags.filter((tag): tag is string => typeof tag === "string")
			: [],
		requestId: row.request_id,
		sessionId: row.session_id,
		endUserId: row.end_user_id,
		createdAtLabel: formatDate(row.created_at, locale, t("presetFeedbackNever")),
		createdAt: row.created_at,
		metadataDimensions: getDimensions(row.metadata_dimensions),
	};
}
