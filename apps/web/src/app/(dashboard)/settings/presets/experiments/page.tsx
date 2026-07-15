import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
	BarChart3,
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
import {
	PresetFeedbackDetailDialog,
	type PresetFeedbackDetail,
} from "@/components/(gateway)/settings/presets/experiments/PresetFeedbackDetailDialog";
import { PresetFeedbackFilters } from "@/components/(gateway)/settings/presets/experiments/PresetFeedbackFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { presetExperimentsEnabled } from "@/lib/flags";
import { cn } from "@/lib/utils";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export const metadata: Metadata = {
	title: "Preset Feedback - Settings",
};

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
	const from = range === "custom" ? (getParam(params, "from") ?? defaultFrom) : defaultFrom;
	const to = range === "custom" ? (getParam(params, "to") ?? today) : today;
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

function formatDate(value: string | null | undefined): string {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatScore(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "n/a";
	return `${Math.round(value * 100)}%`;
}

function formatRate(numerator: number, denominator: number): string {
	if (denominator === 0) return "n/a";
	return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatDelta(value: number | null, baseline: number | null): string {
	if (value === null || baseline === null) return "n/a";
	const delta = Math.round((value - baseline) * 100);
	return `${delta > 0 ? "+" : ""}${delta} pp`;
}

function compactDimensions(value: unknown): string {
	const dimensions = getDimensions(value);
	const entries = Object.entries(dimensions).slice(0, 3);
	if (entries.length === 0) return "No metadata";
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
	overrides: Partial<Pick<Filters, "sort" | "direction">>,
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
	if (presetIds.length > 0) {
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
			.limit(10000);
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
		feedback = (data ?? []) as FeedbackRow[];
	}

	return { workspaceId, presets, feedback };
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
	if (!(await presetExperimentsEnabled())) notFound();
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
					title="Preset feedback"
					description="Compare preset quality from developer feedback APIs, date windows, and metadata cohorts."
					meta={<Badge variant="outline">Observability</Badge>}
				/>
				<div className="border-y border-border/70 py-8">
					<p className="text-sm text-muted-foreground">
						Select a workspace to view preset feedback.
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
			: allSummaries[0]?.preset.id ?? null;
	const baseline = baselineId ? summariesByPreset.get(baselineId) ?? null : null;
	const presetQuery = parsedFilters.presetQuery.toLowerCase();
	const filteredSummaries = presetQuery
		? allSummaries.filter((summary) => {
				const slug = summary.preset.slug ?? "";
				return (
					summary.preset.name.toLowerCase().includes(presetQuery) ||
					slug.toLowerCase().includes(presetQuery)
				);
			})
		: allSummaries;
	const summaries = sortSummaries(
		filteredSummaries,
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
		<div className="min-w-0 max-w-full space-y-8 overflow-hidden lg:max-w-[calc(100vw-18rem)]">
			<SettingsPageHeader
				title="Preset feedback"
				description="Compare response quality from feedback API events across presets, cohorts, and date windows."
				meta={<Badge variant="outline">Observability</Badge>}
				actions={
					<Button asChild size="sm" variant="outline">
						<Link href="/settings/presets/new">
							<Plus className="h-4 w-4" />
							Create preset
						</Link>
					</Button>
				}
			/>

			{data.presets.length === 0 ? (
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GitCompareArrows className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>No presets yet</EmptyTitle>
						<EmptyDescription>
							Create presets first, then log feedback with preset IDs to compare quality over time.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild>
							<Link href="/settings/presets/new">
								<Plus className="h-4 w-4" />
								Create preset
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
						presets={data.presets}
						baselineId={baselineId}
						metadataKeys={metadataKeys}
					/>

					<div className="grid overflow-hidden rounded-lg border border-border/70 bg-background md:grid-cols-4 md:divide-x md:divide-border/70">
						<MetricStat
							title="Feedback"
							value={String(totalFeedback)}
							detail={`${parsedFilters.from} to ${parsedFilters.to}`}
						/>
						<MetricStat
							title="Positive rate"
							value={formatRate(totalPositive, totalFeedback)}
							detail="Thumbs up or correct"
						/>
						<MetricStat
							title="Negative rate"
							value={formatRate(totalNegative, totalFeedback)}
							detail="Thumbs down, incorrect, unsafe"
						/>
						<MetricStat
							title="Baseline"
							value={baseline?.preset.name ?? "None"}
							detail={
								baseline && baseline.count > 0
									? `${formatRate(baseline.positive, baseline.count)} positive`
									: "No feedback"
							}
						/>
					</div>

					<section className="min-w-0 space-y-3">
						<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
							<div className="space-y-1">
								<h2 className="flex items-center gap-2 text-base font-semibold">
									<BarChart3 className="h-4 w-4" />
									Preset comparison
								</h2>
								<p className="max-w-3xl text-sm text-muted-foreground">
									Sort presets by explicit ratings. Positive means thumbs up or correct; negative means thumbs down, incorrect, or unsafe; baseline delta compares positive-rate percentage points.
								</p>
							</div>
						</div>
						<div className="min-w-0 overflow-x-auto rounded-lg border border-border/70">
							<Table wrapInContainer={false} className="min-w-[980px]">
								<TableHeader className="bg-muted/30">
									<TableRow>
										<SortableComparisonHead
											label="Preset"
											sortKey="preset"
											filters={parsedFilters}
										/>
										<SortableComparisonHead
											label="Feedback"
											sortKey="feedback"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Vs baseline"
											sortKey="delta"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Positive"
											sortKey="positive"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Negative"
											sortKey="negative"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Partial"
											sortKey="partial"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Requests"
											sortKey="requests"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Sessions"
											sortKey="sessions"
											filters={parsedFilters}
											className="text-right"
										/>
										<SortableComparisonHead
											label="Last feedback"
											sortKey="last_feedback"
											filters={parsedFilters}
											className="text-right"
										/>
									</TableRow>
								</TableHeader>
								<TableBody>
									{summaries.length === 0 ? (
										<TableRow>
											<TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
												No presets match the active filters.
											</TableCell>
										</TableRow>
									) : (
										summaries.map((summary) => (
											<TableRow key={summary.preset.id}>
												<TableCell>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium">{summary.preset.name}</p>
															{summary.preset.id === baselineId ? (
																<Badge variant="secondary">Baseline</Badge>
															) : null}
														</div>
														<p className="font-mono text-xs text-muted-foreground">
															@{summary.preset.slug ?? summary.preset.name.replace(/^@/, "")}
														</p>
													</div>
												</TableCell>
												<TableCell className="text-right">{summary.count}</TableCell>
												<TableCell className="text-right">
													{summary.preset.id === baselineId
														? "Baseline"
														: formatDelta(positiveRate(summary), baseline ? positiveRate(baseline) : null)}
												</TableCell>
												<TableCell className="text-right">
													{formatRate(summary.positive, summary.count)}
												</TableCell>
												<TableCell className="text-right">
													{formatRate(summary.negative, summary.count)}
												</TableCell>
												<TableCell className="text-right">
													{formatRate(summary.partial, summary.count)}
												</TableCell>
												<TableCell className="text-right">{summary.requestIds.size}</TableCell>
												<TableCell className="text-right">{summary.sessionIds.size}</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{formatDate(summary.latestFeedbackAt)}
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</section>

					{parsedFilters.metadataKey ? (
						<section className="min-w-0 space-y-3">
							<div className="space-y-1">
								<h2 className="flex items-center gap-2 text-base font-semibold">
									<SlidersHorizontal className="h-4 w-4" />
									Cohort breakdown
								</h2>
								<p className="text-sm text-muted-foreground">
									Grouped by <span className="font-mono">{parsedFilters.metadataKey}</span>
									{parsedFilters.metadataValue ? ` = ${parsedFilters.metadataValue}` : ""}.
								</p>
							</div>
							<div className="min-w-0 overflow-x-auto rounded-lg border border-border/70">
								{cohorts.length === 0 ? (
									<div className="px-4 py-8 text-sm text-muted-foreground">
										No feedback in this window includes that metadata dimension.
									</div>
								) : (
									<Table wrapInContainer={false} className="min-w-[720px]">
										<TableHeader className="bg-muted/30">
											<TableRow>
												<TableHead>Value</TableHead>
												<TableHead className="text-right">Feedback</TableHead>
												<TableHead className="text-right">Positive</TableHead>
												<TableHead className="text-right">Partial</TableHead>
												<TableHead className="text-right">Negative</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{cohorts.map((cohort) => (
												<TableRow key={cohort.value}>
													<TableCell>{cohort.value}</TableCell>
													<TableCell className="text-right">{cohort.count}</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.positive, cohort.count)}
													</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.partial, cohort.count)}
													</TableCell>
													<TableCell className="text-right">
														{formatRate(cohort.negative, cohort.count)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</div>
						</section>
					) : null}

					<section className="min-w-0 space-y-3">
						<div className="space-y-1">
							<h2 className="flex items-center gap-2 text-base font-semibold">
								<MessageSquareText className="h-4 w-4" />
								Feedback events
							</h2>
							<p className="text-sm text-muted-foreground">
								Recent rows from the feedback API. Open a row to inspect request, session, cohort metadata, comments, and tags.
							</p>
						</div>
						<div className="min-w-0 overflow-x-auto rounded-lg border border-border/70">
							{visibleFeedback.length === 0 ? (
								<Empty size="compact" className="py-10">
									<EmptyHeader>
										<EmptyTitle>No feedback in this window</EmptyTitle>
										<EmptyDescription>
											Log feedback with a preset ID, then use date and metadata filters to compare results.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<Table wrapInContainer={false} className="min-w-[980px]">
									<TableHeader className="bg-muted/30">
										<TableRow>
											<TableHead>Feedback</TableHead>
											<TableHead>Preset</TableHead>
											<TableHead>Metadata</TableHead>
											<TableHead>Request/session</TableHead>
											<TableHead className="text-right">Created</TableHead>
											<TableHead className="w-[92px] text-right">Detail</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visibleFeedback.slice(0, 50).map((row) => {
											const preset = row.preset_id
												? summariesByPreset.get(row.preset_id)?.preset
												: null;
											const detail = toFeedbackDetail(row, preset);
											return (
												<TableRow key={row.id}>
													<TableCell>
														<div className="space-y-1">
															<div className="flex flex-wrap items-center gap-2">
																<Badge variant="outline">{row.rating ?? "unrated"}</Badge>
															</div>
															<p className="line-clamp-2 text-xs text-muted-foreground">
																{row.comment ?? row.reason ?? "No comment"}
															</p>
														</div>
													</TableCell>
													<TableCell>{preset?.name ?? "Unknown preset"}</TableCell>
													<TableCell className="max-w-xs truncate text-xs text-muted-foreground">
														{compactDimensions(row.metadata_dimensions)}
													</TableCell>
													<TableCell className="max-w-[220px]">
														{row.request_id ? (
															<span className="break-all font-mono text-xs">{row.request_id}</span>
														) : row.session_id ? (
															<span className="break-all font-mono text-xs">{row.session_id}</span>
														) : (
															<span className="text-muted-foreground">Preset-level</span>
														)}
													</TableCell>
													<TableCell className="text-right text-muted-foreground">
														{formatDate(row.created_at)}
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
						</div>
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
}: {
	label: string;
	sortKey: SortKey;
	filters: Filters;
	className?: string;
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
		<TableHead className={cn("group", className)}>
			<Link
				href={buildFeedbackHref(filters, {
					sort: sortKey,
					direction: nextDirection,
				})}
				className={cn(
					"inline-flex w-full items-center gap-1 text-left",
					className?.includes("text-right") ? "justify-end" : "justify-start",
				)}
			>
				<span>{label}</span>
				<Icon
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
		<div className="min-w-0 border-b border-border/70 p-4 last:border-b-0 md:border-b-0">
			<p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
			<p className="mt-2 truncate text-2xl font-semibold">{value}</p>
			<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}

function toFeedbackDetail(
	row: FeedbackRow,
	preset: PresetRow | null | undefined,
): PresetFeedbackDetail {
	const score = toFiniteScore(row.score);
	return {
		id: row.id,
		presetName: preset?.name ?? "Unknown preset",
		presetSlug: preset?.slug ?? null,
		rating: row.rating ?? "unrated",
		scoreLabel: formatScore(score),
		scoreRaw: score,
		comment: row.comment,
		reason: row.reason,
		reasonTags: Array.isArray(row.reason_tags)
			? row.reason_tags.filter((tag): tag is string => typeof tag === "string")
			: [],
		requestId: row.request_id,
		sessionId: row.session_id,
		endUserId: row.end_user_id,
		createdAtLabel: formatDate(row.created_at),
		createdAt: row.created_at,
		metadataDimensions: getDimensions(row.metadata_dimensions),
	};
}
