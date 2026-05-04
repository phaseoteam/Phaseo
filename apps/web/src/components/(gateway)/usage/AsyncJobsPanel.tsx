"use client";

import * as React from "react";
import {
	fetchAsyncJobDetail,
	fetchModelMetadata,
	fetchProviderNames,
	fetchRecentAsyncJobs,
	type AsyncJobDetailRow,
	type AsyncJobRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	AlertTriangle,
	Clock3,
	Layers3,
	RefreshCw,
	Send,
	Video,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { cn } from "@/lib/utils";
import { registerUsageViewRefresher } from "@/lib/gateway/usage/refreshBus";
import {
	formatDateTime,
	formatWordyDateTime,
} from "@/lib/gateway/usage/timeFormatting";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import Link from "next/link";
import {
	DetailKeyValueGrid,
	DetailMetricTile,
	DetailSection,
} from "./DetailDialogPrimitives";

function AsyncJobHeader({
	job,
	modelMetadata,
	providerNames,
}: {
	job: AsyncJobDetailRow;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
}) {
	const modelHref = getModelDetailsHref(job.model ?? null);
	const modelLabel = getModelDisplayName(job.model ?? null, modelMetadata);
	const modelLogoId = getModelLogoId(job.model ?? null, modelMetadata);
	const providerLabel = job.provider
		? providerNames.get(job.provider) ?? job.provider
		: null;
	const subtitle = [
		providerLabel,
		jobStatusPresentation(job.status).label,
		formatTimestamp(job.request_created_at ?? job.created_at),
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div>
			<div className="px-5 py-4 sm:px-6 sm:py-5">
				<div className="pr-10">
					<DialogTitle className="flex min-w-0 items-center gap-3 text-lg font-semibold">
						{modelLogoId ? (
							<Logo
								id={modelLogoId}
								width={20}
								height={20}
								className="flex-shrink-0"
							/>
						) : null}
						{modelHref ? (
							<Link
								href={modelHref}
								className="min-w-0 truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
							>
								{job.model ? modelLabel : "Async job"}
							</Link>
						) : (
							<span className="min-w-0 truncate">
								{job.model ? modelLabel : "Async job"}
							</span>
						)}
					</DialogTitle>
					<div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
				</div>
			</div>
			<Separator />
		</div>
	);
}

function formatTimestamp(value: string | null | undefined): string {
	if (!value) return "-";
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return value;
	return formatWordyDateTime(new Date(parsed), { includeTime: true });
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
	event.stopPropagation();
}

function getModelDetailsHref(modelId: string | null): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	const routeModelId = modelParts.join("/");
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(routeModelId)}`;
}

function getModelLogoId(
	modelId: string | null,
	modelMetadata: ModelMetadataMap,
): string | null {
	if (!modelId) return null;
	const metadata = modelMetadata.get(modelId);
	if (metadata?.organisationId) return metadata.organisationId;
	if (modelId.includes("/")) {
		const [organisationId] = modelId.split("/");
		return organisationId || null;
	}
	return null;
}

function formatMoneyFromNanos(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${(value / 1e9).toFixed(5)}`;
}

function webhookStatusBadgeClass(status: string | null | undefined): string {
	switch ((status ?? "").toLowerCase()) {
		case "completed":
		case "delivered":
			return "border-emerald-200 bg-emerald-50 text-emerald-700";
		case "scheduled_retry":
		case "pending":
		case "in_progress":
			return "border-amber-200 bg-amber-50 text-amber-700";
		case "failed":
		case "failed_permanently":
		case "cancelled":
			return "border-red-200 bg-red-50 text-red-700";
		default:
			return "border-slate-200 bg-slate-50 text-slate-700";
	}
}

function jobStatusPresentation(status: string | null | undefined): {
	label: "Queued" | "Processing" | "Completed" | "Failed" | "Cancelled" | "Expired";
	className: string;
} {
	switch ((status ?? "").trim().toLowerCase()) {
		case "pending":
		case "queued":
			return {
				label: "Queued",
				className: "border-slate-200 bg-slate-50 text-slate-700",
			};
		case "in_progress":
		case "processing":
		case "running":
			return {
				label: "Processing",
				className: "border-amber-200 bg-amber-50 text-amber-700",
			};
		case "completed":
		case "succeeded":
			return {
				label: "Completed",
				className: "border-emerald-200 bg-emerald-50 text-emerald-700",
			};
		case "failed":
		case "error":
			return {
				label: "Failed",
				className: "border-red-200 bg-red-50 text-red-700",
			};
		case "cancelled":
		case "canceled":
			return {
				label: "Cancelled",
				className: "border-zinc-200 bg-zinc-50 text-zinc-700",
			};
		case "expired":
		case "timed_out":
		case "timeout":
			return {
				label: "Expired",
				className: "border-orange-200 bg-orange-50 text-orange-700",
			};
		default:
			return {
				label: "Queued",
				className: "border-slate-200 bg-slate-50 text-slate-700",
			};
	}
}

function kindIcon(kind: string) {
	return kind === "video" ? Video : Layers3;
}

function AttemptStatusBadge({ status }: { status: string | null | undefined }) {
	return (
		<Badge variant="outline" className={webhookStatusBadgeClass(status)}>
			{status ?? "unknown"}
		</Badge>
	);
}

function JobStatusBadge({ status }: { status: string | null | undefined }) {
	const presentation = jobStatusPresentation(status);
	return (
		<Badge variant="outline" className={presentation.className}>
			{presentation.label}
		</Badge>
	);
}

function AsyncJobDetailDialog({
	job,
	modelMetadata,
	providerNames,
	open,
	onOpenChange,
}: {
	job: AsyncJobDetailRow | null;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
				<DialogHeader className="sr-only">
					<DialogTitle>Async job details</DialogTitle>
				</DialogHeader>

				{job ? (
					<div>
						<AsyncJobHeader
							job={job}
							modelMetadata={modelMetadata}
							providerNames={providerNames}
						/>

						<div className="max-h-[calc(90vh-110px)] space-y-6 overflow-y-auto p-5 sm:p-6">
							<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
								<DetailMetricTile
									icon={Clock3}
									label="Request cost"
									value={<span className="font-mono">{formatMoneyFromNanos(job.request_cost_nanos)}</span>}
									tone="amber"
									compact
								/>
								<DetailMetricTile
									icon={Send}
									label="Delivered events"
									value={job.webhook.delivered_events}
									tone="emerald"
									compact
								/>
								<DetailMetricTile
									icon={AlertTriangle}
									label="Pending retries"
									value={job.webhook.pending_retries}
									tone={job.webhook.pending_retries > 0 ? "rose" : "slate"}
									compact
								/>
								<DetailMetricTile
									icon={Clock3}
									label="Next retry"
									value={job.webhook.next_retry_at ? formatTimestamp(job.webhook.next_retry_at) : "-"}
									tone="slate"
									compact
								/>
								<DetailMetricTile
									icon={Layers3}
									label={job.kind === "video" ? "Resolution" : "Endpoint"}
									value={job.kind === "video" ? (job.resolution ?? "-") : (job.endpoint ?? "-")}
									tone="violet"
									compact
								/>
								<DetailMetricTile
									icon={Video}
									label={job.kind === "video" ? "Duration" : "Completion window"}
									value={
										job.kind === "video"
											? job.duration_seconds != null
												? `${job.duration_seconds}s`
												: "-"
											: job.completion_window ?? "-"
									}
									tone="sky"
									compact
								/>
							</div>

							<DetailSection title="Job details" className="border-none bg-transparent p-0">
								<DetailKeyValueGrid
									columns={2}
									items={[
										{
											label: "Job ID",
											value: (
												<div className="flex items-center gap-2">
													<code className="min-w-0 truncate font-mono text-xs">
														{job.internal_id}
													</code>
													<CopyButton
														size="sm"
														variant="ghost"
														className="text-muted-foreground hover:text-foreground"
														content={job.internal_id}
														aria-label="Copy job id"
													/>
												</div>
											),
										},
										{
											label: "Request ID",
											value: job.request_id ? (
												<code className="font-mono text-xs">{job.request_id}</code>
											) : (
												"-"
											),
										},
										{
											label: "Provider",
											value: job.provider ? (
												<Link
													href={`/api-providers/${encodeURIComponent(job.provider)}`}
													className="inline-flex items-center gap-2 underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
												>
													<Logo
														id={job.provider}
														width={16}
														height={16}
														className="flex-shrink-0"
													/>
													<span>{providerNames.get(job.provider) ?? job.provider}</span>
												</Link>
											) : (
												"-"
											),
										},
										{
											label: "Model ID",
											value: job.model ? (
												<code className="font-mono text-xs">{job.model}</code>
											) : (
												"-"
											),
										},
										{
											label: "Status",
											value: <JobStatusBadge status={job.status} />,
										},
										{
											label: "Job type",
											value: (
												<span className="inline-flex items-center gap-2 capitalize">
													{React.createElement(kindIcon(job.kind), {
														className: "h-4 w-4 text-muted-foreground",
													})}
													{job.kind}
												</span>
											),
										},
										{
											label: job.kind === "video" ? "Resolution" : "Endpoint",
											value: job.kind === "video" ? (job.resolution ?? "-") : (job.endpoint ?? "-"),
										},
										{
											label: job.kind === "video" ? "Duration" : "Completion window",
											value:
												job.kind === "video"
													? job.duration_seconds != null
														? `${job.duration_seconds}s`
														: "-"
													: job.completion_window ?? "-",
										},
										{ label: "Created", value: formatTimestamp(job.created_at) },
										{ label: "Updated", value: formatTimestamp(job.updated_at) },
										{
											label: "Billed",
											value: job.billed_at ? formatTimestamp(job.billed_at) : "Not billed",
										},
										{
											label: "Request created",
											value: formatTimestamp(job.request_created_at),
										},
									]}
								/>
							</DetailSection>

							<div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
								<DetailSection title="Webhook configuration">
									<DetailKeyValueGrid
										columns={1}
										items={[
											{
												label: "Webhook URL",
												value: job.webhook.url ?? "No webhook configured",
											},
											{
												label: "Last attempt",
												value: job.webhook.last_attempt_at
													? formatTimestamp(job.webhook.last_attempt_at)
													: "-",
											},
											{
												label: "Last attempt status",
												value: job.webhook.last_attempt_status ? (
													<AttemptStatusBadge status={job.webhook.last_attempt_status} />
												) : (
													"-"
												),
											},
										]}
									/>
								</DetailSection>
								<DetailSection title="Webhook summary">
									<DetailKeyValueGrid
										columns={1}
										items={[
											{
												label: "Delivered events",
												value: job.webhook.delivered_events.toLocaleString(),
											},
											{
												label: "Pending retries",
												value: job.webhook.pending_retries.toLocaleString(),
											},
											{
												label: "Attempts recorded",
												value: job.webhook_attempts.length.toLocaleString(),
											},
										]}
									/>
								</DetailSection>
							</div>

							<DetailSection title="Webhook attempts">
								{job.webhook_attempts.length === 0 ? (
									<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
										No webhook attempts recorded yet.
									</div>
								) : (
									<div className="rounded-lg border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Event</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Attempt</TableHead>
													<TableHead>Tried</TableHead>
													<TableHead>Response</TableHead>
													<TableHead>Next retry</TableHead>
													<TableHead>Error</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{job.webhook_attempts.map((attempt) => (
													<TableRow key={attempt.id}>
														<TableCell className="font-mono text-xs">{attempt.event_type}</TableCell>
														<TableCell><AttemptStatusBadge status={attempt.status} /></TableCell>
														<TableCell>{attempt.attempt_number} / {attempt.max_attempts}</TableCell>
														<TableCell>{formatTimestamp(attempt.tried_at)}</TableCell>
														<TableCell>{attempt.response_status ?? "-"}</TableCell>
														<TableCell>{formatTimestamp(attempt.next_retry_at)}</TableCell>
														<TableCell className="max-w-[260px] whitespace-normal break-words text-xs text-muted-foreground">
															{attempt.error_message ?? attempt.response_body_preview ?? "-"}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</DetailSection>
						</div>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export default function AsyncJobsPanel({
	initialJobs,
	title = "Async job webhooks",
	description = "Recent video and batch jobs with webhook delivery history, pending retries, and failures.",
	emptyMessage = "No async jobs with webhook activity yet.",
	refreshLimit = 20,
	includeWithoutWebhook = false,
	variant = "card",
	providerNames,
	modelMetadata,
	timeRange,
	showRefreshButton = true,
	kindFilter = null,
	statusFilter = null,
	providerFilter = null,
}: {
	initialJobs: AsyncJobRow[];
	title?: string;
	description?: string;
	emptyMessage?: string;
	refreshLimit?: number;
	includeWithoutWebhook?: boolean;
	variant?: "card" | "logs";
	providerNames?: Map<string, string>;
	modelMetadata?: ModelMetadataMap;
	timeRange?: { from: string; to: string };
	showRefreshButton?: boolean;
	kindFilter?: "video" | "batch" | null;
	statusFilter?: string | null;
	providerFilter?: string | null;
}) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const [jobs, setJobs] = React.useState(initialJobs);
	const [resolvedProviderNames, setResolvedProviderNames] = React.useState(
		() => new Map(providerNames ?? []),
	);
	const [resolvedModelMetadata, setResolvedModelMetadata] =
		React.useState<ModelMetadataMap>(() => new Map(modelMetadata ?? []));
	const [open, setOpen] = React.useState(false);
	const [selectedJob, setSelectedJob] = React.useState<AsyncJobDetailRow | null>(null);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isLoadingDetail, startLoadingDetail] = React.useTransition();
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);

	React.useEffect(() => {
		setJobs(initialJobs);
	}, [initialJobs]);

	React.useEffect(() => {
		setResolvedProviderNames(new Map(providerNames ?? []));
	}, [providerNames]);

	React.useEffect(() => {
		setResolvedModelMetadata(new Map(modelMetadata ?? []));
	}, [modelMetadata]);

	React.useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	const refresh = React.useCallback(() => {
		return (async () => {
			setIsRefreshing(true);
			try {
			const next = await fetchRecentAsyncJobs({
				limit: refreshLimit,
				includeWithoutWebhook,
				timeRange,
				kind: kindFilter,
				status: statusFilter,
				provider: providerFilter,
			});
			setJobs(next);
			const providerIds = Array.from(
				new Set(
					next
						.map((job) => job.provider)
						.filter(
							(providerId): providerId is string =>
								typeof providerId === "string" && providerId.trim().length > 0,
						),
				),
			);
			const modelIds = Array.from(
				new Set(
					next
						.map((job) => job.model)
						.filter(
							(modelId): modelId is string =>
								typeof modelId === "string" && modelId.trim().length > 0,
						),
				),
			);
			const [nextProviderNames, nextModelMetadata] = await Promise.all([
				fetchProviderNames(providerIds),
				fetchModelMetadata(modelIds),
			]);
			setResolvedProviderNames(nextProviderNames);
			setResolvedModelMetadata(nextModelMetadata);
			} finally {
				setIsRefreshing(false);
			}
		})();
	}, [includeWithoutWebhook, kindFilter, providerFilter, refreshLimit, statusFilter, timeRange]);

	React.useEffect(() => registerUsageViewRefresher("jobs", refresh), [refresh]);

	const openDetail = React.useCallback((job: AsyncJobRow) => {
		setOpen(true);
		startLoadingDetail(async () => {
			const detail = await fetchAsyncJobDetail({
				kind: job.kind,
				internalId: job.internal_id,
			});
			setSelectedJob(detail);
		});
	}, []);

	const table = jobs.length === 0 ? (
		<div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
			{emptyMessage}
		</div>
	) : (
	<>
		{variant === "logs" ? (
			<div className="space-y-3 md:hidden">
				{jobs.map((job) => {
					const timestamp = job.request_created_at ?? job.created_at;
					const providerLabel = job.provider
						? resolvedProviderNames.get(job.provider) ?? job.provider
						: null;
					const modelLabel = getModelDisplayName(
						job.model,
						resolvedModelMetadata,
					);
					const modelHref = getModelDetailsHref(job.model);
					const modelLogoId = getModelLogoId(
						job.model,
						resolvedModelMetadata,
					);
					const Icon = kindIcon(job.kind);
					return (
						<button
							key={`mobile-${job.kind}:${job.internal_id}`}
							type="button"
							className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
							onClick={() => openDetail(job)}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="font-mono text-xs text-muted-foreground">
										{timestamp ? formatTimestamp(timestamp) : "-"}
									</div>
									<div className="mt-1 flex items-center gap-2">
										{modelLogoId ? (
											<Logo
												id={modelLogoId}
												width={16}
												height={16}
												className="flex-shrink-0"
											/>
										) : null}
										<div className="min-w-0 text-sm font-medium text-foreground">
											{modelHref ? (
												<Link
													href={modelHref}
													className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
													title={job.model ?? undefined}
													onClick={stopRowClick}
												>
													{modelLabel}
												</Link>
											) : (
												<span className="truncate">{modelLabel}</span>
											)}
										</div>
									</div>
								</div>
								<div className="shrink-0 text-right">
									<div className="font-mono text-sm text-foreground">
										{formatMoneyFromNanos(job.request_cost_nanos)}
									</div>
									<div className="mt-1">
										<JobStatusBadge status={job.status} />
									</div>
								</div>
							</div>

							<div className="mt-3 flex flex-wrap items-center gap-2">
								{job.provider ? (
									<Badge
										variant="outline"
										className="inline-flex items-center gap-2"
									>
										<Logo
											id={job.provider}
											width={14}
											height={14}
											className="flex-shrink-0"
										/>
										<span className="truncate">{providerLabel}</span>
									</Badge>
								) : null}
								<Badge
									variant="outline"
									className="inline-flex items-center gap-2 capitalize"
								>
									<Icon className="h-3.5 w-3.5 text-muted-foreground" />
									{job.kind}
								</Badge>
							</div>
						</button>
					);
				})}
			</div>
		) : null}

		<div className={cn("rounded-lg border", variant === "logs" ? "hidden md:block" : undefined)}>
			<Table className={variant === "logs" ? "text-xs" : undefined}>
				<TableHeader>
					<TableRow className={variant === "logs" ? "h-9" : undefined}>
						{variant === "logs" ? <TableHead>Timestamp</TableHead> : null}
						{variant === "logs" ? <TableHead>Model</TableHead> : <TableHead>Job</TableHead>}
						{variant === "logs" ? <TableHead>Provider</TableHead> : null}
						{variant === "logs" ? <TableHead>Job</TableHead> : null}
						{variant === "logs" ? <TableHead className="text-right">Cost</TableHead> : null}
						<TableHead>Status</TableHead>
						{variant === "logs" ? null : <TableHead>Webhook</TableHead>}
						{variant === "logs" ? null : <TableHead>Last attempt</TableHead>}
						{variant === "logs" ? null : <TableHead>Next retry</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{jobs.map((job) => {
						const Icon = kindIcon(job.kind);
						const timestamp = job.request_created_at ?? job.created_at;
						const providerLabel = job.provider
							? resolvedProviderNames.get(job.provider) ?? job.provider
							: null;
						const modelLabel = getModelDisplayName(
							job.model,
							resolvedModelMetadata,
						);
						const modelHref = getModelDetailsHref(job.model);
						const modelLogoId = getModelLogoId(
							job.model,
							resolvedModelMetadata,
						);
						return (
							<TableRow
								key={`${job.kind}:${job.internal_id}`}
								className={cn(
									variant === "logs" ? "h-12" : undefined,
									"cursor-pointer hover:bg-muted/40",
								)}
								onClick={() => openDetail(job)}
							>
								{variant === "logs" ? (
									<TableCell className="py-2 font-mono text-xs">
										{timestamp ? (
											<HoverCard>
												<HoverCardTrigger asChild>
													<span className="cursor-help underline underline-offset-2 decoration-dotted">
														{formatTimestamp(timestamp)}
													</span>
												</HoverCardTrigger>
												<HoverCardContent align="start" className="w-auto">
													{(() => {
														const date = new Date(timestamp);
														const unixSeconds = Math.floor(
															date.getTime() / 1000,
														);
														return (
															<div className="grid gap-2 text-xs">
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		{userTimeZone}
																	</div>
																	<div className="font-mono">
																		{formatDateTime(date, userTimeZone)}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		UTC
																	</div>
																	<div className="font-mono">
																		{formatDateTime(date, "UTC")}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		Relative
																	</div>
																	<div className="font-mono">
																		{relativeNowMs
																			? formatRelativeToNow(date, relativeNowMs)
																			: "-"}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		Timestamp
																	</div>
																	<div className="font-mono">
																		{unixSeconds}
																	</div>
																</div>
															</div>
														);
													})()}
												</HoverCardContent>
											</HoverCard>
										) : (
											"-"
										)}
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2">
										<div className="max-w-[280px]">
											<div className="flex items-center gap-2">
												{modelLogoId ? (
													<Logo
														id={modelLogoId}
														width={16}
														height={16}
														className="flex-shrink-0"
													/>
												) : null}
												{modelHref ? (
													<Link
														href={modelHref}
														className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														title={job.model ?? undefined}
														onClick={stopRowClick}
													>
														{modelLabel}
													</Link>
												) : (
													<div
														className="truncate font-medium text-foreground"
														title={job.model ?? undefined}
													>
														{modelLabel}
													</div>
												)}
											</div>
										</div>
									</TableCell>
								) : (
									<TableCell>
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<Icon className="h-4 w-4 text-muted-foreground" />
												<span className="font-medium capitalize">{job.kind}</span>
												<span className="font-mono text-xs text-muted-foreground">{job.internal_id}</span>
											</div>
											<div className="text-xs text-muted-foreground">
												{job.provider ?? "Unknown provider"}
												{job.model ? ` · ${job.model}` : ""}
											</div>
										</div>
									</TableCell>
								)}
								{variant === "logs" ? (
									<TableCell className="py-2">
										{job.provider ? (
											<Badge
												variant="outline"
												className="inline-flex items-center gap-2"
											>
												<Logo
													id={job.provider}
													width={14}
													height={14}
													className="flex-shrink-0"
												/>
												<span className="truncate">{providerLabel}</span>
											</Badge>
										) : (
											<Badge variant="outline">-</Badge>
										)}
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2">
										<div className="flex items-center gap-2">
											<Badge
												variant="outline"
												className="inline-flex items-center gap-2 capitalize"
											>
												<Icon className="h-3.5 w-3.5 text-muted-foreground" />
												{job.kind}
											</Badge>
										</div>
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2 text-right font-mono text-xs">
										{formatMoneyFromNanos(job.request_cost_nanos)}
									</TableCell>
								) : null}
								<TableCell>
									<JobStatusBadge status={job.status} />
								</TableCell>
								{variant === "logs" ? null : (
									<TableCell>
										<div className="space-y-1 text-xs">
											<div>{job.webhook.delivered_events} delivered</div>
											<div className="text-muted-foreground">
												{job.webhook.pending_retries > 0
													? `${job.webhook.pending_retries} pending retry`
													: job.webhook.configured
														? "No pending retries"
														: "No webhook configured"}
											</div>
										</div>
									</TableCell>
								)}
								{variant === "logs" ? null : (
									<TableCell>
										<div className="space-y-1 text-xs">
											<div>{formatTimestamp(job.webhook.last_attempt_at)}</div>
											{job.webhook.last_attempt_status ? (
												<div className="text-muted-foreground">{job.webhook.last_attempt_status}</div>
											) : null}
										</div>
									</TableCell>
								)}
								{variant === "logs" ? null : (
									<TableCell className="text-xs">
										<div className="flex items-center gap-2 text-muted-foreground">
											<Clock3 className="h-3.5 w-3.5" />
											{formatTimestamp(job.webhook.next_retry_at)}
										</div>
										{job.webhook.last_error_message ? (
											<div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
												<AlertTriangle className="mt-0.5 h-3 w-3" />
												<span className="line-clamp-2">{job.webhook.last_error_message}</span>
											</div>
										) : null}
									</TableCell>
								)}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	</>
	);

	return (
		<>
			{variant === "card" ? (
				<Card>
					<CardHeader className="flex flex-row items-start justify-between gap-4">
						<div className="space-y-1">
							<CardTitle>{title}</CardTitle>
							<CardDescription>{description}</CardDescription>
						</div>
						{showRefreshButton ? (
							<Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
								<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
								Refresh
							</Button>
						) : null}
					</CardHeader>
					<CardContent>{table}</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{showRefreshButton ? (
						<div className="flex items-center justify-end">
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={refresh}
								disabled={isRefreshing}
								aria-label="Refresh jobs"
							>
								<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
							</Button>
						</div>
					) : null}
					{table}
				</div>
			)}

			<AsyncJobDetailDialog
				job={selectedJob}
				modelMetadata={resolvedModelMetadata}
				providerNames={resolvedProviderNames}
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) {
						setSelectedJob(null);
					}
				}}
			/>

			{isLoadingDetail ? (
				<div className="sr-only">Loading async job details...</div>
			) : null}
		</>
	);
}
