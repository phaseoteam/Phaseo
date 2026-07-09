"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Info, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const NANOS_PER_USD = 1_000_000_000;

function formatDateTime(value?: string | null) {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return new Intl.DateTimeFormat("en-GB", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatCount(value: unknown) {
	const count = Number(value ?? 0);
	if (!Number.isFinite(count)) return "0";
	return new Intl.NumberFormat("en-US").format(count);
}

function formatUsdFromNanos(value: unknown) {
	const nanos = Number(value ?? 0);
	const usd = Number.isFinite(nanos) ? nanos / NANOS_PER_USD : 0;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: usd < 10 ? 2 : 0,
	}).format(usd);
}

function formatKeyReference(prefix?: string | null) {
	const ref = typeof prefix === "string" ? prefix.trim() : "";
	return ref ? `aistats_v1_sk_...${ref}` : "aistats_v1_sk_...";
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
}: {
	label: string;
	value: React.ReactNode;
	mono?: boolean;
}) {
	return (
		<div className="flex items-start justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
			<div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
			<div className={`max-w-[65%] text-right text-sm ${mono ? "font-mono break-all" : ""}`}>{value}</div>
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
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const scopes = useMemo(() => normalizeScopes(k?.scopes), [k?.scopes]);
	const activityHref = `/settings/usage?group=key&key=${encodeURIComponent(String(k?.id ?? ""))}`;
	const logsHref = `/settings/usage/logs?key=${encodeURIComponent(String(k?.id ?? ""))}`;
	const stateLabel = keyStateLabel(k);
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

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{k?.name ?? "API Key"}</DialogTitle>
						<DialogDescription>
							Detailed usage, spend, metadata, and guardrail coverage for this key.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-2">
						<div className="grid gap-3 md:grid-cols-4">
							<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
								<div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
								<div className="mt-2 text-lg font-semibold">{stateLabel}</div>
							</div>
							<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
								<div className="text-xs uppercase tracking-wide text-muted-foreground">Requests Today</div>
								<div className="mt-2 text-lg font-semibold">{formatCount(k?.current_usage_daily)}</div>
							</div>
							<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
								<div className="text-xs uppercase tracking-wide text-muted-foreground">Spend Today</div>
								<div className="mt-2 text-lg font-semibold">{formatUsdFromNanos(k?.current_usage_daily_cost_nanos)}</div>
							</div>
							<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
								<div className="text-xs uppercase tracking-wide text-muted-foreground">Guardrails</div>
								<div className="mt-2 text-lg font-semibold">{guardrails.length}</div>
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<section className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-medium">
									<FileText className="h-4 w-4" />
									Metadata
								</div>
								<div className="rounded-lg border border-border/60 p-3">
									<DetailRow label="Key ID" value={String(k?.id ?? "Unknown")} mono />
									<DetailRow label="Key Ref" value={formatKeyReference(k?.prefix)} mono />
									<DetailRow label="Created" value={formatDateTime(k?.created_at)} />
									<DetailRow label="Updated" value={formatDateTime(k?.updated_at)} />
									<DetailRow label="Last used" value={formatDateTime(k?.last_used_at)} />
									<DetailRow label="Expires" value={k?.expires_at ? formatDateTime(k.expires_at) : "No expiry"} />
								</div>
							</section>

							<section className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-medium">
									<Shield className="h-4 w-4" />
									Limits
								</div>
								<div className="rounded-lg border border-border/60 p-3">
									<DetailRow label="Daily requests" value={limitText(k?.daily_limit_requests, formatCount)} />
									<DetailRow label="Weekly requests" value={limitText(k?.weekly_limit_requests, formatCount)} />
									<DetailRow label="Monthly requests" value={limitText(k?.monthly_limit_requests, formatCount)} />
									<DetailRow label="Daily spend" value={limitText(k?.daily_limit_cost_nanos, formatUsdFromNanos)} />
									<DetailRow label="Weekly spend" value={limitText(k?.weekly_limit_cost_nanos, formatUsdFromNanos)} />
									<DetailRow label="Monthly spend" value={limitText(k?.monthly_limit_cost_nanos, formatUsdFromNanos)} />
								</div>
							</section>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<section className="space-y-2">
								<div className="text-sm font-medium">Scopes</div>
								<div className="rounded-lg border border-border/60 p-3">
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

							<section className="space-y-2">
								<div className="text-sm font-medium">Applied guardrails</div>
								<div className="rounded-lg border border-border/60 p-3">
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

						<section className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<div className="text-sm font-medium">Guardrail activity</div>
								<div className="text-xs text-muted-foreground">
									{guardrailEnforcementSummary?.windowLabel ?? "Recent window"}
								</div>
							</div>
							<div className="rounded-lg border border-border/60 p-3">
								{guardrailEnforcementSummary && guardrailSignalTotal > 0 ? (
									<div className="space-y-4">
										<div className="grid gap-3 sm:grid-cols-4">
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs uppercase tracking-wide text-muted-foreground">
													Blocked
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.blocked)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs uppercase tracking-wide text-muted-foreground">
													Redacted
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.redacted)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs uppercase tracking-wide text-muted-foreground">
													Flagged
												</div>
												<div className="mt-2 text-lg font-semibold">
													{formatCount(guardrailEnforcementSummary.flagged)}
												</div>
											</div>
											<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
												<div className="text-xs uppercase tracking-wide text-muted-foreground">
													Last triggered
												</div>
												<div className="mt-2 text-sm font-semibold">
													{formatDateTime(
														guardrailEnforcementSummary.lastTriggeredAt,
													)}
												</div>
											</div>
										</div>

										<div className="space-y-2">
											<div className="text-xs uppercase tracking-wide text-muted-foreground">
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
																	×{formatCount(guardrail?.count)}
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

					<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
						<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
						<DialogClose asChild>
							<Button variant="ghost">Close</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
