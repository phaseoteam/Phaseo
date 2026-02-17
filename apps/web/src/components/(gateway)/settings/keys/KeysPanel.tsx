"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Ban, CheckCircle2, Infinity as InfinityIcon, MoreVertical, OctagonAlert } from "lucide-react";
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

function formatKeyReference(v?: string | null) {
	const ref = typeof v === "string" ? v.trim() : "";
	return ref ? `aistats_v1_sk_...${ref}` : "aistats_v1_sk_...";
}

function getKeyUsageVisuals(k: any, state: KeyState) {
	const dailyLimit = Number(k?.daily_limit_requests ?? 0) || 0;
	const weeklyLimit = Number(k?.weekly_limit_requests ?? 0) || 0;
	const monthlyLimit = Number(k?.monthly_limit_requests ?? 0) || 0;
	const currentUsage = Number(k?.current_usage_daily ?? 0) || 0;
	const dailySpendLimit = Number(k?.daily_limit_cost_nanos ?? 0) || 0;
	const weeklySpendLimit = Number(k?.weekly_limit_cost_nanos ?? 0) || 0;
	const monthlySpendLimit = Number(k?.monthly_limit_cost_nanos ?? 0) || 0;
	const currentDailySpend = Number(k?.current_usage_daily_cost_nanos ?? 0) || 0;

	const reqPct = dailyLimit > 0 ? (currentUsage / dailyLimit) * 100 : null;
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
	const spendPct =
		dailySpendLimit > 0 ? (currentDailySpend / dailySpendLimit) * 100 : null;
	const spendTone =
		state === "disabled"
			? ("muted" as const)
			: dailySpendLimit > 0 && spendPct !== null
				? spendPct >= 100
					? ("danger" as const)
					: spendPct >= 80
						? ("warn" as const)
						: ("ok" as const)
				: ("muted" as const);
	const requestTooltipText = {
		D: dailyLimit > 0
			? `Daily limit: ${fmtCompactInt(dailyLimit)} | Used today: ${fmtCompactInt(currentUsage)}`
			: `Daily limit: Unlimited | Used today: ${fmtCompactInt(currentUsage)}`,
		W: weeklyLimit > 0
			? `Weekly limit: ${fmtCompactInt(weeklyLimit)} | Usage progress not shown yet`
			: "Weekly limit: Unlimited",
		M: monthlyLimit > 0
			? `Monthly limit: ${fmtCompactInt(monthlyLimit)} | Usage progress not shown yet`
			: "Monthly limit: Unlimited",
	} as const;
	const spendTooltipText = {
		D: dailySpendLimit > 0
			? `Daily limit: ${fmtUsdFromNanos(dailySpendLimit)} | Spend today: ${fmtUsdFromNanos(currentDailySpend)}`
			: `Daily limit: Unlimited | Spend today: ${fmtUsdFromNanos(currentDailySpend)}`,
		W: weeklySpendLimit > 0
			? `Weekly limit: ${fmtUsdFromNanos(weeklySpendLimit)} | Spend progress not shown yet`
			: "Weekly limit: Unlimited",
		M: monthlySpendLimit > 0
			? `Monthly limit: ${fmtUsdFromNanos(monthlySpendLimit)} | Spend progress not shown yet`
			: "Monthly limit: Unlimited",
	} as const;

	return {
		dailyLimit,
		weeklyLimit,
		monthlyLimit,
		currentUsage,
		dailySpendLimit,
		weeklySpendLimit,
		monthlySpendLimit,
		currentDailySpend,
		reqPct,
		reqTone,
		spendPct,
		spendTone,
		requestTooltipText,
		spendTooltipText,
	};
}

type SiloMode = "progress" | "unlimited" | "unknown";

function Silo({
	label,
	pct,
	tone,
	mode = "progress",
}: {
	label: string;
	pct: number | null;
	tone: "ok" | "warn" | "danger" | "muted";
	mode?: SiloMode;
}) {
	const clamped = pct === null ? null : Math.max(0, Math.min(100, pct));
	const progressPct = clamped === null ? 0 : clamped;

	const filledClass =
		mode === "unlimited"
			? "bg-sky-500/40 dark:bg-sky-400/35"
			: tone === "danger"
			? "bg-red-600"
			: tone === "warn"
				? "bg-amber-500"
				: tone === "ok"
					? "bg-emerald-600"
					: "bg-zinc-400";
	const trackClass =
		tone === "muted"
			? "bg-zinc-300 dark:bg-zinc-700"
			: "bg-zinc-200 dark:bg-zinc-800";
	const valueClass =
		tone === "danger"
			? "text-red-600"
			: tone === "warn"
				? "text-amber-600"
				: tone === "ok"
					? "text-emerald-600"
					: "text-zinc-500";

	return (
		<div className="flex items-center gap-2 px-1">
			<div className="w-3 text-[10px] leading-none text-muted-foreground">{label}</div>
			<div className={`relative h-1.5 flex-1 overflow-hidden rounded-full ${trackClass}`}>
				{mode === "unknown" ? (
					<div className="absolute inset-0 border border-dashed border-zinc-400/70 dark:border-zinc-500/70" />
				) : (
					<div
						className={`h-full rounded-full ${filledClass}`}
						style={{
							width: mode === "unlimited" ? "100%" : `${progressPct}%`,
						}}
					/>
				)}
			</div>
			<div className={`w-7 text-right text-[10px] leading-none ${valueClass}`}>
				{mode === "unlimited" ? (
					<InfinityIcon className="ml-auto h-3 w-3" />
				) : mode === "unknown" ? (
					"--"
				) : (
					`${Math.round(progressPct)}%`
				)}
			</div>
		</div>
	);
}

function SiloWithTooltip({
	children,
	content,
}: {
	children: React.ReactNode;
	content: React.ReactNode;
}) {
	return (
		<Tooltip delayDuration={0}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent className="max-w-xs">
				<div className="text-xs">{content}</div>
			</TooltipContent>
		</Tooltip>
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
							<div className="divide-y divide-border/60 md:hidden">
								{team.keys.map((k: any) => {
									const state = getKeyState(k);
									const meta = stateMeta(state);
									const visuals = getKeyUsageVisuals(k, state);

									return (
										<div key={k.id} className="space-y-3 p-3">
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<div className="flex items-center gap-2 min-w-0">
														<meta.Icon
															aria-label={meta.label}
															className={`h-4 w-4 shrink-0 ${meta.className}`}
														/>
														<div className="font-medium truncate">{k.name}</div>
													</div>
													<div className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
														{formatKeyReference(k.prefix)}
													</div>
												</div>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8"
															aria-label="Actions"
														>
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="bottom" align="end">
														<UsageItem k={k} />
														<EditKeyItem k={k} />
														<KeyLimitsItem k={k} />
														<DeleteKeyItem k={k} />
													</DropdownMenuContent>
												</DropdownMenu>
											</div>

											<div className="grid grid-cols-2 gap-3 text-xs">
												<div>
													<div className="text-muted-foreground">Last Used</div>
													<div>{formatLastUsed(k.last_used_at)}</div>
												</div>
												<div>
													<div className="text-muted-foreground">Expires</div>
													<div>{formatExpiry(k.expires_at)}</div>
												</div>
											</div>

											<div className="space-y-1.5">
												<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
													Requests
												</div>
												<Silo
													label="D"
													pct={visuals.reqPct}
													tone={visuals.reqTone}
													mode={visuals.dailyLimit > 0 ? "progress" : "unlimited"}
												/>
												<Silo
													label="W"
													pct={null}
													tone={state === "disabled" ? "muted" : "muted"}
													mode={visuals.weeklyLimit > 0 ? "unknown" : "unlimited"}
												/>
												<Silo
													label="M"
													pct={null}
													tone={state === "disabled" ? "muted" : "muted"}
													mode={visuals.monthlyLimit > 0 ? "unknown" : "unlimited"}
												/>
											</div>

											<div className="space-y-1.5">
												<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
													Spend
												</div>
												<Silo
													label="D"
													pct={visuals.spendPct}
													tone={visuals.spendTone}
													mode={visuals.dailySpendLimit > 0 ? "progress" : "unlimited"}
												/>
												<Silo
													label="W"
													pct={null}
													tone={state === "disabled" ? "muted" : "muted"}
													mode={visuals.weeklySpendLimit > 0 ? "unknown" : "unlimited"}
												/>
												<Silo
													label="M"
													pct={null}
													tone={state === "disabled" ? "muted" : "muted"}
													mode={visuals.monthlySpendLimit > 0 ? "unknown" : "unlimited"}
												/>
											</div>
										</div>
									);
								})}
							</div>

							<Table className="hidden md:table [&_tr:last-child]:border-b-0 table-fixed [&_th]:px-4 [&_td]:px-4 [&_th]:align-middle [&_td]:align-middle">
								<TableHeader className="bg-muted/30">
									<TableRow>
										<TableHead className="w-[20rem]">
											Key{" "}
											<span className="ml-1 text-xs font-normal text-muted-foreground">
												({team.keys.length})
											</span>
										</TableHead>
										<TableHead className="hidden lg:table-cell w-[12rem]">Key Ref</TableHead>
										<TableHead className="hidden md:table-cell w-[14rem] pr-8">Requests</TableHead>
										<TableHead className="hidden md:table-cell w-[14rem] pl-8">Spend</TableHead>
										<TableHead className="hidden sm:table-cell w-[8rem] whitespace-nowrap">
											Last Used
										</TableHead>
										<TableHead className="hidden sm:table-cell w-[7rem] whitespace-nowrap">
											Expires
										</TableHead>
										<TableHead className="w-[3.5rem] text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{team.keys.map((k: any) => {
										const state = getKeyState(k);
										const meta = stateMeta(state);
										const visuals = getKeyUsageVisuals(k, state);

										return (
											<TableRow key={k.id}>
												<TableCell>
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
																{formatKeyReference(k.prefix)}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
													{formatKeyReference(k.prefix)}
												</TableCell>
												<TableCell className="hidden md:table-cell pr-8">
													<div className="space-y-1.5">
														<SiloWithTooltip content={visuals.requestTooltipText.D}>
															<div className="w-full">
																<Silo
																	label="D"
																	pct={visuals.reqPct}
																	tone={visuals.reqTone}
																	mode={visuals.dailyLimit > 0 ? "progress" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
														<SiloWithTooltip content={visuals.requestTooltipText.W}>
															<div className="w-full">
																<Silo
																	label="W"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																	mode={visuals.weeklyLimit > 0 ? "unknown" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
														<SiloWithTooltip content={visuals.requestTooltipText.M}>
															<div className="w-full">
																<Silo
																	label="M"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																	mode={visuals.monthlyLimit > 0 ? "unknown" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
													</div>
												</TableCell>
												<TableCell className="hidden md:table-cell pl-8">
													<div className="space-y-1.5">
														<SiloWithTooltip content={visuals.spendTooltipText.D}>
															<div className="w-full">
																<Silo
																	label="D"
																	pct={visuals.spendPct}
																	tone={visuals.spendTone}
																	mode={visuals.dailySpendLimit > 0 ? "progress" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
														<SiloWithTooltip content={visuals.spendTooltipText.W}>
															<div className="w-full">
																<Silo
																	label="W"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																	mode={visuals.weeklySpendLimit > 0 ? "unknown" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
														<SiloWithTooltip content={visuals.spendTooltipText.M}>
															<div className="w-full">
																<Silo
																	label="M"
																	pct={null}
																	tone={state === "disabled" ? "muted" : "muted"}
																	mode={visuals.monthlySpendLimit > 0 ? "unknown" : "unlimited"}
																/>
															</div>
														</SiloWithTooltip>
													</div>
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
