"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
	fetchAppMetadata,
	fetchModelMetadata,
	fetchProviderMetadata,
	fetchProviderNames,
	fetchSessionRequests,
	type AppMetadata,
	type ProviderMetadataEntry,
	fetchSessionRollups,
	type SessionRequestRow,
	type SessionRollupRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { Logo } from "@/components/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { registerUsageViewRefresher } from "@/lib/gateway/usage/refreshBus";
import { formatErrorListSummary } from "@/lib/gateway/usage/errorListSummary";
import { cn } from "@/lib/utils";
import {
	AppWindow,
	Check,
	Copy,
	RefreshCw,
} from "lucide-react";
import {
	formatDateTime,
	formatWordyDateTime,
	formatWordyRange,
	shortenIdentifier,
} from "@/lib/gateway/usage/timeFormatting";
import {
	getModelDetailsHref,
	getModelDisplayName,
	getModelMetadataEntry,
	type ModelMetadataMap,
} from "./model-display";
import {
	buildUsageFromNormalizedRequestFields,
	extractUsageMeters,
	formatUsageNumber,
} from "./usageMeters";
import {
        DetailKeyValueGrid,
        DetailSection,
} from "./DetailDialogPrimitives";

const RequestDetailDialog = dynamic(() => import("./RequestDetailDialog"));

function formatMoneyFromNanos(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${(value / 1e9).toFixed(5)}`;
}

function formatDuration(milliseconds: number): string {
	if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))} ms`;
	const seconds = milliseconds / 1_000;
	if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
	const minutes = seconds / 60;
	if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
	return `${(minutes / 60).toFixed(1)} hr`;
}

function getModelLogoId(
	modelId: string | null,
	modelMetadata: ModelMetadataMap,
): string | null {
	if (!modelId) return null;
	const metadata = getModelMetadataEntry(modelId, modelMetadata);
	if (metadata?.organisationId) return metadata.organisationId;
	if (modelId.includes("/")) {
		const [organisationId] = modelId.split("/");
		return organisationId || null;
	}
	return null;
}

function getUsageTokenCounts(request: SessionRequestRow): {
	input: number | null;
	output: number | null;
} {
	const usage = buildUsageFromNormalizedRequestFields(request.usage, request);
	const meters = extractUsageMeters(usage);
	const input = meters.find((meter) => meter.key === "input_tokens")?.value ?? null;
	const output =
		meters.find((meter) => meter.key === "output_tokens")?.value ?? null;
	return { input, output };
}

function buildAppLabel(app: AppMetadata | null | undefined, fallbackId?: string | null): string {
	if (app?.title?.trim()) return app.title.trim();
	return fallbackId?.trim() || "Unknown app";
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
	event.stopPropagation();
}

function collectSessionAppIds(sessions: SessionRollupRow[]): string[] {
	return Array.from(
		new Set(sessions.flatMap((session) => session.app_ids ?? []).filter(Boolean)),
	);
}

function collectSessionModelIds(sessions: SessionRollupRow[]): string[] {
	return Array.from(
		new Set(sessions.flatMap((session) => session.model_ids ?? []).filter(Boolean)),
	);
}

function collectSessionProviderIds(sessions: SessionRollupRow[]): string[] {
	return Array.from(
		new Set(sessions.flatMap((session) => session.provider_ids ?? []).filter(Boolean)),
	);
}

function AppBadge({
	appId,
	app,
	compact = false,
}: {
	appId: string | null;
	app: AppMetadata | null | undefined;
	compact?: boolean;
}) {
	if (!appId) {
		return <Badge variant="outline" className="rounded-md">-</Badge>;
	}

	const appLabel = buildAppLabel(app, appId);

	return (
		<Link
			href={`/apps/${encodeURIComponent(appId)}`}
			className="rounded-md underline decoration-transparent transition-colors duration-200 hover:decoration-current"
			onClick={stopRowClick}
		>
			<Badge
				variant="outline"
				className={cn(
					"inline-flex cursor-pointer items-center gap-2 rounded-md hover:bg-muted",
					compact ? "max-w-[220px]" : undefined,
				)}
			>
				<Avatar className="h-4 w-4 rounded-[4px] border border-border/60">
					{app?.imageUrl ? (
						<AvatarImage
							src={app.imageUrl}
							alt={appLabel}
							className="object-cover"
						/>
					) : null}
					<AvatarFallback className="rounded-[4px] bg-transparent text-muted-foreground">
						<AppWindow className="h-3 w-3" />
					</AvatarFallback>
				</Avatar>
				<span className="truncate">{appLabel}</span>
			</Badge>
		</Link>
	);
}

function RequestStatusBadge({
	success,
	statusCode,
}: {
	success: boolean;
	statusCode: number | null;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-md",
				success
					? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
					: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300",
			)}
		>
			{success ? "Success" : statusCode ? `Error ${statusCode}` : "Error"}
		</Badge>
	);
}

function TimeHover({
	value,
	userTimeZone,
	relativeNowMs,
	triggerClassName,
}: {
	value: string | null | undefined;
	userTimeZone: string;
	relativeNowMs: number | null;
	triggerClassName?: string;
}) {
	if (!value) return <>-</>;

	const date = new Date(value);
	const unixSeconds = Math.floor(date.getTime() / 1000);

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span
					className={cn(
						"cursor-help underline underline-offset-2 decoration-dotted",
						triggerClassName,
					)}
				>
					{formatWordyDateTime(value, { includeTime: true })}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto">
				<div className="grid gap-2 text-xs">
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">{userTimeZone}</div>
						<div className="font-mono">{formatDateTime(date, userTimeZone)}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">UTC</div>
						<div className="font-mono">{formatDateTime(date, "UTC")}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Relative</div>
						<div className="font-mono">
							{relativeNowMs ? formatRelativeToNow(date, relativeNowMs) : "-"}
						</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Timestamp</div>
						<div className="font-mono">{unixSeconds}</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function PeriodHover({
	start,
	end,
	userTimeZone,
	relativeNowMs,
	triggerClassName,
}: {
	start: string | null | undefined;
	end: string | null | undefined;
	userTimeZone: string;
	relativeNowMs: number | null;
	triggerClassName?: string;
}) {
	if (!start || !end) return <>-</>;

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span
					className={cn(
						"cursor-help underline underline-offset-2 decoration-dotted",
						triggerClassName,
					)}
				>
					{formatWordyRange(start, end)}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto">
				<div className="grid gap-3 text-xs">
					<div className="space-y-1">
						<div className="font-semibold text-foreground">Start</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">{userTimeZone}</div>
							<div className="font-mono">
								{formatDateTime(new Date(start), userTimeZone)}
							</div>
						</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">UTC</div>
							<div className="font-mono">{formatDateTime(new Date(start), "UTC")}</div>
						</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">Relative</div>
							<div className="font-mono">
								{relativeNowMs ? formatRelativeToNow(new Date(start), relativeNowMs) : "-"}
							</div>
						</div>
					</div>
					<div className="space-y-1">
						<div className="font-semibold text-foreground">End</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">{userTimeZone}</div>
							<div className="font-mono">{formatDateTime(new Date(end), userTimeZone)}</div>
						</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">UTC</div>
							<div className="font-mono">{formatDateTime(new Date(end), "UTC")}</div>
						</div>
						<div className="grid grid-cols-[120px_1fr] gap-2">
							<div className="text-muted-foreground">Relative</div>
							<div className="font-mono">
								{relativeNowMs ? formatRelativeToNow(new Date(end), relativeNowMs) : "-"}
							</div>
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function SessionModelsCell({
	modelCounts,
	modelMetadata,
	maxVisible = 3,
}: {
	modelCounts: Array<{ model_id: string; request_count: number }>;
	modelMetadata: ModelMetadataMap;
	maxVisible?: number;
}) {
	const visibleModels = modelCounts.slice(0, maxVisible);
	const hiddenModels = modelCounts.slice(maxVisible);
	const hiddenCount = Math.max(0, modelCounts.length - visibleModels.length);

	return (
		<div className="flex flex-wrap gap-1.5">
			{visibleModels.map(({ model_id: modelId }) => {
				const modelLabel = getModelDisplayName(modelId, modelMetadata);
				const modelHref = getModelDetailsHref(modelId, modelMetadata);
				const modelLogoId = getModelLogoId(modelId, modelMetadata);

				return (
					<Badge
						variant="outline"
						key={modelId}
						className="inline-flex max-w-full items-center gap-1.5 rounded-md"
					>
						{modelLogoId ? (
							<Logo
								id={modelLogoId}
								width={12}
								height={12}
								className="flex-shrink-0"
							/>
						) : null}
						{modelHref ? (
							<Link
								href={modelHref}
								className="truncate underline decoration-transparent transition-colors duration-200 hover:decoration-current"
								title={modelId}
								onClick={stopRowClick}
							>
								{modelLabel}
							</Link>
						) : (
							<span className="truncate" title={modelId}>
								{modelLabel}
							</span>
						)}
					</Badge>
				);
			})}
			{hiddenCount > 0 ? (
				<HoverCard>
					<HoverCardTrigger asChild>
						<Badge
							variant="outline"
							className="cursor-help rounded-md underline decoration-transparent transition-colors duration-200 hover:bg-muted hover:decoration-current"
						>
							+{hiddenCount} more
						</Badge>
					</HoverCardTrigger>
					<HoverCardContent align="start" className="w-72 p-3">
						<div className="space-y-2">
							<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
								More models
							</div>
							<div className="flex flex-wrap gap-1.5">
								{hiddenModels.map(({ model_id: modelId }) => {
									const modelLabel = getModelDisplayName(modelId, modelMetadata);
									const modelHref = getModelDetailsHref(modelId, modelMetadata);
									const modelLogoId = getModelLogoId(modelId, modelMetadata);

									return (
										<Badge
											variant="outline"
											key={`hidden-${modelId}`}
											className="inline-flex max-w-full items-center gap-1.5 rounded-md"
										>
											{modelLogoId ? (
												<Logo
													id={modelLogoId}
													width={12}
													height={12}
													className="flex-shrink-0"
												/>
											) : null}
											{modelHref ? (
												<Link
													href={modelHref}
											className="truncate underline decoration-transparent transition-colors duration-200 hover:decoration-current"
													title={modelId}
													onClick={stopRowClick}
												>
													{modelLabel}
												</Link>
											) : (
												<span className="truncate" title={modelId}>
													{modelLabel}
												</span>
											)}
										</Badge>
									);
								})}
							</div>
						</div>
					</HoverCardContent>
				</HoverCard>
			) : null}
		</div>
	);
}

function SessionDetailSheet({
	session,
	requests,
	appMetadata,
	modelMetadata,
	providerNames,
	providerMetadata,
	loading,
	open,
	onOpenChange,
}: {
	session: SessionRollupRow | null;
	requests: SessionRequestRow[];
	appMetadata: Map<string, AppMetadata>;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	providerMetadata: Map<string, ProviderMetadataEntry>;
	loading: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);
	const [requestDetailOpen, setRequestDetailOpen] = React.useState(false);
	const [selectedRequest, setSelectedRequest] =
		React.useState<SessionRequestRow | null>(null);

	React.useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	if (!session) return null;

	const sessionAppIds = Array.from(
		new Set([
			...(session.app_counts ?? []).map((app) => app.app_id),
			...requests
				.map((request) => request.app_id)
				.filter((appId): appId is string => Boolean(appId)),
		]),
	);
	const sessionApps = sessionAppIds.map((appId) => {
		const request = requests.find((item) => item.app_id === appId);
		return {
			appId,
			app:
				appMetadata.get(appId) ??
				({
					title: request?.app_title ?? appId,
					imageUrl: request?.app_image_url ?? null,
				} satisfies AppMetadata),
		};
	});
	const modelCounts =
		session.model_counts ??
		(session.model_ids ?? []).map((modelId) => ({ model_id: modelId, request_count: 0 }));
	const tokenTotals = requests.reduce(
		(totals, request) => {
			const tokens = getUsageTokenCounts(request);
			totals.input += tokens.input ?? 0;
			totals.output += tokens.output ?? 0;
			return totals;
		},
		{ input: 0, output: 0 },
	);
	const failedRequestCount = requests.filter((request) => !request.success).length;
	const successRate = requests.length
		? ((requests.length - failedRequestCount) / requests.length) * 100
		: null;
	const sessionDuration = Math.max(
		0,
		new Date(session.last_request_at).getTime() -
			new Date(session.first_request_at).getTime(),
	);
	const headlineMetrics = [
		{ label: "Requests", value: session.request_count.toLocaleString() },
		{ label: "Duration", value: formatDuration(sessionDuration) },
		{ label: "Input tokens", value: loading ? "…" : formatUsageNumber(tokenTotals.input) },
		{ label: "Output tokens", value: loading ? "…" : formatUsageNumber(tokenTotals.output) },
		{ label: "Cost", value: formatMoneyFromNanos(session.total_cost_nanos) },
		{
			label: "Success rate",
			value:
				loading || successRate == null
					? "…"
					: `${successRate.toFixed(successRate === 100 ? 0 : 1)}%`,
		},
	];
	const subtitle = [
		formatWordyRange(session.first_request_at, session.last_request_at),
		`${session.request_count.toLocaleString()} reqs`,
		`${modelCounts.length} models`,
	]
		.filter(Boolean)
		.join(" · ");
	const sessionDetailItems = [
		{
			label: "Session ID",
			value: (
				<div className="flex items-center gap-2">
					<code className="min-w-0 truncate font-mono text-xs">
						{session.session_id}
					</code>
					<CopyButton
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-foreground"
						content={session.session_id}
						aria-label="Copy session id"
					/>
				</div>
			),
		},
		{
			label: "Period",
			value: (
				<PeriodHover
					start={session.first_request_at}
					end={session.last_request_at}
					userTimeZone={userTimeZone}
					relativeNowMs={relativeNowMs}
					triggerClassName="font-medium"
				/>
			),
		},
		{
			label: "First request",
			value: formatWordyDateTime(session.first_request_at, { includeTime: true }),
		},
		{
			label: "Last request",
			value: formatWordyDateTime(session.last_request_at, { includeTime: true }),
		},
	];

	const selectedRequestAppName =
		selectedRequest?.app_id
			? buildAppLabel(
					appMetadata.get(selectedRequest.app_id),
					selectedRequest.app_title ?? selectedRequest.app_id,
				)
			: selectedRequest?.app_title ?? null;

	return (
		<>
			<ProviderInspectorSheet
				open={open}
				onOpenChange={(nextOpen) => {
					if (!nextOpen && requestDetailOpen) {
						return;
					}
					onOpenChange(nextOpen);
				}}
			>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[72vw] lg:!w-[68vw] xl:!w-[64vw] 2xl:!w-[60vw] data-[side=right]:sm:max-w-none">
					<div className="flex min-h-0 flex-1 flex-col">
						<ProviderInspectorSheetHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6 sm:py-5">
							<ProviderInspectorSheetTitle className="min-w-0 truncate text-lg font-semibold">
									Session {shortenIdentifier(session.session_id, 6)}
							</ProviderInspectorSheetTitle>
							<ProviderInspectorSheetDescription>{subtitle}</ProviderInspectorSheetDescription>
						</ProviderInspectorSheetHeader>

						<div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
							<div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-border/70 pb-3 sm:grid-cols-3">
								{headlineMetrics.map((metric) => (
									<div key={metric.label} className="min-w-0">
										<div className="text-xs text-muted-foreground">{metric.label}</div>
										<div className="mt-1 truncate font-mono text-sm font-semibold tabular-nums" title={metric.value}>
											{metric.value}
										</div>
									</div>
								))}
							</div>

							<DetailSection title="Session details" className="border-none bg-transparent p-0">
								<DetailKeyValueGrid columns={2} items={sessionDetailItems} />
							</DetailSection>

							<div className="grid gap-6 sm:grid-cols-2">
								<DetailSection
									title={sessionApps.length === 1 ? "App" : "Apps"}
									className="border-none bg-transparent p-0"
								>
									{sessionApps.length > 0 ? (
										<div className="flex flex-wrap gap-1.5">
											{sessionApps.map(({ appId, app }) => (
												<AppBadge key={appId} appId={appId} app={app} />
											))}
										</div>
									) : (
										<div className="text-sm text-muted-foreground">No app metadata recorded.</div>
									)}
								</DetailSection>
								<DetailSection
									title="Models in session"
									className="border-none bg-transparent p-0"
								>
									<SessionModelsCell
										modelCounts={modelCounts}
										modelMetadata={modelMetadata}
										maxVisible={6}
									/>
								</DetailSection>
							</div>

							<DetailSection
								title="Request timeline"
								className="border-none bg-transparent p-0"
							>
								{requests.length === 0 ? (
									<div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
										No requests found for this session in the selected period.
									</div>
								) : (
									<ScrollArea
										className="w-full rounded-lg border"
										scrollBarOrientation="horizontal"
										keepScrollbarMounted
										viewportClassName="w-full pb-2"
									>
										<Table wrapInContainer={false} className="min-w-[860px] text-xs">
									<TableHeader>
										<TableRow className="h-9">
											<TableHead>Time</TableHead>
											<TableHead>Source</TableHead>
											<TableHead>Model</TableHead>
											<TableHead>Provider</TableHead>
											<TableHead className="text-right">In</TableHead>
											<TableHead className="text-right">Out</TableHead>
											<TableHead className="text-right">Cost</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{requests.map((request, index) => {
											const modelLabel = getModelDisplayName(
												request.model_id,
												modelMetadata,
											);
											const modelHref = getModelDetailsHref(request.model_id, modelMetadata, request.provider);
											const modelLogoId = getModelLogoId(
												request.model_id,
												modelMetadata,
											);
											const providerLabel = request.provider
												? providerNames.get(request.provider) ?? request.provider
												: null;
											const tokens = getUsageTokenCounts(request);
											const errorSummary = request.success
												? null
												: formatErrorListSummary(request);

											return (
											<TableRow
												key={`${request.request_id}-${request.created_at}-${index}`}
												className="h-12 cursor-pointer hover:bg-muted/40"
												onClick={() => {
													setSelectedRequest(request);
													setRequestDetailOpen(true);
												}}
												>
													<TableCell className="py-2 font-mono text-xs">
														<button
															type="button"
															className="text-left"
															aria-label={`Open details for request ${request.request_id}`}
															onClick={(event) => {
																event.stopPropagation();
																setSelectedRequest(request);
																setRequestDetailOpen(true);
															}}
														>
															<TimeHover
																value={request.created_at}
																userTimeZone={userTimeZone}
																relativeNowMs={relativeNowMs}
															/>
														</button>
													</TableCell>
											<TableCell className="py-2">
												{request.client_source_name ?? request.client_source_id ?? "Direct HTTP"}
											</TableCell>
											<TableCell className="py-2">
														<div className="flex max-w-[280px] items-center gap-2">
															{modelLogoId ? (
																<Logo
																	id={modelLogoId}
																	width={16}
																	height={16}
																	className="flex-shrink-0"
																/>
															) : null}
															<div className="min-w-0">
																{modelHref ? (
																	<Link
																		href={modelHref}
																	className="truncate underline decoration-transparent transition-colors duration-200 hover:decoration-current"
																		title={request.model_id ?? undefined}
																		onClick={stopRowClick}
																	>
																		{modelLabel}
																	</Link>
																) : (
																	<div
																		className="truncate font-medium text-foreground"
																		title={request.model_id ?? undefined}
																	>
																		{modelLabel}
																	</div>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="py-2">
														{request.provider ? (
															<Badge
																variant="outline"
																className="inline-flex items-center gap-2 rounded-md"
															>
																<Logo
																	id={request.provider}
																	width={14}
																	height={14}
																	className="flex-shrink-0"
																/>
																<span className="truncate">{providerLabel}</span>
															</Badge>
														) : (
															<Badge variant="outline" className="rounded-md">-</Badge>
														)}
													</TableCell>
													<TableCell className="py-2 text-right font-mono text-xs">
														{tokens.input != null
															? formatUsageNumber(tokens.input)
															: "-"}
													</TableCell>
													<TableCell className="py-2 text-right font-mono text-xs">
														{tokens.output != null
															? formatUsageNumber(tokens.output)
															: "-"}
													</TableCell>
													<TableCell className="py-2 text-right font-mono text-xs">
														{formatMoneyFromNanos(request.cost_nanos)}
													</TableCell>
													<TableCell className="py-2">
														<div className="space-y-1">
															<RequestStatusBadge
																success={request.success}
																statusCode={request.status_code}
															/>
															{errorSummary ? (
																<div className="max-w-[220px] text-xs text-rose-700 line-clamp-2">
																	{errorSummary}
																</div>
															) : null}
														</div>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
										</Table>
									</ScrollArea>
								)}
							</DetailSection>
						</div>
					</div>
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>

			<RequestDetailDialog
				open={requestDetailOpen}
				presentation="sheet"
				onOpenChange={(nextOpen) => {
					setRequestDetailOpen(nextOpen);
					if (!nextOpen) {
						setSelectedRequest(null);
					}
				}}
				request={selectedRequest}
				appName={selectedRequestAppName}
				modelMetadata={modelMetadata}
				providerName={
					selectedRequest?.provider
						? providerNames.get(selectedRequest.provider) ?? selectedRequest.provider
						: null
				}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
			/>
		</>
	);
}

export default function SessionsPanel({
	initialSessions,
	initialAppMetadata,
	initialModelMetadata,
	initialProviderNames,
	initialProviderMetadata,
	timeRange,
	emptyMessage = "No sessions found in this workspace yet.",
	refreshLimit = 100,
	showRefreshButton = true,
	appFilter = null,
	modelFilter = null,
	providerFilter = null,
	sessionFilter = null,
}: {
	initialSessions: SessionRollupRow[];
	initialAppMetadata: Map<string, AppMetadata>;
	initialModelMetadata: ModelMetadataMap;
	initialProviderNames: Map<string, string>;
	initialProviderMetadata: Map<string, ProviderMetadataEntry>;
	timeRange: { from: string; to: string };
	emptyMessage?: string;
	refreshLimit?: number;
	showRefreshButton?: boolean;
	appFilter?: string | null;
	modelFilter?: string | null;
	providerFilter?: string | null;
	sessionFilter?: string | null;
}) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const [sessions, setSessions] = React.useState(initialSessions);
	const [appMetadata, setAppMetadata] = React.useState(
		() => new Map(initialAppMetadata),
	);
	const [modelMetadata, setModelMetadata] = React.useState<ModelMetadataMap>(
		() => new Map(initialModelMetadata),
	);
	const [providerNames, setProviderNames] = React.useState(
		() => new Map(initialProviderNames),
	);
	const [providerMetadata, setProviderMetadata] = React.useState(
		() => new Map(initialProviderMetadata),
	);
	const [selectedSession, setSelectedSession] =
		React.useState<SessionRollupRow | null>(null);
	const [selectedRequests, setSelectedRequests] = React.useState<SessionRequestRow[]>([]);
	const [open, setOpen] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isLoadingDetail, startLoadingDetail] = React.useTransition();
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);
	const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
	const detailCacheRef = React.useRef(new Map<string, SessionRequestRow[]>());

	React.useEffect(() => {
		setSessions(initialSessions);
	}, [initialSessions]);

	React.useEffect(() => {
		setAppMetadata(new Map(initialAppMetadata));
	}, [initialAppMetadata]);

	React.useEffect(() => {
		setModelMetadata(new Map(initialModelMetadata));
	}, [initialModelMetadata]);

	React.useEffect(() => {
		setProviderNames(new Map(initialProviderNames));
	}, [initialProviderNames]);

	React.useEffect(() => {
		setProviderMetadata(new Map(initialProviderMetadata));
	}, [initialProviderMetadata]);

	React.useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	const copySessionId = React.useCallback((sessionId: string) => {
		void navigator.clipboard.writeText(sessionId);
		setCopiedSessionId(sessionId);
		window.setTimeout(() => {
			setCopiedSessionId((current) => (current === sessionId ? null : current));
		}, 1500);
	}, []);

	const refresh = React.useCallback(() => {
		return (async () => {
			setIsRefreshing(true);
			try {
				const nextSessions = await fetchSessionRollups({
					timeRange,
					limit: refreshLimit,
					appId: appFilter,
					modelId: modelFilter,
					provider: providerFilter,
					sessionId: sessionFilter,
				});
				setSessions(nextSessions);

				const missingAppIds = collectSessionAppIds(nextSessions).filter(
					(appId) => !appMetadata.has(appId),
				);
				const missingModelIds = collectSessionModelIds(nextSessions).filter(
					(modelId) => !modelMetadata.has(modelId),
				);
				const missingProviderIds = collectSessionProviderIds(nextSessions).filter(
					(providerId) => !providerNames.has(providerId),
				);
				const missingProviderMetadataIds = collectSessionProviderIds(nextSessions).filter(
					(providerId) => !providerMetadata.has(providerId),
				);

				const [nextAppMetadata, nextModelMetadata, nextProviderNames, nextProviderMetadata] =
					await Promise.all([
						missingAppIds.length > 0
							? fetchAppMetadata(missingAppIds)
							: Promise.resolve(new Map()),
						missingModelIds.length > 0
							? fetchModelMetadata(missingModelIds)
							: Promise.resolve(new Map()),
						missingProviderIds.length > 0
							? fetchProviderNames(missingProviderIds)
							: Promise.resolve(new Map()),
						missingProviderMetadataIds.length > 0
							? fetchProviderMetadata(missingProviderMetadataIds)
							: Promise.resolve(new Map()),
					]);

				if (nextAppMetadata.size > 0) {
					setAppMetadata((prev) => new Map([...prev, ...nextAppMetadata]));
				}
				if (nextModelMetadata.size > 0) {
					setModelMetadata((prev) => new Map([...prev, ...nextModelMetadata]));
				}
				if (nextProviderNames.size > 0) {
					setProviderNames((prev) => new Map([...prev, ...nextProviderNames]));
				}
				if (nextProviderMetadata.size > 0) {
					setProviderMetadata((prev) => new Map([...prev, ...nextProviderMetadata]));
				}
			} finally {
				setIsRefreshing(false);
			}
		})();
	}, [
		appFilter,
		appMetadata,
		modelFilter,
		modelMetadata,
		providerFilter,
		providerMetadata,
		providerNames,
		refreshLimit,
		sessionFilter,
		timeRange,
	]);

	React.useEffect(() => registerUsageViewRefresher("sessions", refresh), [refresh]);

	const openDetail = React.useCallback(
		(session: SessionRollupRow) => {
			setSelectedSession(session);
			setOpen(true);
			const cacheKey = `${session.session_id}:${timeRange.from}:${timeRange.to}`;
			const cached = detailCacheRef.current.get(cacheKey);
			if (cached) {
				setSelectedRequests(cached);
				return;
			}
			setSelectedRequests([]);
			startLoadingDetail(async () => {
				const requests = await fetchSessionRequests({
					sessionId: session.session_id,
					timeRange,
				});
				detailCacheRef.current.set(cacheKey, requests);
				setSelectedRequests(requests);

				const requestAppIds = Array.from(
					new Set(
						requests
							.map((request) => request.app_id)
							.filter(
								(appId): appId is string =>
									typeof appId === "string" && appId.trim().length > 0,
							),
					),
				);
				const requestModelIds = Array.from(
					new Set(
						requests
							.map((request) => request.model_id)
							.filter(
								(modelId): modelId is string =>
									typeof modelId === "string" && modelId.trim().length > 0,
							),
					),
				);
				const requestProviderIds = Array.from(
					new Set(
						requests
							.map((request) => request.provider)
							.filter(
								(providerId): providerId is string =>
									typeof providerId === "string" && providerId.trim().length > 0,
							),
					),
				);

				const [nextAppMetadata, nextModelMetadata, nextProviderNames, nextProviderMetadata] =
					await Promise.all([
						fetchAppMetadata(
							requestAppIds.filter((appId) => !appMetadata.has(appId)),
						),
						fetchModelMetadata(
							requestModelIds.filter((modelId) => !modelMetadata.has(modelId)),
						),
						fetchProviderNames(
							requestProviderIds.filter(
								(providerId) => !providerNames.has(providerId),
							),
						),
						fetchProviderMetadata(
							requestProviderIds.filter(
								(providerId) => !providerMetadata.has(providerId),
							),
						),
					]);

				setAppMetadata((prev) => new Map([...prev, ...nextAppMetadata]));
				setModelMetadata((prev) => new Map([...prev, ...nextModelMetadata]));
				setProviderNames((prev) => new Map([...prev, ...nextProviderNames]));
				setProviderMetadata((prev) => new Map([...prev, ...nextProviderMetadata]));
			});
		},
		[appMetadata, modelMetadata, providerMetadata, providerNames, timeRange],
	);

	const table = sessions.length === 0 ? (
		<div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
			{emptyMessage}
		</div>
	) : (
		<>
			<div className="space-y-3 md:hidden">
				{sessions.map((session) => {
					const modelCounts =
						session.model_counts ??
						(session.model_ids ?? []).map((modelId) => ({
							model_id: modelId,
							request_count: 0,
						}));

					return (
						<div
							key={`mobile-${session.session_id}`}
							role="button"
							tabIndex={0}
							className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
							onClick={() => openDetail(session)}
							onKeyDown={(event) => {
								if (event.target !== event.currentTarget) return;
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									openDetail(session);
								}
							}}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 space-y-1">
									<div className="text-sm font-medium text-foreground">
										{formatWordyRange(session.first_request_at, session.last_request_at)}
									</div>
									<div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
										<span title={session.session_id}>
											{shortenIdentifier(session.session_id)}
										</span>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-5 w-5 p-0"
											onClick={(event) => {
												stopRowClick(event);
												copySessionId(session.session_id);
											}}
											title="Copy session ID"
											aria-label="Copy session ID"
										>
											{copiedSessionId === session.session_id ? (
												<Check className="h-3 w-3" />
											) : (
												<Copy className="h-3 w-3" />
											)}
										</Button>
									</div>
								</div>
								<div className="shrink-0 text-right">
									<div className="font-mono text-xs text-muted-foreground">
										{session.request_count.toLocaleString()} reqs
									</div>
									<div className="font-mono text-sm text-foreground">
										{formatMoneyFromNanos(session.total_cost_nanos)}
									</div>
								</div>
							</div>
							<div className="mt-3">
								<SessionModelsCell
									modelCounts={modelCounts}
									modelMetadata={modelMetadata}
									maxVisible={2}
								/>
							</div>
						</div>
					);
				})}
			</div>

			<div className="hidden overflow-hidden rounded-lg border md:block">
				<ScrollArea
					className="w-full"
					scrollBarOrientation="horizontal"
					keepScrollbarMounted
					viewportClassName="w-full pb-2"
				>
				<Table wrapInContainer={false} className="min-w-[720px] text-xs">
					<TableHeader>
						<TableRow className="h-9">
							<TableHead>
								Period
							</TableHead>
							<TableHead>
								Session ID
							</TableHead>
							<TableHead>
								Models
							</TableHead>
							<TableHead className="text-right">
								Reqs
							</TableHead>
							<TableHead className="text-right">
								Cost
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sessions.map((session) => {
							const modelCounts =
								session.model_counts ??
								(session.model_ids ?? []).map((modelId) => ({
									model_id: modelId,
									request_count: 0,
								}));

							return (
								<TableRow
									key={session.session_id}
									className="h-12 cursor-pointer hover:bg-muted/40"
									onClick={() => openDetail(session)}
								>
									<TableCell className="py-2">
										<PeriodHover
											start={session.first_request_at}
											end={session.last_request_at}
											userTimeZone={userTimeZone}
											relativeNowMs={relativeNowMs}
											triggerClassName="text-xs font-medium"
										/>
									</TableCell>
									<TableCell className="py-2 font-mono text-xs">
										<div className="flex items-center gap-1.5">
											<span title={session.session_id}>
												{shortenIdentifier(session.session_id)}
											</span>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-6 w-6 p-0"
												onClick={(event) => {
													stopRowClick(event);
													copySessionId(session.session_id);
												}}
												title="Copy session ID"
												aria-label="Copy session ID"
											>
												{copiedSessionId === session.session_id ? (
													<Check className="h-3.5 w-3.5" />
												) : (
													<Copy className="h-3.5 w-3.5" />
												)}
											</Button>
										</div>
									</TableCell>
									<TableCell className="py-2">
										<SessionModelsCell
											modelCounts={modelCounts}
											modelMetadata={modelMetadata}
										/>
									</TableCell>
									<TableCell className="py-2 text-right font-mono text-xs">
										{session.request_count.toLocaleString()}
									</TableCell>
									<TableCell className="py-2 text-right font-mono text-xs">
										{formatMoneyFromNanos(session.total_cost_nanos)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
				</ScrollArea>
			</div>
		</>
	);

	return (
		<>
			<div className="space-y-3">
				{showRefreshButton ? (
					<div className="flex items-center justify-end">
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={refresh}
							disabled={isRefreshing}
							aria-label="Refresh sessions"
						>
							<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
						</Button>
					</div>
				) : null}
				{table}
			</div>

			<SessionDetailSheet
				session={selectedSession}
				requests={selectedRequests}
				appMetadata={appMetadata}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				loading={isLoadingDetail}
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) {
						setSelectedSession(null);
						setSelectedRequests([]);
					}
				}}
			/>

			{isLoadingDetail ? (
				<div className="sr-only">Loading session details...</div>
			) : null}
		</>
	);
}
