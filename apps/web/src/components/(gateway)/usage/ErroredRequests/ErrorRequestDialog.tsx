"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import {
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Clock,
	Coins,
	Layers,
	Cpu,
	Network,
	Hash,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatRoomError } from "@/lib/chat/formatRoomError";
import { buildRoutingExplanation } from "@/lib/gateway/usage/routingExplanation";

export type ErrorDialogRow = {
	request_id?: string | null;
	created_at: string;
	provider?: string | null;
	model_id?: string | null;
	status_code?: number | null;
	error_code?: string | null;
	error_message?: string | null;
	error_payload?: Record<string, unknown> | null;
	usage?: any;
	cost_nanos?: number | null;
};

function niceDate(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function getTokens(u: any) {
	// Sum all token counters except the aggregate total_tokens
	const sumAll = (usage: any): number => {
		if (Array.isArray(usage))
			return usage.reduce((s, x) => s + sumAll(x), 0);
		if (!usage || typeof usage !== "object") return 0;
		return Object.entries(usage)
			.filter(
				([k]) =>
					k.toLowerCase().includes("token") &&
					k.toLowerCase() !== "total_tokens"
			)
			.reduce((s, [, v]) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? s + n : s;
			}, 0);
	};
	return sumAll(u);
}

function formatUSDFromNanos(n?: number | null, dp = 5) {
	const dollars = Number(n ?? 0) / 1e9;
	return dollars.toFixed(dp);
}

function getFriendlyErrorCode(code: string | null | undefined): string {
	if (!code) return "-";
	const cleanCode = code.replace(/^(user:|upstream:)/i, "");
	const mapping: Record<string, string> = {
		unauthorised: "Unauthorized",
		invalid_json: "Invalid JSON",
		validation_error: "Validation error",
		model_required: "Model required",
		upstream_error: "Upstream error",
		key_limit_exceeded: "Rate limited",
		insufficient_funds: "Insufficient funds",
		unsupported_model_or_endpoint: "Unsupported model",
		pricing_not_configured: "Pricing not configured",
		authentication_error: "Auth error",
		authorization_error: "Permission denied",
		not_found_error: "Not found",
		rate_limit_error: "Rate limited",
		provider_error: "Provider error",
		server_error: "Server error",
		bad_gateway: "Bad gateway",
		service_unavailable: "Service unavailable",
		gateway_timeout: "Gateway timeout",
		payment_error: "Payment error",
		permission_error: "Permission error",
		bad_request: "Bad request",
	};
	return mapping[cleanCode] || cleanCode.replace(/_/g, " ");
}

function formatDiagnosticLabel(value: string | null | undefined): string {
	if (!value) return "-";
	return value
		.split("_")
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}

function statusBadge(status?: number | null) {
	if (status == null) {
		return (
			<Badge className="gap-1 bg-amber-600 hover:bg-amber-600 text-white">
				<AlertTriangle className="h-3.5 w-3.5" />
				Unknown
			</Badge>
		);
	}
	const ok = status < 400;
	if (ok) {
		return (
			<Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
				<CheckCircle2 className="h-3.5 w-3.5" />
				{status}
			</Badge>
		);
	}
	return (
		<Badge className="gap-1 bg-rose-600 hover:bg-rose-600 text-white">
			<XCircle className="h-3.5 w-3.5" />
			{status}
		</Badge>
	);
}

function formatHeaderTime(iso?: string | null) {
	if (!iso) return "-";
	try {
		const d = new Date(iso);
		const now = new Date();
		const pad = (n: number) => n.toString().padStart(2, "0");
		const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
		if (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		) {
			return hhmm;
		}
		if (d.getFullYear() === now.getFullYear()) {
			return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm}`;
		}
		return `${pad(d.getDate())}/${pad(
			d.getMonth() + 1
		)}/${d.getFullYear()} ${hhmm}`;
	} catch {
		return iso;
	}
}

function MetricTile({
	icon,
	label,
	value,
	sub,
	tone = "slate",
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: "slate" | "emerald" | "violet" | "sky" | "rose" | "amber";
}) {
	const toneMap: Record<string, string> = {
		slate: "bg-slate-600/10 text-slate-700 dark:text-slate-200",
		emerald: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
		violet: "bg-violet-600/10 text-violet-700 dark:text-violet-300",
		sky: "bg-sky-600/10 text-sky-700 dark:text-sky-300",
		rose: "bg-rose-600/10 text-rose-700 dark:text-rose-300",
		amber: "bg-amber-600/10 text-amber-700 dark:text-amber-300",
	};
	return (
		<div className="rounded-2xl border bg-card p-4">
			<div className="flex items-center justify-between">
				<div
					className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap[tone]}`}
				>
					{icon}
				</div>
			</div>
			<div className="mt-3 text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tracking-tight">
				{value}
			</div>
			{sub ? (
				<div className="mt-1 text-xs text-muted-foreground">{sub}</div>
			) : null}
		</div>
	);
}

export default function ErrorRequestDialog({
	row,
	open,
	onOpenChange,
}: {
	row: ErrorDialogRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const selected = row;
	const formattedGatewayError = React.useMemo(() => {
		const raw = selected?.error_payload
			? JSON.stringify(selected.error_payload)
			: selected?.error_message?.trim();
		if (!raw) return null;
		return formatRoomError(raw);
	}, [selected?.error_message, selected?.error_payload]);
	const formattedFailureSample = formattedGatewayError?.failureSample ?? [];
	const providerCandidateDiagnostics =
		formattedGatewayError?.providerCandidateDiagnostics;
	const providerEnablement = formattedGatewayError?.providerEnablement;
	const routingDiagnostics = formattedGatewayError?.routingDiagnostics;
	const routingExplanation = buildRoutingExplanation(formattedGatewayError);
	const failedProviders = formattedGatewayError?.failedProviders ?? [];
	const failedStatuses = formattedGatewayError?.failedStatuses ?? [];
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[900px] overflow-hidden p-0">
				{/* Header similar to success dialog */}
				<div >
					<div className="px-5 py-4 sm:px-6 sm:py-5">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<div className="flex items-center gap-3">
									<div className="text-lg font-semibold font-mono break-all">
										{selected?.request_id ?? "-"}
									</div>
									{selected?.request_id ? (
										<CopyButton
											size="sm"
											content={selected.request_id}
											aria-label="Copy request id"
											className="ml-1"
										/>
									) : null}
								</div>
								<div className="mt-2 flex flex-wrap items-center gap-2">
									{statusBadge(selected?.status_code ?? null)}
									<Badge
										variant="secondary"
										className="gap-1"
									>
										<Cpu className="h-3.5 w-3.5" />
										{selected?.model_id ?? "-"}
									</Badge>
									<Badge variant="outline" className="gap-1">
										<Network className="h-3.5 w-3.5" />
										{selected?.provider ?? "-"}
									</Badge>
									<Badge variant="outline" className="gap-1">
										<Clock className="h-3.5 w-3.5" />
										{formatHeaderTime(selected?.created_at)}
									</Badge>
								</div>
							</div>
							<div />
						</div>
					</div>
				</div>

				<div className="p-5 sm:p-6">
					{/* KPI tiles */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<MetricTile
							icon={<Hash className="h-4 w-4" />}
							label="Status code"
							value={
								<span className="font-mono">
									{selected?.status_code ?? "-"}
								</span>
							}
							tone="rose"
						/>
						<MetricTile
							icon={<Layers className="h-4 w-4" />}
							label="Error code"
							value={
								<span className="font-mono wrap-break-word">
									{getFriendlyErrorCode(selected?.error_code)}
								</span>
							}
							tone="amber"
						/>
						<MetricTile
							icon={<Coins className="h-4 w-4" />}
							label="Spend (USD)"
							value={
								<span className="font-mono">
									${formatUSDFromNanos(selected?.cost_nanos)}
								</span>
							}
							tone="amber"
						/>
						<MetricTile
							icon={<Layers className="h-4 w-4" />}
							label="Tokens"
							value={
								<span className="font-mono">
									{Intl.NumberFormat().format(
										getTokens(selected?.usage)
									)}
								</span>
							}
							tone="violet"
						/>
					</div>

					<Separator className="my-5" />

					{/* Tabs (Overview, Raw) */}
					<Tabs defaultValue="overview" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="raw">Raw</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="mt-4">
							{selected?.error_message ? (
								<div className="rounded-2xl border bg-card p-4">
									<div className="mb-2 text-sm font-medium">
										{formattedGatewayError?.title?.trim()
											? formattedGatewayError.title
											: "Message"}
									</div>
									<div className="whitespace-pre-wrap wrap-break-word text-sm">
										{formattedGatewayError?.message ?? selected.error_message}
									</div>
									{formattedGatewayError?.hint ? (
										<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
											<div className="mb-1 font-medium text-amber-900">
												Hint
											</div>
											<div className="whitespace-pre-wrap wrap-break-word">
												{formattedGatewayError.hint}
											</div>
										</div>
									) : null}
									{formattedGatewayError?.generationId ? (
										<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
											<span>Generation ID:</span>
											<span className="font-mono break-all">
												{formattedGatewayError.generationId}
											</span>
											<CopyButton
												size="sm"
												content={formattedGatewayError.generationId}
												aria-label="Copy generation id"
											/>
										</div>
									) : null}
									{formattedGatewayError?.reason ||
									formattedGatewayError?.attemptCount != null ||
									failedProviders.length > 0 ||
									failedStatuses.length > 0 ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-1 font-medium text-slate-900">
												Routing failure summary
											</div>
											<div className="space-y-1 text-slate-800">
												{formattedGatewayError?.reason ? (
													<div>
														<span className="font-medium">Reason:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{formattedGatewayError.reason}
														</code>
														<span className="ml-2 text-slate-700">
															{formatDiagnosticLabel(formattedGatewayError.reason)}
														</span>
													</div>
												) : null}
												{formattedGatewayError?.attemptCount != null ? (
													<div>
														<span className="font-medium">Attempts:</span>{" "}
														{formattedGatewayError.attemptCount}
													</div>
												) : null}
												{failedProviders.length > 0 ? (
													<div>
														<span className="font-medium">Failed providers:</span>{" "}
														{failedProviders.join(", ")}
													</div>
												) : null}
												{failedStatuses.length > 0 ? (
													<div>
														<span className="font-medium">Failed statuses:</span>{" "}
														{failedStatuses.join(", ")}
													</div>
												) : null}
											</div>
										</div>
									) : null}
									{formattedGatewayError?.providerFailureCategory ||
									formattedGatewayError?.providerFailureProvider ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-1 font-medium text-slate-900">
												Provider diagnostics
											</div>
											<div className="space-y-1 text-slate-800">
												{formattedGatewayError.providerFailureCategory ? (
													<div>
														<span className="font-medium">Category:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{formattedGatewayError.providerFailureCategory}
														</code>
														<span className="ml-2 text-slate-700">
															{formatDiagnosticLabel(
																formattedGatewayError.providerFailureCategory
															)}
														</span>
													</div>
												) : null}
												{formattedGatewayError.providerFailureProvider ? (
													<div>
														<span className="font-medium">Provider:</span>{" "}
														{formattedGatewayError.providerFailureProvider}
													</div>
												) : null}
											</div>
										</div>
									) : null}
									{formattedGatewayError?.upstreamError ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-1 font-medium text-slate-900">
												Upstream error
											</div>
											<div className="space-y-1 text-slate-800">
												{formattedGatewayError.upstreamError.code ? (
													<div>
														<span className="font-medium">Code:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{formattedGatewayError.upstreamError.code}
														</code>
													</div>
												) : null}
												{formattedGatewayError.upstreamError.message ? (
													<div>
														<span className="font-medium">Message:</span>{" "}
														{formattedGatewayError.upstreamError.message}
													</div>
												) : null}
												{formattedGatewayError.upstreamError.description ? (
													<div>
														<span className="font-medium">Detail:</span>{" "}
														{formattedGatewayError.upstreamError.description}
													</div>
												) : null}
												{formattedGatewayError.upstreamError.param ? (
													<div>
														<span className="font-medium">Param:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{formattedGatewayError.upstreamError.param}
														</code>
													</div>
												) : null}
											</div>
										</div>
									) : null}
									{formattedFailureSample.length > 0 ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-2 font-medium text-slate-900">
												Failure sample
											</div>
											<div className="space-y-2">
												{formattedFailureSample.map((sample, index) => (
													<div
														key={`${sample.provider ?? "unknown"}-${sample.status ?? "na"}-${index}`}
														className="rounded-lg border border-slate-200 bg-white p-3"
													>
														<div className="flex flex-wrap items-center gap-2">
															<span className="font-medium">
																{sample.provider ?? "Unknown provider"}
															</span>
															{sample.status != null ? (
																<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
																	HTTP {sample.status}
																</code>
															) : null}
															{sample.upstreamErrorCode ? (
																<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
																	{sample.upstreamErrorCode}
																</code>
															) : null}
														</div>
														{sample.upstreamErrorMessage ? (
															<div className="mt-2">
																<span className="font-medium">Message:</span>{" "}
																{sample.upstreamErrorMessage}
															</div>
														) : null}
														{sample.upstreamErrorDescription &&
														sample.upstreamErrorDescription !==
															sample.upstreamErrorMessage ? (
															<div className="mt-1 text-slate-700">
																<span className="font-medium">Detail:</span>{" "}
																{sample.upstreamErrorDescription}
															</div>
														) : null}
													</div>
												))}
											</div>
										</div>
									) : null}
									{providerCandidateDiagnostics ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-2 font-medium text-slate-900">
												Provider candidates
											</div>
											<div className="grid gap-2 sm:grid-cols-3">
												<div>
													<div className="text-xs font-medium uppercase tracking-wide text-slate-700">
														Known
													</div>
													<div className="font-mono text-sm">
														{providerCandidateDiagnostics.totalProviders ?? "-"}
													</div>
												</div>
												<div>
													<div className="text-xs font-medium uppercase tracking-wide text-slate-700">
														Supports endpoint
													</div>
													<div className="font-mono text-sm">
														{providerCandidateDiagnostics.supportsEndpointCount ?? "-"}
													</div>
												</div>
												<div>
													<div className="text-xs font-medium uppercase tracking-wide text-slate-700">
														Candidates
													</div>
													<div className="font-mono text-sm">
														{providerCandidateDiagnostics.candidateCount ?? "-"}
													</div>
												</div>
											</div>
											{providerCandidateDiagnostics.droppedUnsupportedEndpoint.length >
											0 ? (
												<div className="mt-3">
													<div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-700">
														Unsupported endpoints
													</div>
													<div className="flex flex-wrap gap-2">
														{providerCandidateDiagnostics.droppedUnsupportedEndpoint.map(
															(endpoint) => (
																<code
																	key={endpoint}
																	className="rounded bg-slate-200 px-1.5 py-0.5 text-xs"
																>
																	{endpoint}
																</code>
															)
														)}
													</div>
												</div>
											) : null}
										</div>
									) : null}
									{providerEnablement ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-2 font-medium text-slate-900">
												Provider enablement
											</div>
											{providerEnablement.capability ? (
												<div className="mb-2">
													<span className="font-medium">Capability:</span>{" "}
													<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
														{providerEnablement.capability}
													</code>
												</div>
											) : null}
											<div className="grid gap-3 sm:grid-cols-2">
												<div>
													<div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-700">
														Before
													</div>
													<div className="flex flex-wrap gap-2">
														{providerEnablement.providersBefore.length > 0 ? (
															providerEnablement.providersBefore.map((providerId) => (
																<code
																	key={providerId}
																	className="rounded bg-slate-200 px-1.5 py-0.5 text-xs"
																>
																	{providerId}
																</code>
															))
														) : (
															<span className="text-slate-700">-</span>
														)}
													</div>
												</div>
												<div>
													<div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-700">
														After
													</div>
													<div className="flex flex-wrap gap-2">
														{providerEnablement.providersAfter.length > 0 ? (
															providerEnablement.providersAfter.map((providerId) => (
																<code
																	key={providerId}
																	className="rounded bg-slate-200 px-1.5 py-0.5 text-xs"
																>
																	{providerId}
																</code>
															))
														) : (
															<span className="text-slate-700">-</span>
														)}
													</div>
												</div>
											</div>
										</div>
									) : null}
									{routingDiagnostics &&
									(routingDiagnostics.filterStages.length > 0 ||
										routingExplanation.length > 0) ? (
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
											<div className="mb-2 font-medium text-slate-900">
												Routing diagnostics
											</div>
											{routingExplanation.length > 0 ? (
												<div className="mb-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-950">
													<div className="font-medium text-sky-900">
														Routing explanation
													</div>
													{routingExplanation.map((line, index) => (
														<div key={`routing-explanation-${index}`}>
															{line}
														</div>
													))}
												</div>
											) : null}
											<div className="space-y-2">
												{routingDiagnostics.filterStages.map((stage, index) => (
													<div
														key={`${stage.stage ?? "stage"}-${index}`}
														className="rounded-lg border border-slate-200 bg-white p-3"
													>
														<div className="flex flex-wrap items-center gap-2">
															<span className="font-medium">
																{stage.stage
																	? formatDiagnosticLabel(stage.stage)
																	: `Stage ${index + 1}`}
															</span>
															{stage.beforeCount != null ? (
																<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
																	before {stage.beforeCount}
																</code>
															) : null}
															{stage.afterCount != null ? (
																<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
																	after {stage.afterCount}
																</code>
															) : null}
														</div>
													</div>
												))}
											</div>
										</div>
									) : null}
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									No error message available.
								</div>
							)}
						</TabsContent>

						<TabsContent value="raw" className="mt-4">
							<div className="rounded-2xl border bg-card">
								<div className="flex items-center justify-between px-4 py-3">
									<div className="text-sm font-medium">
										Raw payload
									</div>
									{selected ? (
										<CopyButton
											size="sm"
											variant="outline"
											content={JSON.stringify(
												selected,
												null,
												2
											)}
											aria-label="Copy raw JSON"
										/>
									) : null}
								</div>
								<Separator />
								<div className="max-h-[50vh] overflow-auto p-4">
									<pre className="whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs leading-relaxed">
										{selected
											? JSON.stringify(selected, null, 2)
											: ""}
									</pre>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>

				<DialogFooter className="mt-2"></DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
