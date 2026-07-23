"use client";

import { useState } from "react";
import ModelPerformanceCards from "./ModelPerformanceCards";
import ModelSuccessChart from "./ModelSuccessChart";
import ModelTokenTrajectoryChart from "./ModelTokenTrajectory";
import { Activity, Globe2, Loader2 } from "lucide-react";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ModelTokenTrajectory } from "@/lib/fetchers/models/getModelTokenTrajectory";
import type { ModelPerformanceColo } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
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
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
	tokenTrajectory: ModelTokenTrajectory | null;
	availableColos: ModelPerformanceColo[];
	headerDescription: string;
	mode?: "overview" | "page";
}

function formatReleaseDate(date: string | null | undefined): string | null {
	if (!date) return null;
	const parsed = new Date(date);
	if (!Number.isFinite(parsed.getTime())) return null;
	return parsed.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function ModelPerformanceDashboard({
	modelId,
	metrics,
	tokenTrajectory,
	availableColos,
	headerDescription,
	mode = "overview",
}: ModelPerformanceDashboardProps) {
	const [selectedColo, setSelectedColo] = useState<string | null>(
		metrics.cloudflareColo ?? null,
	);
	const [selectedPercentile, setSelectedPercentile] = useState<ModelPercentile>(
		metrics.percentile != null && isModelPercentile(metrics.percentile)
			? metrics.percentile
			: DEFAULT_MODEL_PERCENTILE,
	);
	const [regionMetrics, setRegionMetrics] = useState<ModelPerformanceMetrics | null>(null);
	const [isLoadingRegion, setIsLoadingRegion] = useState(false);
	const [isLoadingPercentile, setIsLoadingPercentile] = useState(false);
	const activeMetrics = regionMetrics ?? metrics;

	const fetchSelectedMetrics = async (colo: string | null, percentile: number) => {
		const query = new URLSearchParams({ percentile: String(percentile) });
		if (colo) query.set("colo", colo);
		const payload = await fetchOptionalPublicWebApi<{
			metrics: ModelPerformanceMetrics | null;
		}>(
			`/api/_web/models/${encodeURIComponent(modelId)}/performance?${query.toString()}`,
		);
		return payload?.metrics ?? null;
	};

	const handleColoChange = async (value: string) => {
		const nextColo = value === "all" ? null : value;
		setSelectedColo(nextColo);
		setIsLoadingRegion(true);
		try {
			setRegionMetrics(await fetchSelectedMetrics(nextColo, selectedPercentile));
		} finally {
			setIsLoadingRegion(false);
		}
	};

	const handlePercentileChange = async (nextPercentile: ModelPercentile) => {
		if (nextPercentile === selectedPercentile || isLoadingPercentile) return;
		const previousPercentile = selectedPercentile;
		setIsLoadingPercentile(true);
		try {
			const nextMetrics = await fetchSelectedMetrics(selectedColo, nextPercentile);
			if (!nextMetrics) return;
			setRegionMetrics(nextMetrics);
			setSelectedPercentile(nextPercentile);
		} catch {
			setSelectedPercentile(previousPercentile);
		} finally {
			setIsLoadingPercentile(false);
		}
	};

	const hasTelemetry =
		activeMetrics.summary.totalRequests > 0 ||
		activeMetrics.hourly.some((point) => point.requests > 0);
	const showDetailedPanels = mode === "page";
	const cumulativeTokens =
		activeMetrics.cumulativeTokens != null
			? Math.round(activeMetrics.cumulativeTokens).toLocaleString()
			: "N/A";
	const cumulativeSince = formatReleaseDate(activeMetrics.releaseDate);
	const regionLabel = selectedColo ? formatCloudflareColo(selectedColo) : "Select Location";
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
	const providerCount = new Set(
		activeMetrics.providerDaily7d
			.filter((point) => point.requests > 0)
			.map((point) => point.provider),
	).size;
	const showPercentileSelector = providerCount > 1;

	return (
		<section className="space-y-10">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">Performance</h2>
					<p className="text-sm text-muted-foreground">{headerDescription}</p>
				</div>
				<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex" tabIndex={0}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="h-8 gap-2 rounded-md px-3 text-xs" title="Coming Soon" disabled>
							{isLoadingRegion ? <Loader2 className="size-3.5 animate-spin" /> : <Globe2 className="size-3.5" />}
							{regionLabel}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-56 rounded-md">
						<div className="px-2 py-1.5 text-xs text-muted-foreground">API Execution Location</div>
						<DropdownMenuSeparator />
						{catalogColosByContinent.length === 0 ? (
							<DropdownMenuItem disabled>No location data available</DropdownMenuItem>
						) : catalogColosByContinent.map((group) => (
							<DropdownMenuSub key={group.continent}>
								<DropdownMenuSubTrigger>
									<Globe2 className="size-3.5 text-muted-foreground" />
									{group.continent}
									<span className="ml-auto w-6 text-right text-[11px] tabular-nums text-muted-foreground">
										{group.colos.length}
									</span>
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-80 min-w-80 rounded-md">
									<DropdownMenuRadioGroup value={selectedColo ?? ""} onValueChange={handleColoChange}>
										<DropdownMenuGroup>
											{group.colos.map((colo) => {
												const requests = usageByColo.get(colo.code) ?? 0;
												return (
													<DropdownMenuRadioItem key={colo.code} value={colo.code} className="gap-3">
														<span className="min-w-0 flex-1 truncate">{formatCloudflareColo(colo.code)}</span>
														<span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
															{requests.toLocaleString()}
														</span>
													</DropdownMenuRadioItem>
												);
											})}
										</DropdownMenuGroup>
									</DropdownMenuRadioGroup>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
						</span>
					</TooltipTrigger>
					<TooltipContent>Coming Soon</TooltipContent>
				</Tooltip>
				{showPercentileSelector ? (
					<ModelPercentileSelect
						value={selectedPercentile}
						onChange={handlePercentileChange}
						isLoading={isLoadingPercentile}
						ariaLabel="Select performance percentile"
					/>
				) : null}
				</div>
			</div>
			{hasTelemetry ? (
				<>
					<ModelPerformanceCards
						summary={activeMetrics.summary}
						prevSummary={activeMetrics.prevSummary}
						hourly={activeMetrics.hourly}
						providerDaily7d={activeMetrics.providerDaily7d}
						qualitySeries={activeMetrics.qualitySeries}
					/>
					{showDetailedPanels ? (
						<>
							<Card className="px-5 py-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="space-y-1">
										<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
											Cumulative Tokens
										</p>
										<p className="text-2xl font-semibold text-foreground">
											{cumulativeTokens}
										</p>
									</div>
									<p className="text-xs text-muted-foreground">
										{cumulativeSince
											? `Since ${cumulativeSince}`
											: "Since model release"}
									</p>
								</div>
							</Card>
							<ModelSuccessChart successSeries={activeMetrics.successSeries} />
							<ModelTokenTrajectoryChart data={tokenTrajectory} />
						</>
					) : null}
				</>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No gateway telemetry yet</EmptyTitle>
						<EmptyDescription>
							This model hasn&apos;t processed any gateway traffic in the selected
							window. Live charts will appear as soon as requests arrive.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
