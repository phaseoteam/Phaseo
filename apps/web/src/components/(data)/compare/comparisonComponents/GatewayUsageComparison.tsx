import type { ExtendedModel } from "@/data/types";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareGatewayUsageByModel } from "../types";

function formatInteger(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatCompact(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 2,
	}).format(value);
}

function formatLatency(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `${value.toFixed(value < 10 ? 2 : 0)}ms`;
}

function formatThroughput(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `${value.toFixed(value < 10 ? 2 : 1)} tok/s`;
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function MiniSeries({
	modelId,
	points,
	unit,
	tone = "sky",
}: {
	modelId: string;
	points: Array<{ date: string; value: number }>;
	unit: string;
	tone?: "sky" | "emerald";
}) {
	const maxValue = points.length
		? Math.max(...points.map((point) => point.value), 1)
		: 1;
	const barClass = tone === "emerald" ? "bg-emerald-500/80" : "bg-sky-500/80";

	return (
		<div className="flex h-16 items-end gap-[2px] rounded border border-border/60 bg-muted/20 p-1.5">
			{points.length ? (
				<TooltipProvider delayDuration={120}>
					{points.map((point, index) => (
						<Tooltip key={`${modelId}-${unit}-${index}`}>
							<TooltipTrigger asChild>
								<div className="flex h-full min-w-0 flex-1 cursor-help flex-col">
									<div
										className={cn("w-full rounded-[2px]", barClass)}
										style={{
											height: `${Math.max(
												point.value > 0 ? 8 : 2,
												Math.round((point.value / maxValue) * 100)
											)}%`,
											opacity: point.value > 0 ? 0.95 : 0.18,
											marginTop: "auto",
										}}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent className="text-xs">
								<div>{formatDate(point.date)}</div>
								<div>
									{formatInteger(point.value)} {unit}
								</div>
							</TooltipContent>
						</Tooltip>
					))}
				</TooltipProvider>
			) : (
				<div className="px-1 text-xs text-muted-foreground">
					No activity points
				</div>
			)}
		</div>
	);
}

export default function GatewayUsageComparison({
	selectedModels,
	usageByModel,
}: {
	selectedModels: ExtendedModel[];
	usageByModel: CompareGatewayUsageByModel;
}) {
	const hasAnyUsage = selectedModels.some((model) => usageByModel[model.id]);
	if (!hasAnyUsage) return null;

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Gateway Usage</h2>
					<p className="text-sm text-muted-foreground">
						30-day activity plus recent runtime. Text-first models use token volume; other modalities fallback to request activity.
					</p>
				</div>
				<Badge variant="outline" className="text-xs">
					Last 30d
				</Badge>
			</header>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{selectedModels.map((model) => {
					const usage = usageByModel[model.id];
					const tokenSeries = usage?.points30d ?? [];
					const requestSeries = usage?.requestPoints24h ?? [];

					return (
						<Card key={`gateway-${model.id}`} className="border-border/60 bg-card shadow-sm">
							<CardHeader className="space-y-2 pb-2">
								<CardTitle className="text-sm font-semibold">
									<div className="flex items-center gap-2">
										<Link
											href={`/organisations/${model.provider.provider_id}`}
											aria-label={`View ${model.provider.name}`}
										>
											<ProviderLogo
												id={model.provider.provider_id}
												alt={model.provider.name}
												size="xs"
											/>
										</Link>
										<Link
											href={`/models/${model.id}`}
											className="truncate underline decoration-transparent hover:decoration-current"
										>
											{model.name}
										</Link>
									</div>
								</CardTitle>
								<CardDescription className="text-xs">
									{model.provider.name}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{usage ? (
									<>
										<div className="space-y-1">
											<div className="flex items-baseline justify-between gap-2">
												<div className="font-mono text-xl font-semibold tracking-tight">
													{formatCompact(usage.tokens30d)}
												</div>
												<Badge variant="outline" className="text-[10px]">
													tokens · last 30 days
												</Badge>
											</div>
											<MiniSeries
												modelId={model.id}
												points={tokenSeries}
												unit="tokens"
												tone="sky"
											/>
											<div className="text-[11px] text-muted-foreground">
												{usage.latestDate ? `Token data up to ${formatDate(usage.latestDate)}` : "Recent token activity"}
											</div>
										</div>

										<div className="grid grid-cols-3 gap-2 text-xs">
											<div className="rounded-md border border-border/60 bg-background/60 p-2">
												<div className="text-muted-foreground">Requests</div>
												<div className="font-mono font-semibold">
													{formatCompact(usage.totalRequests)}
												</div>
											</div>
											<div className="rounded-md border border-border/60 bg-background/60 p-2">
												<div className="text-muted-foreground">Latency</div>
												<div className="font-mono font-semibold">
													{formatLatency(usage.latencyP50Ms30m)}
												</div>
											</div>
											<div className="rounded-md border border-border/60 bg-background/60 p-2">
												<div className="text-muted-foreground">Throughput</div>
												<div className="font-mono font-semibold">
													{formatThroughput(usage.throughputP50TokPerSec30m)}
												</div>
											</div>
										</div>

										<div className="space-y-1">
											<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
												<span>Request activity · 24h</span>
												<span>{formatCompact(usage.requests30m)} in 30m</span>
											</div>
											<MiniSeries
												modelId={model.id}
												points={requestSeries}
												unit="requests"
												tone="emerald"
											/>
										</div>
									</>
								) : (
									<div className="text-sm text-muted-foreground">
										No gateway usage data available.
									</div>
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>
		</section>
	);
}

