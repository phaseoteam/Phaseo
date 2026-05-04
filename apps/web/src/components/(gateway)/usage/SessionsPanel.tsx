"use client";

import * as React from "react";
import Link from "next/link";
import {
	fetchAppMetadata,
	fetchModelMetadata,
	fetchProviderNames,
	fetchSessionRequests,
	type AppMetadata,
	fetchSessionRollups,
	type SessionRequestRow,
	type SessionRollupRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { Logo } from "@/components/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import {
	AppWindow,
	Check,
	Clock3,
	Coins,
	Copy,
	Layers3,
	RefreshCw,
} from "lucide-react";
import {
	formatDateTime,
	formatWordyDateTime,
	formatWordyRange,
	shortenIdentifier,
} from "@/lib/gateway/usage/timeFormatting";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import { extractUsageMeters, formatUsageNumber } from "./usageMeters";
import {
	DetailKeyValueGrid,
	DetailMetricTile,
	DetailSection,
} from "./DetailDialogPrimitives";

function formatMoneyFromNanos(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${(value / 1e9).toFixed(5)}`;
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

function getUsageTokenCounts(usage: any): {
	input: number | null;
	output: number | null;
} {
	const meters = extractUsageMeters(usage);
	const input = meters.find((meter) => meter.key === "input_text_tokens")?.value ?? null;
	const output =
		meters.find((meter) => meter.key === "output_text_tokens")?.value ?? null;
	return { input, output };
}

function buildAppLabel(app: AppMetadata | null | undefined, fallbackId?: string | null): string {
	if (app?.title?.trim()) return app.title.trim();
	return fallbackId?.trim() || "Unknown app";
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
	event.stopPropagation();
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
		return <Badge variant="outline">-</Badge>;
	}

	const appLabel = buildAppLabel(app, appId);

	return (
		<Link
			href={`/apps/${encodeURIComponent(appId)}`}
			className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
		>
			<Badge
				variant="outline"
				className={cn(
					"hover:bg-muted cursor-pointer inline-flex items-center gap-2",
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
			className={
				success
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: "border-red-200 bg-red-50 text-red-700"
			}
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
				const modelHref = getModelDetailsHref(modelId);
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
								className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
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
							className="cursor-help rounded-md underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
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
									const modelHref = getModelDetailsHref(modelId);
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
													className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
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

function SessionDetailDialog({
	session,
	requests,
	appMetadata,
	modelMetadata,
	providerNames,
	open,
	onOpenChange,
}: {
	session: SessionRollupRow | null;
	requests: SessionRequestRow[];
	appMetadata: Map<string, AppMetadata>;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);

	React.useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	if (!session) return null;

	const appCounts = session.app_counts ?? [];
	const modelCounts =
		session.model_counts ??
		(session.model_ids ?? []).map((modelId) => ({ model_id: modelId, request_count: 0 }));
	const subtitle = [
		formatWordyRange(session.first_request_at, session.last_request_at),
		`${session.request_count.toLocaleString()} reqs`,
		`${appCounts.length} apps`,
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
		{
			label: "Total requests",
			value: session.request_count.toLocaleString(),
		},
		{
			label: "Total cost",
			value: formatMoneyFromNanos(session.total_cost_nanos),
		},
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-7xl overflow-hidden p-0">
				<DialogHeader className="sr-only">
					<DialogTitle>Session details</DialogTitle>
				</DialogHeader>

				<div>
					<div className="px-5 py-4 sm:px-6 sm:py-5">
						<div className="pr-10">
							<DialogTitle className="min-w-0 truncate text-lg font-semibold">
								Session {shortenIdentifier(session.session_id, 6)}
							</DialogTitle>
							<div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
						</div>
					</div>
					<div className="border-t" />

					<div className="max-h-[calc(90vh-110px)] space-y-6 overflow-y-auto p-5 sm:p-6">
						<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
							<DetailMetricTile
								icon={Coins}
								label="Total cost"
								value={<span className="font-mono">{formatMoneyFromNanos(session.total_cost_nanos)}</span>}
								tone="amber"
								compact
							/>
							<DetailMetricTile
								icon={Layers3}
								label="Total requests"
								value={session.request_count.toLocaleString()}
								tone="sky"
								compact
							/>
							<DetailMetricTile
								icon={AppWindow}
								label="Apps"
								value={appCounts.length}
								tone="violet"
								compact
							/>
							<DetailMetricTile
								icon={Layers3}
								label="Models"
								value={modelCounts.length}
								tone="slate"
								compact
							/>
							<DetailMetricTile
								icon={Clock3}
								label="First request"
								value={formatWordyDateTime(session.first_request_at, { includeTime: true })}
								tone="slate"
								compact
							/>
							<DetailMetricTile
								icon={Clock3}
								label="Last request"
								value={formatWordyDateTime(session.last_request_at, { includeTime: true })}
								tone="slate"
								compact
							/>
						</div>

						<DetailSection title="Session details" className="border-none bg-transparent p-0">
							<DetailKeyValueGrid columns={2} items={sessionDetailItems} />
						</DetailSection>

						<DetailSection title="Apps in session">
							<div className="flex flex-wrap gap-1.5">
								{appCounts.length > 0 ? (
									appCounts.map((appCount) => (
										<AppBadge
											key={appCount.app_id}
											appId={appCount.app_id}
											app={appMetadata.get(appCount.app_id)}
											compact
										/>
									))
								) : (
									<div className="text-sm text-muted-foreground">
										No app metadata recorded.
									</div>
								)}
							</div>
						</DetailSection>

						<DetailSection title="Models in session">
							<SessionModelsCell
								modelCounts={modelCounts}
								modelMetadata={modelMetadata}
								maxVisible={6}
							/>
						</DetailSection>

						<DetailSection title="Request timeline">
							{requests.length === 0 ? (
								<div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
									No requests found for this session in the selected period.
								</div>
							) : (
								<div className="overflow-x-auto rounded-lg border">
									<Table className="text-xs">
									<TableHeader>
										<TableRow className="h-9">
											<TableHead>Time</TableHead>
											<TableHead>App</TableHead>
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
											const modelHref = getModelDetailsHref(request.model_id);
											const modelLogoId = getModelLogoId(
												request.model_id,
												modelMetadata,
											);
											const providerLabel = request.provider
												? providerNames.get(request.provider) ?? request.provider
												: null;
											const appInfo = request.app_id
												? appMetadata.get(request.app_id)
												: null;
											const appLabel = request.app_id
												? buildAppLabel(appInfo, request.app_title ?? request.app_id)
												: request.app_title ?? "-";
											const tokens = getUsageTokenCounts(request.usage);

											return (
												<TableRow
													key={`${request.request_id}-${request.created_at}-${index}`}
													className="h-12"
												>
													<TableCell className="py-2 font-mono text-xs">
														<TimeHover
															value={request.created_at}
															userTimeZone={userTimeZone}
															relativeNowMs={relativeNowMs}
														/>
													</TableCell>
													<TableCell className="py-2">
														{request.app_id ? (
															<AppBadge
																appId={request.app_id}
																app={appInfo ?? {
																	title: appLabel,
																	imageUrl: request.app_image_url ?? null,
																}}
															/>
														) : (
															appLabel
														)}
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
																		className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
																		title={request.model_id ?? undefined}
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
																<div className="truncate text-[11px] text-muted-foreground">
																	{request.endpoint ?? "-"}
																</div>
															</div>
														</div>
													</TableCell>
													<TableCell className="py-2">
														{request.provider ? (
															<Badge
																variant="outline"
																className="inline-flex items-center gap-2"
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
															<Badge variant="outline">-</Badge>
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
														<RequestStatusBadge
															success={request.success}
															statusCode={request.status_code}
														/>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
									</Table>
								</div>
							)}
						</DetailSection>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function SessionsPanel({
	initialSessions,
	initialAppMetadata,
	initialModelMetadata,
	initialProviderNames,
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
	const [selectedSession, setSelectedSession] =
		React.useState<SessionRollupRow | null>(null);
	const [selectedRequests, setSelectedRequests] = React.useState<SessionRequestRow[]>([]);
	const [open, setOpen] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isLoadingDetail, startLoadingDetail] = React.useTransition();
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);
	const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);

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

			const appIds = Array.from(
				new Set(nextSessions.flatMap((session) => session.app_ids ?? []).filter(Boolean)),
			);
			const modelIds = Array.from(
				new Set(nextSessions.flatMap((session) => session.model_ids ?? []).filter(Boolean)),
			);
			const providerIds = Array.from(
				new Set(
					nextSessions.flatMap((session) => session.provider_ids ?? []).filter(Boolean),
				),
			);

			const [nextAppMetadata, nextModelMetadata, nextProviderNames] =
				await Promise.all([
					fetchAppMetadata(appIds),
					fetchModelMetadata(modelIds),
					fetchProviderNames(providerIds),
				]);

			setAppMetadata(nextAppMetadata);
			setModelMetadata(nextModelMetadata);
			setProviderNames(nextProviderNames);
			} finally {
				setIsRefreshing(false);
			}
		})();
	}, [appFilter, modelFilter, providerFilter, refreshLimit, sessionFilter, timeRange]);

	React.useEffect(() => registerUsageViewRefresher("sessions", refresh), [refresh]);

	const openDetail = React.useCallback(
		(session: SessionRollupRow) => {
			setSelectedSession(session);
			setOpen(true);
			startLoadingDetail(async () => {
				const requests = await fetchSessionRequests({
					sessionId: session.session_id,
					timeRange,
				});
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

				const [nextAppMetadata, nextModelMetadata, nextProviderNames] =
					await Promise.all([
						fetchAppMetadata(requestAppIds),
						fetchModelMetadata(requestModelIds),
						fetchProviderNames(requestProviderIds),
					]);

				setAppMetadata((prev) => new Map([...prev, ...nextAppMetadata]));
				setModelMetadata((prev) => new Map([...prev, ...nextModelMetadata]));
				setProviderNames((prev) => new Map([...prev, ...nextProviderNames]));
			});
		},
		[timeRange],
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
						<button
							key={`mobile-${session.session_id}`}
							type="button"
							className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
							onClick={() => openDetail(session)}
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
						</button>
					);
				})}
			</div>

			<div className="hidden overflow-x-auto rounded-lg border md:block">
				<Table className="text-xs">
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

			<SessionDetailDialog
				session={selectedSession}
				requests={selectedRequests}
				appMetadata={appMetadata}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
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
