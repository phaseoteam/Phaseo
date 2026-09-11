"use client";

import React, { memo, useId, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
	Ban,
	CheckCircle2,
	Edit2,
	Eye,
	EyeOff,
	Infinity as InfinityIcon,
	Info,
	Key,
	MoreVertical,
	OctagonAlert,
	RefreshCw,
	Trash2,
	X,
	Filter,
	Loader2,
	Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import UsageItem from "./UsageItem";
import KeyDetailsItem from "./KeyDetailsItem";
import EditKeyItem from "./EditKeyItem";
import DeleteKeyItem from "./DeleteKeyItem";
import RotateKeyItem from "./RotateKeyItem";
import {
	deleteApiKeyAction,
	lookupApiKeyAction,
	updateApiKeyAction,
} from "@/app/(dashboard)/settings/keys/actions";
import { toast } from "sonner";

import { getKeyState, organiseKeys, type KeyState } from "./keyOrdering";
type KeyDialogType = "details" | "edit" | "rotate" | "delete";
type ActiveKeyDialog = { type: KeyDialogType; key: any } | null;

const NANOS_PER_USD = 1_000_000_000;

function KeyDialogMenuItem({
	label,
	Icon,
	variant,
	onOpen,
}: {
	label: string;
	Icon: React.ComponentType<{ className?: string }>;
	variant?: "default" | "destructive";
	onOpen: () => void;
}) {
	return (
		<DropdownMenuItem variant={variant} className="rounded-xl" render={<div
				className="flex w-full items-center gap-2 text-left"
				onClick={onOpen} />}>

				<Icon className="mr-2 h-4 w-4" />
				<span>{label}</span>

		</DropdownMenuItem>
	);
}


function stateMeta(state: KeyState) {
	switch (state) {
		case "active":
			return { label: "Active", Icon: CheckCircle2, className: "text-emerald-600" };
		case "disabled":
			return { label: "Disabled", Icon: Ban, className: "text-zinc-400" };
		case "limited":
			return { label: "Limits Reached", Icon: OctagonAlert, className: "text-red-600" };
		case "expired":
			return { label: "Expired", Icon: Ban, className: "text-amber-600" };
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
	return ref ? `phaseo_v1_sk_...${ref}` : "phaseo_v1_sk_...";
}

function GuardrailSummary({
	guardrails,
	className = "mt-1",
}: {
	guardrails?: any[];
	className?: string;
}) {
	const items = Array.isArray(guardrails) ? guardrails : [];
	if (items.length === 0) {
		return (
			<div className={`${className} text-[11px] text-muted-foreground`}>
				No guardrails
			</div>
		);
	}

	return (
		<div className={`${className} flex flex-wrap gap-1.5`}>
			{items.slice(0, 2).map((guardrail, index) => (
				<Badge
					key={guardrail.id ?? guardrail.name ?? `guardrail-${index}`}
					variant="outline"
					className="max-w-full gap-1 text-[10px]"
				>
					<span className="truncate">
						{guardrail.name ?? guardrail.id ?? "Guardrail"}
					</span>
					{guardrail.enabled === false ? (
						<span className="text-muted-foreground">(Off)</span>
					) : null}
				</Badge>
			))}
			{items.length > 2 ? (
				<Badge variant="secondary" className="text-[10px]">
					+{items.length - 2}
				</Badge>
			) : null}
		</div>
	);
}

type LimitWindowUsage = {
	label: "D" | "W" | "M";
	name: string;
	used: number;
	limit: number;
};
type LimitTone = "ok" | "warn" | "danger" | "muted";

function getWindowPercent(window: LimitWindowUsage): number | null {
	return window.limit > 0 ? (window.used / window.limit) * 100 : null;
}

function getWindowTone(window: LimitWindowUsage, state: KeyState): LimitTone {
	if (state === "disabled" || state === "expired" || window.limit <= 0) {
		return "muted";
	}

	const pct = getWindowPercent(window) ?? 0;
	if (pct >= 100) return "danger";
	if (pct >= 80) return "warn";
	return "ok";
}

function getKeyUsageVisuals(k: any) {
	const dailyLimit = Number(k?.daily_limit_requests ?? 0) || 0;
	const weeklyLimit = Number(k?.weekly_limit_requests ?? 0) || 0;
	const monthlyLimit = Number(k?.monthly_limit_requests ?? 0) || 0;
	const currentUsage = Number(k?.current_usage_daily ?? 0) || 0;
	const currentWeeklyUsage = Number(k?.current_usage_weekly ?? 0) || 0;
	const currentMonthlyUsage = Number(k?.current_usage_monthly ?? 0) || 0;
	const dailySpendLimit = Number(k?.daily_limit_cost_nanos ?? 0) || 0;
	const weeklySpendLimit = Number(k?.weekly_limit_cost_nanos ?? 0) || 0;
	const monthlySpendLimit = Number(k?.monthly_limit_cost_nanos ?? 0) || 0;
	const currentDailySpend = Number(k?.current_usage_daily_cost_nanos ?? 0) || 0;
	const currentWeeklySpend = Number(k?.current_usage_weekly_cost_nanos ?? 0) || 0;
	const currentMonthlySpend = Number(k?.current_usage_monthly_cost_nanos ?? 0) || 0;

	const requestWindows = [
		{ label: "D", name: "Today", used: currentUsage, limit: dailyLimit },
		{ label: "W", name: "This week", used: currentWeeklyUsage, limit: weeklyLimit },
		{ label: "M", name: "This month", used: currentMonthlyUsage, limit: monthlyLimit },
	] as const;
	const spendWindows = [
		{ label: "D", name: "Today", used: currentDailySpend, limit: dailySpendLimit },
		{ label: "W", name: "This week", used: currentWeeklySpend, limit: weeklySpendLimit },
		{ label: "M", name: "This month", used: currentMonthlySpend, limit: monthlySpendLimit },
	] as const;
	return {
		requestWindows,
		spendWindows,
	};
}

function LimitRadial({
	pct,
	tone,
}: {
	pct: number | null;
	tone: LimitTone;
}) {
	if (pct === null) {
		return (
			<span className="grid size-4 place-items-center rounded-full bg-background/70 text-muted-foreground">
				<InfinityIcon className="size-2.5" />
			</span>
		);
	}

	const clamped = Math.max(0, Math.min(100, pct));
	const radius = 6;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset = circumference - (clamped / 100) * circumference;
	const ringClass =
		tone === "danger"
			? "text-red-600"
			: tone === "warn"
				? "text-amber-600"
				: tone === "ok"
					? "text-emerald-600"
					: "text-muted-foreground";

	return (
		<svg
			aria-hidden="true"
			className="size-4 -rotate-90"
			viewBox="0 0 16 16"
		>
			<circle
				className="text-muted"
				cx="8"
				cy="8"
				fill="none"
				r={radius}
				stroke="currentColor"
				strokeWidth="2"
			/>
			<circle
				className={ringClass}
				cx="8"
				cy="8"
				fill="none"
				r={radius}
				stroke="currentColor"
				strokeDasharray={circumference}
				strokeDashoffset={strokeDashoffset}
				strokeLinecap="round"
				strokeWidth="2"
			/>
		</svg>
	);
}

function getNextLimitResetAt(label: LimitWindowUsage["label"]) {
	const now = new Date();

	if (label === "D") {
		return new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + 1,
			0,
			0,
			0,
			0
		);
	}

	if (label === "W") {
		const day = now.getDay();
		const daysUntilMonday = day === 0 ? 1 : 8 - day;
		return new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + daysUntilMonday,
			0,
			0,
			0,
			0
		);
	}

	return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

function formatResetCountdown(label: LimitWindowUsage["label"]) {
	const resetAt = getNextLimitResetAt(label);
	const diffMs = Math.max(0, resetAt.getTime() - Date.now());
	const totalMinutes = Math.ceil(diffMs / (60 * 1000));
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) {
		return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	}

	if (hours > 0) {
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	}

	return `${Math.max(1, minutes)}m`;
}

const LimitPillStack = memo(function LimitPillStack({
	windows,
	formatter,
	state,
	metricLabel,
}: {
	windows: readonly LimitWindowUsage[];
	formatter: (value: number) => string;
	state: KeyState;
	metricLabel: "requests" | "spend";
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			{windows.map((window) => {
				const pct = getWindowPercent(window);
				const clamped = pct === null ? null : Math.max(0, Math.min(100, pct));
				const tone = getWindowTone(window, state);
				const remaining = Math.max(0, window.limit - window.used);
				const progressWidth = clamped ?? 100;
				const pillClass =
					tone === "danger"
						? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
						: tone === "warn"
							? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
							: tone === "ok"
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
								: "border-border/60 bg-muted/50 text-muted-foreground";
				const progressClass =
					tone === "danger"
						? "bg-red-600"
						: tone === "warn"
							? "bg-amber-500"
							: tone === "ok"
								? "bg-emerald-600"
								: "bg-muted-foreground/40";
				const value = clamped !== null ? `${Math.round(clamped)}%` : "No cap";
				const title =
					metricLabel === "requests"
						? `${window.name} requests`
						: `${window.name} spend`;
				const resetText = formatResetCountdown(window.label);

				return (
					<HoverCard key={window.label} openDelay={120} closeDelay={100}>
						<HoverCardTrigger asChild>
							<div
								className={`flex h-6 min-w-0 cursor-help items-center gap-1.5 rounded-md border px-1.5 text-[11px] leading-none ${pillClass}`}
							>
								<span className="w-3 shrink-0 font-medium">{window.label}</span>
								<LimitRadial pct={clamped} tone={tone} />
								<span className="min-w-0 truncate font-medium">{value}</span>
							</div>
						</HoverCardTrigger>
						<HoverCardContent align="start" className="w-64 p-3">
							<div className="space-y-3 text-xs">
								<div>
									<div className="flex items-center justify-between gap-3">
										<div className="font-medium text-foreground">{title}</div>
										<div
											className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${pillClass}`}
										>
											{value}
										</div>
									</div>
									<div className="mt-1 text-muted-foreground">
										Resets in {resetText}
									</div>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className={`h-full rounded-full ${progressClass}`}
										style={{ width: `${progressWidth}%` }}
									/>
								</div>
								<div className="space-y-1.5">
									<div className="flex items-center justify-between gap-4">
										<span className="text-muted-foreground">Used</span>
										<span className="font-mono font-medium tabular-nums">
											{formatter(window.used)}
										</span>
									</div>
									<div className="flex items-center justify-between gap-4">
										<span className="text-muted-foreground">Limit</span>
										<span className="font-mono font-medium tabular-nums">
											{window.limit > 0 ? formatter(window.limit) : "No cap"}
										</span>
									</div>
									{window.limit > 0 ? (
										<div className="flex items-center justify-between gap-4">
											<span className="text-muted-foreground">Remaining</span>
											<span className="font-mono font-semibold tabular-nums text-foreground">
												{formatter(remaining)}
											</span>
										</div>
									) : null}
									<div className="flex items-center justify-between gap-4 border-t pt-1.5">
										<span className="text-muted-foreground">Reset</span>
										<span className="font-mono font-semibold tabular-nums text-foreground">
											{resetText}
										</span>
									</div>
								</div>
							</div>
						</HoverCardContent>
					</HoverCard>
				);
			})}
		</div>
	);
});

function KeySelectionCheckbox({ "aria-label": label, ...props }: {
 checked: boolean;
 indeterminate?: boolean;
 onCheckedChange: (checked: boolean) => void;
 className?: string;
 "aria-label": string;
}) {
 const labelId = useId();
 // An explicit label avoids Base UI's DOM label-association lookup on every commit.
 return <>
  <span id={labelId} className="sr-only">{label}</span>
  <Checkbox {...props} aria-labelledby={labelId} />
 </>;
}

type KeyRowProps = {
	k: any;
	selected: boolean;
	toggleKeySelection: (id: string, checked: boolean) => void;
	openKeyDialog: (type: KeyDialogType, key: any) => void;
	openDetailsFromRow: (event: React.MouseEvent<HTMLElement>, key: any) => void;
	openDetailsFromKeyboard: (event: React.KeyboardEvent<HTMLElement>, key: any) => void;
};

const MobileKeyRow = memo(function MobileKeyRow({ k, selected, toggleKeySelection, openKeyDialog, openDetailsFromRow, openDetailsFromKeyboard }: KeyRowProps) {
	const state = getKeyState(k);
	const meta = useMemo(() => stateMeta(state), [state]);
	const visuals = useMemo(() => getKeyUsageVisuals(k), [k]);
	const keyId = String(k.id);

	return (
		<div
			key={k.id}
			className={`cursor-pointer space-y-3 p-3 transition-colors hover:bg-muted/30 ${selected ? "bg-muted/40" : ""}`}
			role="button"
			tabIndex={0}
			onClick={(event) => openDetailsFromRow(event, k)}
			onKeyDown={(event) => openDetailsFromKeyboard(event, k)}
		>
			<div className="flex items-start justify-between gap-2">
			<div className="flex min-w-0 gap-3">
				<KeySelectionCheckbox
					checked={selected}
					onCheckedChange={(checked) =>
						toggleKeySelection(keyId, checked === true)
					}
					aria-label={`Select ${k.name}`}
					className="mt-0.5"
				/>
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
				<GuardrailSummary guardrails={k.guardrails} />
			</div>
			</div>
			<DropdownMenu>
					<DropdownMenuTrigger render={<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							aria-label="Actions" />}>

							<MoreVertical className="h-4 w-4" />

					</DropdownMenuTrigger>
				<DropdownMenuContent side="bottom" align="end" className="w-40 rounded-2xl">
						<KeyDialogMenuItem
							label="Details"
							Icon={Info}
							onOpen={() => openKeyDialog("details", k)}
						/>
						<UsageItem k={k} />
						<KeyDialogMenuItem
							label="Edit"
							Icon={Edit2}
							onOpen={() => openKeyDialog("edit", k)}
						/>
						<KeyDialogMenuItem
							label="Rotate"
							Icon={RefreshCw}
							onOpen={() => openKeyDialog("rotate", k)}
						/>
						<KeyDialogMenuItem
							label="Delete"
							Icon={Trash2}
							variant="destructive"
							onOpen={() => openKeyDialog("delete", k)}
						/>
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
				<LimitPillStack
					windows={visuals.requestWindows}
					state={state}
					formatter={fmtCompactInt}
					metricLabel="requests"
				/>
			</div>

			<div className="space-y-1.5">
				<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
					Spend
				</div>
				<LimitPillStack
					windows={visuals.spendWindows}
					state={state}
					formatter={fmtUsdFromNanos}
					metricLabel="spend"
				/>
			</div>
		</div>
	);
});

const DesktopKeyRow = memo(function DesktopKeyRow({ k, selected, toggleKeySelection, openKeyDialog, openDetailsFromRow, openDetailsFromKeyboard }: KeyRowProps) {
		const state = getKeyState(k);
		const meta = useMemo(() => stateMeta(state), [state]);
		const visuals = useMemo(() => getKeyUsageVisuals(k), [k]);
		const keyId = String(k.id);

 const content = useMemo(() => <>
				<TableCell className="min-w-0">
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
						<div className="font-mono text-xs text-muted-foreground truncate">
							{formatKeyReference(k.prefix)}
						</div>
					</div>
				</div>
			</TableCell>
				<TableCell className="min-w-0">
					<GuardrailSummary
						guardrails={k.guardrails}
						className="flex flex-wrap gap-1.5"
					/>
				</TableCell>
				<TableCell>
					<LimitPillStack
						windows={visuals.requestWindows}
						state={state}
						formatter={fmtCompactInt}
						metricLabel="requests"
					/>
				</TableCell>
				<TableCell>
					<LimitPillStack
						windows={visuals.spendWindows}
						state={state}
						formatter={fmtUsdFromNanos}
						metricLabel="spend"
					/>
				</TableCell>
				<TableCell className="text-xs text-muted-foreground">
					{formatLastUsed(k.last_used_at)}
				</TableCell>
				<TableCell className="text-xs text-muted-foreground">
					{formatExpiry(k.expires_at)}
				</TableCell>
				<TableCell className="text-right">
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button
								variant="ghost"
								size="icon"
								aria-label="Actions" />}>

								<MoreVertical />

						</DropdownMenuTrigger>
				<DropdownMenuContent
					side="bottom"
					align="end"
					className="w-40 rounded-2xl"
						>
							<KeyDialogMenuItem
								label="Details"
								Icon={Info}
								onOpen={() => openKeyDialog("details", k)}
							/>
							<UsageItem k={k} />
							<KeyDialogMenuItem
								label="Edit"
								Icon={Edit2}
								onOpen={() => openKeyDialog("edit", k)}
							/>
							<KeyDialogMenuItem
								label="Rotate"
								Icon={RefreshCw}
								onOpen={() => openKeyDialog("rotate", k)}
							/>
							<KeyDialogMenuItem
								label="Delete"
								Icon={Trash2}
								variant="destructive"
								onOpen={() => openKeyDialog("delete", k)}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
 </>, [k, state, meta, visuals, openKeyDialog]);

		return (
			<TableRow
				key={k.id}
				className={`cursor-pointer transition-colors hover:bg-muted/30 ${selected ? "bg-muted/40" : ""}`}
				role="button"
				tabIndex={0}
				onClick={(event) => openDetailsFromRow(event, k)}
				onKeyDown={(event) => openDetailsFromKeyboard(event, k)}
			>
				<TableCell>
					<KeySelectionCheckbox
						checked={selected}
						onCheckedChange={(checked) =>
							toggleKeySelection(keyId, checked === true)
						}
						aria-label={`Select ${k.name}`}
					/>
				</TableCell>
 {content}
			</TableRow>
		);
});

const desktopQuery = "(min-width: 64rem)";
function subscribeToLayout(onChange: () => void) {
 const query = window.matchMedia(desktopQuery);
 query.addEventListener("change", onChange);
 return () => query.removeEventListener("change", onChange);
}
const getDesktopLayout = () => window.matchMedia(desktopQuery).matches;
const getServerLayout = () => false;

export default function KeysPanel({ teamsWithKeys }: any) {
	const router = useRouter();
 const desktop = useSyncExternalStore(subscribeToLayout, getDesktopLayout, getServerLayout);
	const [filter, setFilter] = useQueryState("keyStatus", parseAsStringLiteral(["enabled", "disabled", "expired", "enabled-disabled", "enabled-expired", "disabled-expired", "all", "none"] as const).withDefault("enabled-disabled"));
	const [search, setSearch] = useState("");
	const [showRawKey, setShowRawKey] = useState(false);
	const [matchedKeyId, setMatchedKeyId] = useState<string | null>(null);
	const [rawLookupPending, setRawLookupPending] = useState(false);
	const normalizedSearch = search.trim();
	const isRawKeySearch = /^(?:phaseo|aistats)_v1_sk_[A-Za-z0-9]{12}_[A-Za-z0-9]{40}$/.test(normalizedSearch);
	const workspaceId = String(teamsWithKeys?.[0]?.id ?? "");

	useEffect(() => {
		if (!isRawKeySearch || !workspaceId) return;
		let current = true;
		const timeout = window.setTimeout(() => {
			setRawLookupPending(true);
			lookupApiKeyAction(workspaceId, normalizedSearch)
				.then((result) => { if (current) setMatchedKeyId(result.keyId); })
				.catch(() => { if (current) setMatchedKeyId(null); })
				.finally(() => { if (current) setRawLookupPending(false); });
		}, 250);
		return () => { current = false; window.clearTimeout(timeout); };
	}, [isRawKeySearch, normalizedSearch, workspaceId]);
	// Ensure teams that have keys are shown first. Within each workspace, keys are
	// ordered with enabled keys first, then by most recent use within each status.
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithKeys)) return teamsWithKeys;
		const withKeys: any[] = [];
		const withoutKeys: any[] = [];
		for (const t of teamsWithKeys) {
			if (t && Array.isArray(t.keys) && t.keys.length > 0) {
				const searchedKeys = isRawKeySearch
					? (matchedKeyId ? t.keys.filter((key: any) => String(key.id) === matchedKeyId) : [])
					: normalizedSearch
						? t.keys.filter((key: any) => String(key.name ?? "").toLocaleLowerCase().includes(normalizedSearch.toLocaleLowerCase()))
						: t.keys;
				const keys = organiseKeys(searchedKeys, isRawKeySearch ? "all" : filter);
				withKeys.push({ ...t, keys });
			}
			else withoutKeys.push(t);
		}
		return [...withKeys, ...withoutKeys];
	}, [teamsWithKeys, filter, isRawKeySearch, matchedKeyId, normalizedSearch]);
	const allKeys = useMemo(() => {
		if (!Array.isArray(sortedTeams)) return [] as any[];
		return sortedTeams.flatMap((team: any) =>
			Array.isArray(team?.keys) ? team.keys : []
		);
	}, [sortedTeams]);
	const [activeDialog, setActiveDialog] = useState<ActiveKeyDialog>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
	const [bulkBusy, setBulkBusy] = useState(false);
	const openKeyDialog = useCallback((type: KeyDialogType, key: any) => {
		setActiveDialog({ type, key });
	}, []);
	const openDetailsFromRow = useCallback((event: React.MouseEvent<HTMLElement>, key: any) => {
		const target = event.target as HTMLElement;
		if (target.closest("button, a, input, [role='checkbox'], [role='menuitem']")) return;
		openKeyDialog("details", key);
	}, [openKeyDialog]);
	const openDetailsFromKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>, key: any) => {
		if (event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openKeyDialog("details", key);
	}, [openKeyDialog]);
	const closeKeyDialog = () => setActiveDialog(null);
	const selectedKeys = allKeys.filter((key: any) => selectedIds.has(String(key.id)));
	const selectableKeyIds = allKeys.map((key: any) => String(key.id));
	const allSelected =
		selectableKeyIds.length > 0 &&
		selectableKeyIds.every((id: string) => selectedIds.has(id));
	const someSelected = selectedKeys.length > 0;

	const toggleKeySelection = useCallback((id: string, checked: boolean) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	function toggleAllKeys(checked: boolean) {
		setSelectedIds(checked ? new Set(selectableKeyIds) : new Set());
	}

	async function runBulkStatusUpdate(paused: boolean) {
		if (selectedKeys.length === 0) return;
		setBulkBusy(true);
		try {
			await toast.promise(
				Promise.all(
					selectedKeys.map((key: any) =>
						updateApiKeyAction(String(key.id), { paused })
					)
				),
				{
					loading: paused ? "Pausing selected keys..." : "Activating selected keys...",
					success: paused ? "Selected keys paused" : "Selected keys activated",
					error: (error) =>
						(error && (error as any).message) || "Failed to update selected keys",
				}
			);
			setSelectedIds(new Set());
			router.refresh();
		} finally {
			setBulkBusy(false);
		}
	}

	async function runBulkDelete() {
		if (selectedKeys.length === 0) return;
		setBulkBusy(true);
		try {
			await toast.promise(
				Promise.all(
					selectedKeys.map((key: any) =>
						deleteApiKeyAction(String(key.id), String(key.name ?? ""))
					)
				),
				{
					loading: "Deleting selected keys...",
					success: "Selected keys deleted",
					error: (error) =>
						(error && (error as any).message) || "Failed to delete selected keys",
				}
			);
			setBulkDeleteOpen(false);
			setSelectedIds(new Set());
			router.refresh();
		} finally {
			setBulkBusy(false);
		}
	}

 const statusOptions = ["enabled", "disabled", "expired"] as const;
 const selectedStatuses = filter === "all" ? [...statusOptions] : filter.split("-");
 const statusMenu = (
  <DropdownMenu>
   <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" aria-label="Filter keys by status" />}>
    <Filter className={`size-3.5 ${filter !== "enabled-disabled" ? "text-primary" : "text-muted-foreground"}`} />
   </DropdownMenuTrigger>
   <DropdownMenuContent align="start">
    {statusOptions.map((status) => (
     <DropdownMenuCheckboxItem key={status} checked={selectedStatuses.includes(status)} disabled={bulkBusy}
      onCheckedChange={(checked) => {
       const next = statusOptions.filter((item) => item === status ? checked : selectedStatuses.includes(item));
       setSelectedIds(new Set());
       void setFilter((next.length === 3 ? "all" : next.join("-") || "none") as typeof filter);
      }}>
      {status === "enabled" ? <CheckCircle2 className="text-emerald-600" /> : status === "expired" ? <OctagonAlert className="text-amber-600" /> : <Ban className="text-muted-foreground" />}
      {status[0].toUpperCase() + status.slice(1)}
     </DropdownMenuCheckboxItem>
    ))}
   </DropdownMenuContent>
  </DropdownMenu>
 );

	if (!sortedTeams || sortedTeams.length === 0 || teamsWithKeys.every((team: any) => !team.keys?.length)) {
		return (
			<Empty className="mt-6 rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Key className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>No API keys yet</EmptyTitle>
					<EmptyDescription>
						Create your first key to start sending gateway requests.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<>
		<div className="mt-6 min-w-0 space-y-6 pb-24">
			<div className="relative max-w-md">
				<Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					aria-label="Search API keys"
					autoCapitalize="none"
					autoComplete="off"
					className={isRawKeySearch ? "pl-8 pr-24" : "pl-8 pr-9"}
					placeholder="Search by name or paste a full key"
					spellCheck={false}
					type={isRawKeySearch && !showRawKey ? "password" : "text"}
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setShowRawKey(false);
					}}
				/>
				{normalizedSearch ? (
					<div className="absolute right-0 top-0 flex h-full items-center">
						{isRawKeySearch && rawLookupPending ? <Loader2 aria-label="Looking up API key" className="mr-1 size-4 animate-spin text-muted-foreground" /> : null}
						{isRawKeySearch ? (
							<Button type="button" variant="ghost" size="icon" className="size-8" aria-label={showRawKey ? "Hide API key" : "Show API key"} aria-pressed={showRawKey} onClick={() => setShowRawKey((visible) => !visible)}>
								{showRawKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</Button>
						) : null}
						<Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Clear search" onClick={() => { setSearch(""); setShowRawKey(false); }}><X className="size-4" /></Button>
					</div>
				) : null}
			</div>

			{someSelected ? (
				<div role="region" aria-label="Selected key actions" className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl border border-border/70 bg-popover px-3 py-2 text-popover-foreground shadow-xl">
					<div className="text-sm" role="status" aria-live="polite">
						<span className="font-medium">{selectedKeys.length}</span>{" "}
						<span className="text-muted-foreground">
							{selectedKeys.length === 1 ? "key selected" : "keys selected"}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={bulkBusy}
							onClick={() => runBulkStatusUpdate(false)}
						>
							<CheckCircle2 className="h-4 w-4" />
							Activate
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={bulkBusy}
							onClick={() => runBulkStatusUpdate(true)}
						>
							<Ban className="h-4 w-4" />
							Pause
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={bulkBusy}
							onClick={() => setBulkDeleteOpen(true)}
						>
							<Trash2 className="h-4 w-4" />
							Delete
						</Button>
						<Button type="button" variant="ghost" size="icon" className="size-8" disabled={bulkBusy} aria-label="Clear selection" onClick={() => setSelectedIds(new Set())}>
							<X className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"} className="min-w-0 space-y-2">
					{!team.keys || team.keys.length === 0 ? (
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-6"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Key className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle className="text-base">No matching keys</EmptyTitle>
 {statusMenu}
								<EmptyDescription>
									{normalizedSearch ? (rawLookupPending ? "Checking this API key…" : "Try another key name or full API key.") : filter === "all" ? "Create an API key to manage access and usage limits." : "Choose another status to see more keys."}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-card">
							{!desktop ? <div className="divide-y divide-border/60 lg:hidden">
 <div className="flex items-center gap-2 px-3 py-1">Keys {statusMenu}</div>
								{team.keys.map((k: any) => (
 <MobileKeyRow key={k.id} k={k} selected={selectedIds.has(String(k.id))}
 toggleKeySelection={toggleKeySelection} openKeyDialog={openKeyDialog}
 openDetailsFromRow={openDetailsFromRow} openDetailsFromKeyboard={openDetailsFromKeyboard} />
 ))}
							</div>
 : <ScrollArea
								className="hidden w-full lg:block"
								viewportClassName="pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
								scrollBarOrientation="horizontal"
								keepScrollbarMounted
							>
							<Table wrapInContainer={false} className="min-w-[980px] table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_th]:align-middle [&_td]:align-middle">
								<TableHeader className="bg-muted/30">
									<TableRow>
										<TableHead className="w-[3%]">
											<KeySelectionCheckbox
												checked={allSelected}
												indeterminate={someSelected && !allSelected}
												onCheckedChange={(checked) =>
													toggleAllKeys(checked === true)
												}
												aria-label="Select all filtered API keys"
											/>
										</TableHead>
										<TableHead className="w-[26%]">
											<div className="flex items-center gap-2">
 <span>Key</span>
 {statusMenu}
											<span className="ml-1 text-xs font-normal text-muted-foreground">
												({team.keys.length})
											</span>
 </div>
										</TableHead>
										<TableHead className="w-[16%]">Guardrails</TableHead>
										<TableHead className="w-[16%]">Requests</TableHead>
										<TableHead className="w-[16%]">Spend</TableHead>
										<TableHead className="w-[10%] whitespace-nowrap">
											Last Used
										</TableHead>
										<TableHead className="w-[8%] whitespace-nowrap">
											Expires
										</TableHead>
										<TableHead className="w-[5%] text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{team.keys.map((k: any) => (
 <DesktopKeyRow key={k.id} k={k} selected={selectedIds.has(String(k.id))}
 toggleKeySelection={toggleKeySelection} openKeyDialog={openKeyDialog}
 openDetailsFromRow={openDetailsFromRow} openDetailsFromKeyboard={openDetailsFromKeyboard} />
 ))}
								</TableBody>
							</Table>
							</ScrollArea>}
						</div>
					)}
				</div>
			))}
		</div>
		{activeDialog ? (
			<>
				{activeDialog.type === "details" ? (
					<KeyDetailsItem
						key={`details-${activeDialog.key?.id ?? "key"}`}
						k={activeDialog.key}
						trigger={false}
						open
						onOpenChange={(next) => {
							if (!next) closeKeyDialog();
						}}
					/>
				) : null}
				{activeDialog.type === "edit" ? (
					<EditKeyItem
						key={`edit-${activeDialog.key?.id ?? "key"}`}
						k={activeDialog.key}
						trigger={false}
						open
						onOpenChange={(next) => {
							if (!next) closeKeyDialog();
						}}
					/>
				) : null}
				{activeDialog.type === "rotate" ? (
					<RotateKeyItem
						key={`rotate-${activeDialog.key?.id ?? "key"}`}
						k={activeDialog.key}
						trigger={false}
						open
						onOpenChange={(next) => {
							if (!next) closeKeyDialog();
						}}
					/>
				) : null}
				{activeDialog.type === "delete" ? (
					<DeleteKeyItem
						key={`delete-${activeDialog.key?.id ?? "key"}`}
						k={activeDialog.key}
						trigger={false}
						open
						onOpenChange={(next) => {
							if (!next) closeKeyDialog();
						}}
					/>
				) : null}
			</>
		) : null}
		<Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete selected API keys?</DialogTitle>
					<DialogDescription>
						This will delete {selectedKeys.length}{" "}
						{selectedKeys.length === 1 ? "key" : "keys"} and remove linked
						guardrail assignments from those keys.
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-sm">
					{selectedKeys.slice(0, 8).map((key: any) => (
						<div key={key.id} className="truncate">
							{key.name}
						</div>
					))}
					{selectedKeys.length > 8 ? (
						<div className="text-muted-foreground">
							+{selectedKeys.length - 8} more
						</div>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						disabled={bulkBusy}
						onClick={() => setBulkDeleteOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={bulkBusy || selectedKeys.length === 0}
						onClick={runBulkDelete}
					>
						{bulkBusy ? "Deleting..." : "Delete selected"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		</>
	);
}
