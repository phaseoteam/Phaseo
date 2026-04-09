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
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareGatewayUsageByModel } from "../types";

function formatInteger(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `${value.toFixed(1)}%`;
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
					const primarySeries = tokenSeries;
					const primaryValueUnit = "tokens";
					const primaryTotal = usage?.tokens30d ?? null;
					const maxValue = primarySeries.length
						? Math.max(...primarySeries.map((point) => point.value), 1)
						: 1;

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
							<CardContent className="space-y-3">
								{usage ? (
									<>
										<div className="grid grid-cols-2 gap-2 text-xs">
											<div className="rounded-md border border-border/60 bg-background/60 p-2 col-span-2">
												<div className="text-muted-foreground">Monthly Tokens</div>
												<div className="font-mono font-semibold">
													{formatInteger(primaryTotal)}
												</div>
											</div>
											<div className="rounded-md border border-border/60 bg-background/60 p-2">
												<div className="text-muted-foreground">Throughput</div>
												<div className="font-mono font-semibold">
													{formatThroughput(usage.throughputP50TokPerSec30m)}
												</div>
											</div>
											<div className="rounded-md border border-border/60 bg-background/60 p-2">
												<div className="text-muted-foreground">Latency</div>
												<div className="font-mono font-semibold">
													{formatLatency(usage.latencyP50Ms30m)}
												</div>
											</div>
										</div>

										<div className="space-y-1">
											<div className="text-[11px] text-muted-foreground">
												{usage.latestDate ? `Up to ${formatDate(usage.latestDate)}` : "Recent activity"}
											</div>
											<div className="flex h-10 items-end gap-[2px] rounded border border-border/60 bg-muted/20 p-1">
												{primarySeries.length ? (
													<TooltipProvider delayDuration={120}>
														{primarySeries.map((point, index) => (
															<Tooltip key={`${model.id}-usage-${index}`}>
																<TooltipTrigger asChild>
																	<div
																		className="min-w-0 flex-1 h-full cursor-help flex flex-col"
																	>
																		<div
																			className="w-full rounded-[2px] bg-sky-500/80"
																			style={{
																				height: `${Math.max(
																					10,
																					Math.round((point.value / maxValue) * 100)
																				)}%`,
																				opacity: point.value > 0 ? 0.95 : 0.2,
																				marginTop: "auto",
																			}}
																		/>
																	</div>
																</TooltipTrigger>
																<TooltipContent className="text-xs">
																	<div>{formatDate(point.date)}</div>
																	<div>
																		{point.value.toLocaleString("en-US")} {primaryValueUnit}
																	</div>
																</TooltipContent>
															</Tooltip>
														))}
													</TooltipProvider>
												) : (
													<div className="text-xs text-muted-foreground px-1">
														No activity points
													</div>
												)}
											</div>
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

