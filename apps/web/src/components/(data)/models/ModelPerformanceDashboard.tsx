"use client";

import { useRef, useState } from "react";
import ModelPerformanceCards, { selectProviderTrendData } from "@/components/(data)/models/ModelPerformanceCards";
import { Activity, CalendarDays, CircleAlert, Globe2, Loader2 } from "lucide-react";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ModelPerformanceColo } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	CLOUDFLARE_COLOS,
	CLOUDFLARE_CONTINENTS,
	formatCloudflareColo,
} from "@/lib/cloudflare/colos";
import ModelPercentileSelect, {
	DEFAULT_MODEL_PERCENTILE,
	isModelPercentile,
	type ModelPercentile,
} from "./ModelPercentileSelect";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	MODEL_PERFORMANCE_REFRESH_INTERVAL_MS,
	useModelPerformanceMetrics,
} from "./useModelPerformanceMetrics";
import {
	getLatestPerformanceSampleAt,
	hasPerformanceHistory,
	isPerformanceDataStale,
} from "./modelPerformanceFreshness";
import { buildSingleProviderPercentileSeries } from "@/components/(data)/models/modelPerformancePercentiles";

import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

interface ModelPerformanceDashboardProps {
	modelId: string;
	metrics: ModelPerformanceMetrics;
	availableColos: ModelPerformanceColo[];
	headerDescription: string;
}

type PerformanceRangeDays = 1 | 3 | 7;

const PERFORMANCE_RANGES: Array<{ days: PerformanceRangeDays; label: string }> = [
	{ days: 1, label: "1 day" },
	{ days: 3, label: "3 days" },
	{ days: 7, label: "7 days" },
];

const pointTimestamp = (point: { bucket?: string; day?: string }) =>
	Date.parse(point.bucket ?? point.day ?? "");

export function filterPerformanceRange<T extends { bucket?: string; day?: string }>(
	points: T[],
	days: PerformanceRangeDays,
	latestTimestamp: number,
): T[] {
	if (!Number.isFinite(latestTimestamp)) return points;
	const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
	return points.filter((point) => {
		const timestamp = pointTimestamp(point);
		return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= latestTimestamp;
	});
}

function formatSampleTime(value: string | null): string {
	if (!value) return "Unknown";
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
		timeZoneName: "short",
	}).format(new Date(value));
}

export default function ModelPerformanceDashboard({
	modelId,
	metrics,
	availableColos,
	headerDescription,
}: ModelPerformanceDashboardProps) {
	const [initialSelection] = useState<{
		colo: string | null;
		percentile: ModelPercentile;
	}>(() => ({
			colo: metrics.cloudflareColo ?? null,
			percentile:
				metrics.percentile != null && isModelPercentile(metrics.percentile)
					? metrics.percentile
					: DEFAULT_MODEL_PERCENTILE,
		}));
	const [selectedColo, setSelectedColo] = useState<string | null>(
		() => initialSelection.colo,
	);
	const [selectedPercentile, setSelectedPercentile] = useState<ModelPercentile>(
		() => initialSelection.percentile,
	);
	const [selectedRangeDays, setSelectedRangeDays] = useState<PerformanceRangeDays>(3);
	const successfulSelectionRef = useRef(initialSelection);
	const isInitialSelection =
		selectedColo === initialSelection.colo &&
		selectedPercentile === initialSelection.percentile;
	const {
		data: selectedMetrics,
		isValidating,
	} = useModelPerformanceMetrics({
		modelId,
		cloudflareColo: selectedColo,
		percentile: selectedPercentile,
		rangeDays: selectedRangeDays,
		fallbackData: isInitialSelection ? metrics : undefined,
		refreshInterval: MODEL_PERFORMANCE_REFRESH_INTERVAL_MS,
		onError: () => {
				setSelectedColo(successfulSelectionRef.current.colo);
				setSelectedPercentile(successfulSelectionRef.current.percentile);
		},
		onSuccess: (nextMetrics) => {
				if (!nextMetrics) return;
				successfulSelectionRef.current = {
					colo: nextMetrics.cloudflareColo ?? null,
					percentile:
						nextMetrics.percentile != null &&
						isModelPercentile(nextMetrics.percentile)
							? nextMetrics.percentile
							: selectedPercentile,
				};
		},
	});
	const activeMetrics = selectedMetrics ?? metrics;
	const isLoadingRegion =
		isValidating && selectedColo !== (activeMetrics.cloudflareColo ?? null);
	const isLoadingPercentile =
		isValidating && selectedPercentile !== activeMetrics.percentile;

	const handleColoChange = (value: string) => {
		const nextColo = value === "all" ? null : value;
		setSelectedColo(nextColo);
	};

	const handlePercentileChange = (nextPercentile: ModelPercentile) => {
		if (nextPercentile === selectedPercentile) return;
		setSelectedPercentile(nextPercentile);
	};

	const hasTelemetry = hasPerformanceHistory(activeMetrics);
	const isStale = hasTelemetry && isPerformanceDataStale(activeMetrics);
	const latestSampleAt = getLatestPerformanceSampleAt(activeMetrics);
	const regionLabel = selectedColo?.toUpperCase() ?? "All Locations";
	const usageByColo = new Map(
		availableColos
			.filter((colo) => colo.requests > 0)
			.map((colo) => [colo.colo, colo.requests]),
	);
	const catalogColosByContinent = CLOUDFLARE_CONTINENTS.map((continent) => ({
		continent,
		colos: CLOUDFLARE_COLOS.filter(
			(colo) => colo.continent === continent && usageByColo.has(colo.code),
		),
	})).filter((group) => group.colos.length > 0);
	const allRangePoints = [
		...(activeMetrics.providerHourly7d ?? []),
		...activeMetrics.providerDaily7d,
		...(activeMetrics.providerPercentileDaily7d ?? []),
		...(activeMetrics.qualitySeries ?? []),
	];
	const latestRangeTimestamp = Math.max(
		...allRangePoints.map(pointTimestamp).filter(Number.isFinite),
	);
	const rangeProviderHourly = filterPerformanceRange(
		activeMetrics.providerHourly7d ?? [],
		selectedRangeDays,
		latestRangeTimestamp,
	);
	const rangeProviderDaily = filterPerformanceRange(
		activeMetrics.providerDaily7d,
		selectedRangeDays,
		latestRangeTimestamp,
	);
	const rangeProviderPercentiles = filterPerformanceRange(
		activeMetrics.providerPercentileDaily7d ?? [],
		selectedRangeDays,
		latestRangeTimestamp,
	);
	const rangeQualitySeries = filterPerformanceRange(
		activeMetrics.qualitySeries ?? [],
		selectedRangeDays,
		latestRangeTimestamp,
	);
	const chartProviderHourly = selectedRangeDays <= 3 ? rangeProviderHourly : [];
	const { data: trendProviderPoints } = selectProviderTrendData(
		chartProviderHourly,
		rangeProviderDaily,
	);
	const providerCount = new Set(
		trendProviderPoints
			.filter((point) => point.requests > 0)
			.map((point) => point.provider),
	).size;
	const showPercentileSelector = providerCount > 1;
	const singleProviderPercentileSeries = buildSingleProviderPercentileSeries(
		providerCount,
		rangeProviderPercentiles,
	);

	return (
		<section className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-xl font-semibold tracking-tight">Performance</h2>
						{isStale ? (
							<HoverCard openDelay={150} closeDelay={100}>
								<HoverCardTrigger asChild>
									<button type="button" aria-label="About stale performance data">
										<Badge
											variant="outline"
											className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
										>
											<CircleAlert aria-hidden="true" data-icon="inline-start" />
											Stale data
										</Badge>
									</button>
								</HoverCardTrigger>
								<HoverCardContent align="start" className="w-72 rounded-lg p-3">
									<p className="font-medium text-foreground">Performance data is over 24 hours old</p>
									<p className="mt-1 text-xs text-muted-foreground">
										Latest observation: {formatSampleTime(latestSampleAt)}. The charts remain visible for historical context.
									</p>
								</HoverCardContent>
							</HoverCard>
						) : null}
					</div>
					<p className="text-sm text-muted-foreground">{headerDescription}</p>
				</div>
				<div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 min-w-0 flex-1 justify-center gap-2 rounded-lg px-3 text-xs sm:flex-none"
								aria-label="Select performance time range"
							>
								<CalendarDays className="size-3.5" />
								{selectedRangeDays}D
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-32 rounded-lg">
							<DropdownMenuRadioGroup
								value={String(selectedRangeDays)}
								onValueChange={(value) =>
									setSelectedRangeDays(Number(value) as PerformanceRangeDays)
								}
							>
								{PERFORMANCE_RANGES.map((range) => (
									<DropdownMenuRadioItem key={range.days} value={String(range.days)}>
										{range.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					{showPercentileSelector ? (
						<ModelPercentileSelect
							value={selectedPercentile}
							onChange={handlePercentileChange}
							isLoading={isLoadingPercentile}
							ariaLabel="Select performance percentile"
							className="min-w-0 flex-1 justify-center sm:flex-none"
						/>
					) : null}
					<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="outline"
												size="sm"
										className="h-8 min-w-0 flex-1 justify-center gap-2 rounded-lg px-3 text-xs sm:w-auto sm:flex-none"
												aria-busy={isLoadingRegion}
												aria-label="Filter performance by API location"
											>
												{isLoadingRegion ? (
													<Loader2 className="size-3.5 animate-spin" />
												) : (
													<Globe2 className="size-3.5" />
												)}
											<span className="truncate">{regionLabel}</span>
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="end"
											className="min-w-56 rounded-lg"
										>
											<div className="px-2 py-1.5 text-xs text-muted-foreground">
												API Execution Location
											</div>
											<DropdownMenuSeparator />
											<DropdownMenuRadioGroup
												value={selectedColo ?? "all"}
												onValueChange={handleColoChange}
											>
												<DropdownMenuRadioItem value="all">
													All Locations
												</DropdownMenuRadioItem>
											</DropdownMenuRadioGroup>
											<DropdownMenuSeparator />
											{catalogColosByContinent.length === 0 ? (
												<DropdownMenuItem disabled>
													No location data available
												</DropdownMenuItem>
											) : (
												catalogColosByContinent.map((group) => (
													<DropdownMenuSub key={group.continent}>
												<DropdownMenuSubTrigger>
													<Globe2 className="size-3.5 text-muted-foreground" />
													{group.continent}
												</DropdownMenuSubTrigger>
														<DropdownMenuSubContent className="max-h-80 min-w-80 rounded-lg">
															<DropdownMenuRadioGroup
																value={selectedColo ?? ""}
																onValueChange={handleColoChange}
															>
																<DropdownMenuGroup>
															{group.colos.map((colo) => (
																	<DropdownMenuRadioItem
																		key={colo.code}
																				value={colo.code}
																				className="gap-3"
																			>
																		<span className="min-w-0 flex-1 truncate">
																			{formatCloudflareColo(colo.code)}
																		</span>
																	</DropdownMenuRadioItem>
															))}
																</DropdownMenuGroup>
															</DropdownMenuRadioGroup>
														</DropdownMenuSubContent>
													</DropdownMenuSub>
												))
											)}
										</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			{hasTelemetry ? (
				<ModelPerformanceCards
					summary={activeMetrics.summary}
					prevSummary={activeMetrics.prevSummary}
					hourly={activeMetrics.hourly}
					providerDaily7d={rangeProviderDaily}
					providerHourly7d={chartProviderHourly}
					chartProviderDaily7d={singleProviderPercentileSeries ?? undefined}
					qualitySeries={rangeQualitySeries}
				/>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No gateway telemetry in the past 7 days</EmptyTitle>
						<EmptyDescription>
							Hourly charts will appear when this model processes gateway traffic
							in the selected location.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
