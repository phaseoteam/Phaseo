"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Ban, CheckCircle2, MoreVertical, OctagonAlert } from "lucide-react";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import UsageItem from "./UsageItem";
import EditKeyItem from "./EditKeyItem";
import DeleteKeyItem from "./DeleteKeyItem";
import KeyLimitsItem from "./KeyLimitsItem";

type KeyState = "active" | "disabled" | "limited";

const NANOS_PER_USD = 1_000_000_000;

function getKeyState(k: any): KeyState {
	const status = String(k?.status ?? "").toLowerCase();
	const isDisabled = status === "paused" || status === "disabled" || status === "revoked";
	if (isDisabled) return "disabled";

	const dailyLimit = Number(k?.daily_limit_requests ?? 0) || 0;
	const currentUsage = Number(k?.current_usage_daily ?? 0) || 0;
	const hasReachedDailyLimit = dailyLimit > 0 && currentUsage >= dailyLimit;
	if (hasReachedDailyLimit) return "limited";

	return "active";
}

function stateMeta(state: KeyState) {
	switch (state) {
		case "active":
			return { label: "Active", Icon: CheckCircle2, className: "text-emerald-600" };
		case "disabled":
			return { label: "Disabled", Icon: Ban, className: "text-zinc-400" };
		case "limited":
			return { label: "Limits Reached", Icon: OctagonAlert, className: "text-red-600" };
	}
}

function formatLastUsed(v?: string | null) {
	if (!v) return "Never";
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) return "Never";
	return d.toLocaleDateString();
}

function formatExpiry(v?: string | null) {
	if (!v) return "No expiry";
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) return "No expiry";
	const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
	if (days <= 0) return "Expired";
	return `${days}d`;
}

function fmtCompactInt(v: number) {
	return new Intl.NumberFormat("en-US", { notation: "compact" }).format(v);
}

function fmtUsdFromNanos(v: number) {
	const usd = v / NANOS_PER_USD;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: usd < 10 ? 2 : 0,
	}).format(usd);
}

type LimitPeriod = "D" | "W" | "M";

function pickPrimaryRequestLimit(k: any): { period: LimitPeriod; value: number } | null {
	const d = Number(k?.daily_limit_requests ?? 0) || 0;
	const w = Number(k?.weekly_limit_requests ?? 0) || 0;
	const m = Number(k?.monthly_limit_requests ?? 0) || 0;
	if (d > 0) return { period: "D", value: d };
	if (w > 0) return { period: "W", value: w };
	if (m > 0) return { period: "M", value: m };
	return null;
}

function pickPrimarySpendLimit(k: any): { period: LimitPeriod; nanos: number } | null {
	// cost nanos fields are stored as 0 for "unlimited".
	const d = Number(k?.daily_limit_cost_nanos ?? 0) || 0;
	const w = Number(k?.weekly_limit_cost_nanos ?? 0) || 0;
	const m = Number(k?.monthly_limit_cost_nanos ?? 0) || 0;
	if (d > 0) return { period: "D", nanos: d };
	if (w > 0) return { period: "W", nanos: w };
	if (m > 0) return { period: "M", nanos: m };
	return null;
}

function Silo({
	label,
	pct,
	tone,
}: {
	label: string;
	pct: number | null;
	tone: "ok" | "warn" | "danger" | "muted";
}) {
	const segments = 10;
	const clamped = pct === null ? null : Math.max(0, Math.min(100, pct));
	const filled =
		clamped === null ? 0 : Math.round((clamped / 100) * segments);

	const filledClass =
		tone === "danger"
			? "bg-red-600"
			: tone === "warn"
				? "bg-amber-500"
				: tone === "ok"
					? "bg-emerald-600"
					: "bg-zinc-400";
	const emptyClass =
		tone === "muted"
			? "bg-zinc-300 dark:bg-zinc-700"
			: "bg-zinc-200 dark:bg-zinc-800";

	return (
		<div className="flex flex-col items-center gap-0.5 px-1">
			<div className="flex items-center gap-0.5">
				{Array.from({ length: segments }).map((_, i) => {
					const on = i < filled;
					return (
						<div
							// eslint-disable-next-line react/no-array-index-key
							key={i}
							className={[
								"h-[10px] w-[2px] rounded-full",
								on ? filledClass : emptyClass,
								!on ? "opacity-90" : "",
							]
								.filter(Boolean)
								.join(" ")}
						/>
					);
				})}
			</div>
			<div className="text-[9px] leading-none text-muted-foreground">
				{label}
			</div>
		</div>
	);
}

export default function KeysPanel({ teamsWithKeys }: any) {
	// Ensure teams that have keys are shown first, preserving original relative order.
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithKeys)) return teamsWithKeys;
		// stable partition: keep relative order within groups
		const withKeys: any[] = [];
		const withoutKeys: any[] = [];
		for (const t of teamsWithKeys) {
			if (t && Array.isArray(t.keys) && t.keys.length > 0)
				withKeys.push(t);
			else withoutKeys.push(t);
		}
		return [...withKeys, ...withoutKeys];
	}, [teamsWithKeys]);

	if (!sortedTeams || sortedTeams.length === 0) {
		return (
			<div className="mt-6 text-sm text-muted-foreground">
				No teams or keys to manage.
			</div>
		);
	}

	return (
		<div className="mt-6 space-y-6">
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"} className="space-y-2">
					{!team.keys || team.keys.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No keys for this team.
						</div>
					) : (
						<div className="rounded-lg border border-border/60 bg-card overflow-hidden">
							<Table className="[&_tr:last-child]:border-b-0 table-fixed">
								<TableHeader className="bg-muted/30">
									<TableRow>
										<TableHead className="pl-4 w-[18rem]">
											Key{" "}
											<span className="ml-1 text-xs font-normal text-muted-foreground">
												({team.keys.length})
											</span>
										</TableHead>
										<TableHead className="hidden lg:table-cell w-[14rem]">Prefix</TableHead>
										<TableHead className="hidden md:table-cell w-[12rem]">Requests</TableHead>
										<TableHead className="hidden md:table-cell w-[12rem]">Spend</TableHead>
										<TableHead className="hidden sm:table-cell w-[7rem] whitespace-nowrap">
											Last Used
										</TableHead>
										<TableHead className="hidden sm:table-cell w-[6rem] whitespace-nowrap">
											Expires
										</TableHead>
										<TableHead className="w-10 text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{team.keys.map((k: any) => {
										const state = getKeyState(k);
										const meta = stateMeta(state);
										const reqPrimary = pickPrimaryRequestLimit(k);
										const spendPrimary = pickPrimarySpendLimit(k);

										const dailyLimit = Number(k?.daily_limit_requests ?? 0) || 0;
										const currentUsage = Number(k?.current_usage_daily ?? 0) || 0;
										const reqPct =
											dailyLimit > 0 ? (currentUsage / dailyLimit) * 100 : null;
										const reqTone =
											state === "disabled"
												? ("muted" as const)
												: dailyLimit > 0 && reqPct !== null
													? reqPct >= 100
														? ("danger" as const)
														: reqPct >= 80
															? ("warn" as const)
															: ("ok" as const)
													: ("muted" as const);

										return (
											<TableRow key={k.id}>
												<TableCell className="pl-4">
													<div className="flex items-center gap-2 min-w-0">
														<Tooltip delayDuration={0}>
															<TooltipTrigger asChild>
																<meta.Icon
																	aria-label={meta.label}
																	className={`h-4 w-4 shrink-0 ${meta.className}`}
																/>
															</TooltipTrigger>
															<TooltipContent>
																{meta.label}
															</TooltipContent>
														</Tooltip>
														<div className="min-w-0">
															<div className="font-medium truncate">
																{k.name}
															</div>
															<div className="font-mono text-xs text-muted-foreground truncate md:hidden">
																{k.prefix}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
													{k.prefix}
												</TableCell>
												<TableCell className="hidden md:table-cell">
													<Tooltip delayDuration={0}>
														<TooltipTrigger asChild>
															<div className="flex items-start gap-6">
																<Silo label="D" pct={reqPct} tone={reqTone} />
																<Silo
																	label="W"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																/>
																<Silo
																	label="M"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																/>
															</div>
														</TooltipTrigger>
														<TooltipContent className="max-w-xs">
															<div className="text-xs font-medium">Requests</div>
															<div className="mt-1 text-xs text-muted-foreground space-y-1">
																<div>Daily: {Number(k?.daily_limit_requests ?? 0) > 0 ? fmtCompactInt(Number(k.daily_limit_requests)) : "Unlimited"}</div>
																<div>Weekly: {Number(k?.weekly_limit_requests ?? 0) > 0 ? fmtCompactInt(Number(k.weekly_limit_requests)) : "Unlimited"}</div>
																<div>Monthly: {Number(k?.monthly_limit_requests ?? 0) > 0 ? fmtCompactInt(Number(k.monthly_limit_requests)) : "Unlimited"}</div>
																<div className="pt-1">
																	Usage today: {fmtCompactInt(currentUsage)}
																	{dailyLimit > 0 ? ` / ${fmtCompactInt(dailyLimit)}` : ""}
																</div>
															</div>
														</TooltipContent>
													</Tooltip>
												</TableCell>
												<TableCell className="hidden md:table-cell">
													<Tooltip delayDuration={0}>
														<TooltipTrigger asChild>
															<div className="flex items-start gap-6">
																<Silo
																	label="D"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																/>
																<Silo
																	label="W"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																/>
																<Silo
																	label="M"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																/>
															</div>
														</TooltipTrigger>
														<TooltipContent className="max-w-xs">
															<div className="text-xs font-medium">Spend</div>
															<div className="mt-1 text-xs text-muted-foreground space-y-1">
																<div>Daily: {Number(k?.daily_limit_cost_nanos ?? 0) > 0 ? fmtUsdFromNanos(Number(k.daily_limit_cost_nanos)) : "Unlimited"}</div>
																<div>Weekly: {Number(k?.weekly_limit_cost_nanos ?? 0) > 0 ? fmtUsdFromNanos(Number(k.weekly_limit_cost_nanos)) : "Unlimited"}</div>
																<div>Monthly: {Number(k?.monthly_limit_cost_nanos ?? 0) > 0 ? fmtUsdFromNanos(Number(k.monthly_limit_cost_nanos)) : "Unlimited"}</div>
															</div>
														</TooltipContent>
													</Tooltip>
												</TableCell>
												<TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
													{formatLastUsed(k.last_used_at)}
												</TableCell>
												<TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
													{formatExpiry(k.expires_at)}
												</TableCell>
												<TableCell className="text-right">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																aria-label="Actions"
															>
																<MoreVertical />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent
															side="bottom"
															align="end"
														>
															<UsageItem k={k} />
															<EditKeyItem k={k} />
															<KeyLimitsItem k={k} />
															<DeleteKeyItem k={k} />
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
