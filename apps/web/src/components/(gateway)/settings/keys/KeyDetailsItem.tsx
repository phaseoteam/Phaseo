"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
	ArrowUpRight,
	Ban,
	CheckCircle2,
	FileText,
	Info,
	OctagonAlert,
	Pencil,
	Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { formatDateTime as formatPreciseDateTime } from "@/lib/gateway/usage/timeFormatting";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import {
	formatDisplayDateTime,
	formatDisplayNumber,
	formatDisplayTimestamp,
	type DisplayPreferences,
} from "@/lib/displayPreferences";
import EditKeyItem from "./EditKeyItem";

const NANOS_PER_USD = 1_000_000_000;

function formatDateTime(value: string | null | undefined, preferences: DisplayPreferences) {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return formatDisplayDateTime(date, preferences);
}

function formatCount(value: unknown, preferences: DisplayPreferences) {
	const count = Number(value ?? 0);
	if (!Number.isFinite(count)) return "0";
	return formatDisplayNumber(count, preferences);
}

function formatUsdFromNanos(value: unknown, preferences: DisplayPreferences) {
	const nanos = Number(value ?? 0);
	const usd = Number.isFinite(nanos) ? nanos / NANOS_PER_USD : 0;
	return formatDisplayNumber(usd, preferences, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: usd < 10 ? 2 : 0,
		notation: "standard",
	});
}

function formatKeyReference(prefix?: string | null) {
	const ref = typeof prefix === "string" ? prefix.trim() : "";
	return ref ? `phaseo_v1_sk_...${ref}` : "phaseo_v1_sk_...";
}

function KeyTimeHover({
	value,
	emptyText,
	userTimeZone,
	relativeNowMs,
}: {
	value?: string | null;
	emptyText: string;
	userTimeZone: string;
	relativeNowMs: number | null;
}) {
	const { preferences } = useDisplayPreferences();
	if (!value) return <>{emptyText}</>;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return <>{emptyText}</>;

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span className="cursor-help underline decoration-dotted underline-offset-2">
					{relativeNowMs
						? formatDisplayTimestamp(value, preferences, new Date(relativeNowMs))
						: formatDateTime(value, preferences)}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto">
				<div className="grid gap-2 text-xs">
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">{userTimeZone}</div>
						<div className="font-mono">{formatPreciseDateTime(date, userTimeZone)}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">UTC</div>
						<div className="font-mono">{formatPreciseDateTime(date, "UTC")}</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Relative</div>
						<div className="font-mono">
							{relativeNowMs ? formatRelativeToNow(date, relativeNowMs) : "-"}
						</div>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-2">
						<div className="text-muted-foreground">Timestamp</div>
						<div className="font-mono">{Math.floor(date.getTime() / 1000)}</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function normalizeScopes(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
			.filter(Boolean);
	}
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return normalizeScopes(parsed);
		} catch {
			return value
				.split(/[,\s]+/)
				.map((entry) => entry.trim())
				.filter(Boolean);
		}
	}
	return [];
}

function limitText(value: unknown, formatter: (v: unknown) => string) {
	const numeric = Number(value ?? 0);
	if (!Number.isFinite(numeric) || numeric <= 0) return "Unlimited";
	return formatter(value);
}

function keyStateLabel(key: any) {
	const expiresRaw = typeof key?.expires_at === "string" ? key.expires_at : "";
	if (expiresRaw) {
		const expiresAtMs = Date.parse(expiresRaw);
		if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
			return "Expired";
		}
	}

	const status = String(key?.status ?? "").toLowerCase();
	if (status === "paused" || status === "disabled" || status === "revoked") {
		return "Disabled";
	}

	const limits = [
		[Number(key?.current_usage_daily ?? 0) || 0, Number(key?.daily_limit_requests ?? 0) || 0],
		[Number(key?.current_usage_weekly ?? 0) || 0, Number(key?.weekly_limit_requests ?? 0) || 0],
		[Number(key?.current_usage_monthly ?? 0) || 0, Number(key?.monthly_limit_requests ?? 0) || 0],
		[Number(key?.current_usage_daily_cost_nanos ?? 0) || 0, Number(key?.daily_limit_cost_nanos ?? 0) || 0],
		[Number(key?.current_usage_weekly_cost_nanos ?? 0) || 0, Number(key?.weekly_limit_cost_nanos ?? 0) || 0],
		[Number(key?.current_usage_monthly_cost_nanos ?? 0) || 0, Number(key?.monthly_limit_cost_nanos ?? 0) || 0],
	] as const;
	if (limits.some(([used, limit]) => limit > 0 && used >= limit)) {
		return "Limits reached";
	}

	return "Active";
}

function DetailRow({
	label,
	value,
	mono = false,
	truncate = false,
}: {
	label: string;
	value: React.ReactNode;
	mono?: boolean;
	truncate?: boolean;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-start gap-4 py-2">
			<div className="text-sm text-muted-foreground">{label}</div>
			<div className={`min-w-0 text-right text-sm ${mono ? "font-mono" : ""} ${truncate ? "truncate" : mono ? "break-all" : ""}`}>{value}</div>
		</div>
	);
}

export default function KeyDetailsItem({
	k,
	trigger = true,
	open: controlledOpen,
	onOpenChange,
}: {
	k: any;
	trigger?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const { preferences } = useDisplayPreferences();
	const [internalOpen, setInternalOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const suppressInspectorDismissRef = useRef(false);
	const [relativeNowMs, setRelativeNowMs] = useState<number | null>(null);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const scopes = useMemo(() => normalizeScopes(k?.scopes), [k?.scopes]);
	const activityHref = `/settings/usage?group=key&key=${encodeURIComponent(String(k?.id ?? ""))}`;
	const logsHref = `/settings/usage/logs?key=${encodeURIComponent(String(k?.id ?? ""))}`;
	const stateLabel = keyStateLabel(k);
	const stateVisual = stateLabel === "Active"
		? { Icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" }
		: stateLabel === "Limits reached"
			? { Icon: OctagonAlert, className: "text-red-600 dark:text-red-400" }
			: stateLabel === "Expired"
				? { Icon: Ban, className: "text-amber-600 dark:text-amber-400" }
				: { Icon: Ban, className: "text-muted-foreground" };
	const StateIcon = stateVisual.Icon;
	const userTimeZone = preferences.timeZone !== "system"
		? preferences.timeZone
		: typeof Intl !== "undefined"
		? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
		: "UTC";
	useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = window.setInterval(updateNow, 60_000);
		return () => window.clearInterval(interval);
	}, []);
	const handleEditOpenChange = (next: boolean) => {
		if (next) {
			suppressInspectorDismissRef.current = true;
			setEditOpen(true);
			return;
		}
		setEditOpen(false);
		window.setTimeout(() => {
			suppressInspectorDismissRef.current = false;
		}, 150);
	};
	const guardrails = Array.isArray(k?.guardrails) ? k.guardrails : [];
	const guardrailEnforcementSummary =
		k?.guardrail_enforcement_summary &&
		typeof k.guardrail_enforcement_summary === "object" &&
		!Array.isArray(k.guardrail_enforcement_summary)
			? k.guardrail_enforcement_summary
			: null;
	const guardrailSignalTotal =
		Number(guardrailEnforcementSummary?.blocked ?? 0) +
		Number(guardrailEnforcementSummary?.redacted ?? 0) +
		Number(guardrailEnforcementSummary?.flagged ?? 0);

	return (
		<>
			{trigger ? (
				<DropdownMenuItem render={<div
						className="flex w-full items-center gap-2 text-left"
						onClick={() => {
							setTimeout(() => setOpen(true), 0);
						}} />}>

						<Info className="mr-2 h-4 w-4" />
						Details

				</DropdownMenuItem>
			) : null}

			<ProviderInspectorSheet
				open={open}
				onOpenChange={(next) => {
					if (!next && suppressInspectorDismissRef.current) return;
					setOpen(next);
				}}
			>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none">
					<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
						<div className="min-w-0 pr-8">
						<ProviderInspectorSheetTitle className="truncate text-base">{k?.name ?? "API Key"}</ProviderInspectorSheetTitle>
						<ProviderInspectorSheetDescription className="mt-1 font-mono text-[11px]">
							{formatKeyReference(k?.prefix)}
						</ProviderInspectorSheetDescription>
						</div>
						<ProviderInspectorSheetDescription className="sr-only">
							Detailed usage, spend, metadata, and guardrail coverage for this key.
						</ProviderInspectorSheetDescription>
					</ProviderInspectorSheetHeader>

					<ScrollArea
						className="min-h-0 flex-1 overscroll-contain"
						viewportClassName="pb-5 overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						scrollBarOrientation="vertical"
						keepScrollbarMounted
					>
					<div>
						<div className="grid grid-cols-2 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800 sm:grid-cols-4">
							<div className="border-r border-zinc-200/80 pr-3 dark:border-zinc-800">
								<div className="text-xs text-muted-foreground">Status</div>
								<div className="mt-2 flex items-center gap-2 text-lg font-semibold">
									<StateIcon aria-hidden="true" className={`size-4 shrink-0 ${stateVisual.className}`} />
									<span>{stateLabel}</span>
								</div>
							</div>
							<div className="px-3 sm:border-r sm:border-zinc-200/80 sm:dark:border-zinc-800">
								<div className="text-xs text-muted-foreground">Requests Today</div>
								<div className="mt-2 text-lg font-semibold">{formatCount(k?.current_usage_daily, preferences)}</div>
							</div>
							<div className="mt-4 border-r border-zinc-200/80 pr-3 dark:border-zinc-800 sm:mt-0 sm:px-3">
								<div className="text-xs text-muted-foreground">Spend Today</div>
								<div className="mt-2 text-lg font-semibold">{formatUsdFromNanos(k?.current_usage_daily_cost_nanos, preferences)}</div>
							</div>
							<div className="mt-4 pl-3 sm:mt-0">
								<div className="text-xs text-muted-foreground">Guardrails</div>
								<div className="mt-2 text-lg font-semibold">{guardrails.length}</div>
							</div>
						</div>

						<div>
							<section className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
								<div className="flex items-center gap-2 text-sm font-medium">
									<FileText className="h-4 w-4" />
									Metadata
								</div>
								<div className="mt-2">
									<DetailRow label="Key ID" value={String(k?.id ?? "Unknown")} mono truncate />
									<DetailRow label="Key Ref" value={formatKeyReference(k?.prefix)} mono />
									<DetailRow label="Created" value={<KeyTimeHover value={k?.created_at} emptyText="Never" userTimeZone={userTimeZone} relativeNowMs={relativeNowMs} />} />
									<DetailRow label="Updated" value={<KeyTimeHover value={k?.updated_at} emptyText="Never" userTimeZone={userTimeZone} relativeNowMs={relativeNowMs} />} />
									<DetailRow label="Last Used" value={<KeyTimeHover value={k?.last_used_at} emptyText="Never" userTimeZone={userTimeZone} relativeNowMs={relativeNowMs} />} />
									<DetailRow label="Expires" value={<KeyTimeHover value={k?.expires_at} emptyText="No expiry" userTimeZone={userTimeZone} relativeNowMs={relativeNowMs} />} />
								</div>
							</section>

							<section className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
								<div className="flex items-center gap-2 text-sm font-medium">
									<Shield className="h-4 w-4" />
									Limits
								</div>
								<div className="mt-2">
									<DetailRow label="Daily Requests" value={limitText(k?.daily_limit_requests, (value) => formatCount(value, preferences))} />
									<DetailRow label="Weekly Requests" value={limitText(k?.weekly_limit_requests, (value) => formatCount(value, preferences))} />
									<DetailRow label="Monthly Requests" value={limitText(k?.monthly_limit_requests, (value) => formatCount(value, preferences))} />
									<DetailRow label="Daily Spend" value={limitText(k?.daily_limit_cost_nanos, (value) => formatUsdFromNanos(value, preferences))} />
									<DetailRow label="Weekly Spend" value={limitText(k?.weekly_limit_cost_nanos, (value) => formatUsdFromNanos(value, preferences))} />
									<DetailRow label="Monthly Spend" value={limitText(k?.monthly_limit_cost_nanos, (value) => formatUsdFromNanos(value, preferences))} />
								</div>
							</section>
						</div>

						<div>
							<section className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
								<div className="text-sm font-medium">Scopes</div>
								<div className="mt-2">
									{scopes.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{scopes.map((scope) => (
												<Badge key={scope} variant="outline" className="font-mono text-[11px]">
													{scope}
												</Badge>
											))}
										</div>
									) : (
										<div className="text-sm text-muted-foreground">No explicit scopes configured.</div>
									)}
								</div>
							</section>

							<section className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
								<div className="text-sm font-medium">Applied guardrails</div>
								<div className="mt-2">
									{guardrails.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{guardrails.map((guardrail: any, index: number) => (
												<Badge
													key={guardrail?.id ?? guardrail?.name ?? `guardrail-${index}`}
													variant={guardrail?.enabled === false ? "secondary" : "outline"}
													className="text-[11px]"
												>
													{guardrail?.name ?? guardrail?.id ?? "Guardrail"}
												</Badge>
											))}
										</div>
									) : (
										<div className="text-sm text-muted-foreground">No guardrails applied.</div>
									)}
								</div>
							</section>
						</div>

						<section className="px-5 py-4">
							<div className="flex items-center justify-between gap-3">
								<div className="text-sm font-medium">Guardrail activity</div>
								<div className="text-xs text-muted-foreground">
									{guardrailEnforcementSummary?.windowLabel ?? "Recent window"}
								</div>
							</div>
							<div className="mt-2">
								{guardrailEnforcementSummary && guardrailSignalTotal > 0 ? (
									<div className="space-y-4">
										<div className="grid gap-3 sm:grid-cols-4">
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs text-muted-foreground">
													Blocked
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.blocked, preferences)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs text-muted-foreground">
													Redacted
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.redacted, preferences)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs text-muted-foreground">
													Flagged
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.flagged, preferences)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs text-muted-foreground">
													Last triggered
												</div>
												<div className="mt-2 text-sm font-semibold">
											{formatDateTime(
												guardrailEnforcementSummary.lastTriggeredAt,
												preferences,
											)}
												</div>
											</div>
										</div>

										<div className="space-y-2">
											<div className="text-xs text-muted-foreground">
												Most active guardrails
											</div>
											{Array.isArray(guardrailEnforcementSummary.topGuardrails) &&
											guardrailEnforcementSummary.topGuardrails.length > 0 ? (
												<div className="flex flex-wrap gap-2">
													{guardrailEnforcementSummary.topGuardrails.map(
														(guardrail: any, index: number) => (
															<Badge
																key={
																	guardrail?.id ??
																	guardrail?.name ??
																	`guardrail-activity-${index}`
																}
																variant="outline"
																className="text-[11px]"
															>
																{guardrail?.name ?? guardrail?.id ?? "Guardrail"}
																<span className="ml-1 text-muted-foreground">
																	×{formatCount(guardrail?.count, preferences)}
																</span>
															</Badge>
														),
													)}
												</div>
											) : (
												<div className="text-sm text-muted-foreground">
													Guardrail activity was recorded, but the source rule
													could not be resolved from current workspace mappings.
												</div>
											)}
										</div>
									</div>
								) : (
									<div className="text-sm text-muted-foreground">
										No recorded blocked, redacted, or flagged requests for
										this key in the last 30 days.
									</div>
								)}
							</div>
						</section>
					</div>
					</ScrollArea>

					<div className="flex flex-col gap-2 border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800 sm:flex-row">
						<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
								<Button type="button" onClick={() => handleEditOpenChange(true)}>
									<Pencil className="size-4" />
									Edit
								</Button>
							<Button asChild variant="outline">
								<Link href={activityHref}>
									Activity
									<ArrowUpRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link href={logsHref}>
									Logs
									<ArrowUpRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
			<EditKeyItem
				k={k}
				trigger={false}
				open={editOpen}
				onOpenChange={handleEditOpenChange}
			/>
		</>
	);
}
