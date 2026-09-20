"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	RefreshCw,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { revalidateUsage } from "@/app/(dashboard)/gateway/usage/actions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
	getUsageRangeBadgeLabel,
	getUsageRangeLabel,
	getUsageRangeParamKeys,
	getUsageRangeTriggerLabel,
	parseUsageDateInput,
	parseUsageRelativeShorthand,
	resolveUsageTimeRange,
	serializeUsageRangePreset,
	type UsageLogsViewKey,
	type UsageRangePreset,
} from "@/lib/gateway/usage/timeRange";
import { runUsageViewRefresh } from "@/lib/gateway/usage/refreshBus";
import { usePrivateUsageRefresh } from "./PrivateUsageQuery";
import { cn } from "@/lib/utils";

function parseDateInput(value: string | null | undefined): Date | undefined {
	const normalized = parseUsageDateInput(value);
	if (!normalized) return undefined;
	const datePart = normalized.split("T")[0];
	const [year, month, day] = datePart.split("-").map(Number);
	if (!year || !month || !day) return undefined;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function parseAbsoluteDateTimeInput(value: string): string | null {
	const normalized = parseUsageDateInput(value.replace(" ", "T"));
	if (normalized) return normalized;
	const match = value.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?,\s*(\d{2}):(\d{2})$/);
	if (!match) return null;
	const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
		.indexOf((match[1] ?? "").toLowerCase());
	if (month < 0) return null;
	const year = Number(match[3] ?? new Date().getFullYear());
	const date = new Date(year, month, Number(match[2]), Number(match[4]), Number(match[5]));
	if (Number.isNaN(date.getTime())) return null;
	return `${formatDateInput(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseTypedRangeInput(value: string): { from: string; to: string } | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parts = trimmed.split(/\s(?:->|to|-|–)\s/i);
	if (parts.length !== 2) return null;
	const from = parseAbsoluteDateTimeInput(parts[0] ?? "");
	const to = parseAbsoluteDateTimeInput(parts[1] ?? "");
	if (!from || !to) return null;
	return { from, to };
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
}

function LiveIndicator({ className }: { className?: string }) {
	return (
		<span className={cn("relative flex h-2 w-2", className)}>
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
			<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
		</span>
	);
}

function RangeOptionButton({
	badge,
	label,
	active,
	live,
	onClick,
	badgeVariant = "pill",
}: {
	badge?: React.ReactNode;
	label: string;
	active: boolean;
	live?: boolean;
	onClick: () => void;
	badgeVariant?: "pill" | "plain";
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			className={cn(
				"h-auto w-full justify-between rounded-lg px-2 py-1.5 text-left text-xs font-normal",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
			)}
			onClick={onClick}
		>
			<div className="flex min-w-0 items-center gap-2">
				{live ? (
					<div className="flex h-5 w-5 items-center justify-center">
						<LiveIndicator />
					</div>
				) : badge ? (
					badgeVariant === "plain" ? (
						<span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
							{badge}
						</span>
					) : (
						<span className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
							{badge}
						</span>
					)
				) : null}
				<span className="truncate text-sm">{label}</span>
			</div>
			{active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
		</Button>
	);
}

export default function UsageLogsToolbar({
	view,
	preset,
	customFrom,
	customTo,
	showRefresh = true,
	showLivePreset = true,
}: {
	view: UsageLogsViewKey;
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	showRefresh?: boolean;
	showLivePreset?: boolean;
}) {
	const router = useRouter();
	const privateQuery = usePrivateUsageRefresh();
	const pathname = usePathname() ?? "/settings/usage/logs";
	const searchParams = useSearchParams() ?? new URLSearchParams();
	const [isRefreshing, startRefreshing] = React.useTransition();
	const [isRevalidating, setIsRevalidating] = React.useState(false);
	const [pendingTargetQuery, setPendingTargetQuery] = React.useState<string | null>(
		null,
	);
	const [optimisticRange, setOptimisticRange] = React.useState<{
		preset: UsageRangePreset;
		customFrom?: string | null;
		customTo?: string | null;
	} | null>(null);
	const [popoverOpen, setPopoverOpen] = React.useState(false);
	const [showCustomRange, setShowCustomRange] = React.useState(preset === "custom");
	const [secondsUntilRefresh, setSecondsUntilRefresh] = React.useState(15);
	const [isEditingRangeInput, setIsEditingRangeInput] = React.useState(false);
	const [rangeInputValue, setRangeInputValue] = React.useState("");
	const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(() => ({
		from: parseDateInput(customFrom ?? undefined),
		to: parseDateInput(customTo ?? undefined),
	}));
	const rangeAnchorRef = React.useRef<HTMLDivElement | null>(null);
	const rangeInputRef = React.useRef<HTMLInputElement | null>(null);
	const rangeTriggerRef = React.useRef<HTMLButtonElement | null>(null);
	const rangePopoverContentRef = React.useRef<HTMLDivElement | null>(null);

	const currentQuery = searchParams.toString();
	const isPending = pendingTargetQuery !== null;
	const effectivePreset = optimisticRange?.preset ?? preset;
	const effectiveCustomFrom = optimisticRange?.customFrom ?? customFrom;
	const effectiveCustomTo = optimisticRange?.customTo ?? customTo;
	const refreshActive = isRefreshing || isRevalidating || isPending || privateQuery?.refreshing;

	React.useEffect(() => {
		if (!pendingTargetQuery) return;
		if (currentQuery === pendingTargetQuery) {
			setPendingTargetQuery(null);
			setOptimisticRange(null);
		}
	}, [currentQuery, pendingTargetQuery]);

	React.useEffect(() => {
		setShowCustomRange(preset === "custom");
		setSecondsUntilRefresh(15);
		setIsEditingRangeInput(false);
		setRangeInputValue("");
		setDraftRange({
			from: parseDateInput(customFrom ?? undefined),
			to: parseDateInput(customTo ?? undefined),
		});
	}, [customFrom, customTo, preset]);

	React.useEffect(() => {
		if (!popoverOpen) return;

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (
				rangeAnchorRef.current?.contains(target) ||
				rangePopoverContentRef.current?.contains(target)
			) {
				return;
			}

			setPopoverOpen(false);
			setIsEditingRangeInput(false);
			setRangeInputValue("");
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setPopoverOpen(false);
			setIsEditingRangeInput(false);
			setRangeInputValue("");
			requestAnimationFrame(() => rangeTriggerRef.current?.focus());
		};

		document.addEventListener("pointerdown", handlePointerDown, true);
		document.addEventListener("keydown", handleKeyDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
			document.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [popoverOpen]);

	const paramKeys = React.useMemo(() => getUsageRangeParamKeys(), []);
	const displayLabel = React.useMemo(
		() => effectivePreset === "custom"
			? getUsageRangeTriggerLabel({
					preset: effectivePreset,
					customFrom: effectiveCustomFrom,
					customTo: effectiveCustomTo,
				})
			: getUsageRangeLabel({ preset: effectivePreset }),
		[effectiveCustomFrom, effectiveCustomTo, effectivePreset],
	);
	const editableRangeValue = React.useMemo(() => {
		return getUsageRangeTriggerLabel({
			preset: effectivePreset,
			customFrom: effectiveCustomFrom,
			customTo: effectiveCustomTo,
		});
	}, [effectiveCustomFrom, effectiveCustomTo, effectivePreset]);
	const beginEditingRange = React.useCallback((input: HTMLInputElement) => {
		setIsEditingRangeInput(true);
		setRangeInputValue(editableRangeValue);
		setPopoverOpen(true);
		input.focus();
	}, [editableRangeValue]);

	const applyParams = React.useCallback(
		(
			nextRange: {
				preset: UsageRangePreset;
				customFrom?: string | null;
				customTo?: string | null;
			},
			next: Partial<
				Record<keyof ReturnType<typeof getUsageRangeParamKeys>, string | null>
			>,
		) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(next)) {
				const paramKey = paramKeys[key as keyof typeof paramKeys];
				if (!paramKey) continue;
				if (!value) params.delete(paramKey);
				else params.set(paramKey, value);
			}
			const query = params.toString();
			setPendingTargetQuery(query);
			setOptimisticRange({
				preset: nextRange.preset,
				customFrom: nextRange.customFrom ?? null,
				customTo: nextRange.customTo ?? null,
			});
			startRefreshing(() => {
				router.push(query ? `${pathname}?${query}` : pathname);
			});
		},
		[paramKeys, pathname, router, searchParams],
	);

	const selectPreset = React.useCallback(
		(nextPreset: UsageRangePreset) => {
			setShowCustomRange(nextPreset === "custom");
			if (nextPreset === "custom") return;
			setPopoverOpen(false);
			setIsEditingRangeInput(false);
			setRangeInputValue("");
			rangeInputRef.current?.blur();
			applyParams(
				{ preset: nextPreset, customFrom: null, customTo: null },
				{
					preset: serializeUsageRangePreset(nextPreset),
					from: null,
					to: null,
				},
			);
		},
		[applyParams],
	);

	const applyCustomRange = React.useCallback(() => {
		const nextFrom = draftRange?.from ? formatDateInput(draftRange.from) : null;
		const nextTo = draftRange?.to ? formatDateInput(draftRange.to) : nextFrom;
		if (!nextFrom || !nextTo) return;
		applyParams(
			{ preset: "custom", customFrom: nextFrom, customTo: nextTo },
			{
				preset: "custom",
				from: nextFrom,
				to: nextTo,
			},
		);
		setPopoverOpen(false);
	}, [applyParams, draftRange]);

	const applyTypedRange = React.useCallback(() => {
		const finishEditing = () => {
			setPopoverOpen(false);
			setIsEditingRangeInput(false);
			setRangeInputValue("");
			rangeInputRef.current?.blur();
		};

		const shorthand = parseUsageRelativeShorthand(rangeInputValue);
		if (shorthand) {
			applyParams(
				{ preset: `rel:${shorthand}`, customFrom: null, customTo: null },
				{
					preset: shorthand,
					from: null,
					to: null,
				},
			);
			finishEditing();
			return;
		}

		const parsed = parseTypedRangeInput(rangeInputValue);
		if (!parsed) {
			toast.error(
				"Use shorthand like 2mo, 4w, 36h, or a range like 2026-05-11 09:00 -> 2026-05-12 18:30.",
			);
			return;
		}
		if (rangeInputValue.trim() === editableRangeValue) {
			finishEditing();
			return;
		}
		applyParams(
			{
				preset: "custom",
				customFrom: parsed.from,
				customTo: parsed.to,
			},
			{
				preset: "custom",
				from: parsed.from,
				to: parsed.to,
			},
		);
		finishEditing();
	}, [applyParams, editableRangeValue, rangeInputValue]);

	const runRefresh = React.useCallback(
		async (showToast: boolean) => {
			if (isRefreshing || isRevalidating || privateQuery?.refreshing) return;
			setIsRevalidating(true);
			try {
				const refreshPromise = (async () => {
					if (privateQuery) {
						await privateQuery.refresh();
						setSecondsUntilRefresh(15);
						return;
					}
					if (showToast) {
						const result = await revalidateUsage("logs");
						if (!result.ok) {
							throw new Error(
								result.message || "Failed to revalidate usage data.",
							);
						}
					}
					await runUsageViewRefresh(view);
					setSecondsUntilRefresh(15);
				})();
				if (showToast) {
					await toast.promise(refreshPromise, {
						loading: "Refreshing usage data...",
						success: "Usage data refreshed.",
						error: (error: unknown) =>
							getErrorMessage(error, "Failed to revalidate usage data."),
					});
				} else {
					await refreshPromise;
				}
			} finally {
				setIsRevalidating(false);
			}
		},
		[isRefreshing, isRevalidating, view, privateQuery],
	);

	const handleRefresh = React.useCallback(async () => {
		await runRefresh(true);
	}, [runRefresh]);

	React.useEffect(() => {
		if (!showLivePreset) return;
		if (effectivePreset !== "live") return;
		const interval = window.setInterval(() => {
			if (document.visibilityState === "hidden" || !navigator.onLine) return;
			if (privateQuery) {
				// Query polling owns the network request; only display its countdown here.
				setSecondsUntilRefresh(Math.max(0, 15 - Math.floor((Date.now() - privateQuery.updatedAt) / 1_000)));
				return;
			}
			setSecondsUntilRefresh((current) => {
				if (isRefreshing || isRevalidating) {
					return current;
				}
				if (current <= 1) {
					void runRefresh(false).catch(() => { /* Retry next tick. */ });
					return 15;
				}
				return current - 1;
			});
		}, 1_000);
		return () => window.clearInterval(interval);
	}, [effectivePreset, isRefreshing, isRevalidating, runRefresh, showLivePreset, privateQuery]);

	const rollingOptions: Array<{ preset: UsageRangePreset; badge: string }> = [
		{ preset: "past_15m", badge: "15m" },
		{ preset: "past_30m", badge: "30m" },
		{ preset: "past_hour", badge: "1h" },
		{ preset: "past_3h", badge: "3h" },
		{ preset: "past_24h", badge: "1d" },
		{ preset: "past_2d", badge: "2d" },
		{ preset: "last_7d", badge: "1w" },
		{ preset: "last_30d", badge: "1mo" },
		{ preset: "past_1y", badge: "1y" },
	];

	const anchoredOptions: Array<{ preset: UsageRangePreset; badge: string }> = [
		{ preset: "today", badge: getUsageRangeBadgeLabel({ preset: "today" }) },
		{ preset: "yesterday", badge: "24h" },
		{ preset: "this_week", badge: getUsageRangeBadgeLabel({ preset: "this_week" }) },
		{ preset: "last_week", badge: "7d" },
		{ preset: "this_month", badge: getUsageRangeBadgeLabel({ preset: "this_month" }) },
		{ preset: "last_month", badge: getUsageRangeBadgeLabel({ preset: "last_month" }) },
		{ preset: "this_year", badge: getUsageRangeBadgeLabel({ preset: "this_year" }) },
		{ preset: "last_year", badge: "1y" },
	];

	return (
		<div className="flex flex-wrap items-center justify-end gap-1.5">
			<div className="flex items-center justify-end gap-1.5">
				{showRefresh ? (
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => void handleRefresh()}
						disabled={refreshActive}
						aria-label="Refresh current view"
						aria-busy={refreshActive}
					>
						<RefreshCw
							className={cn(
								"size-3.5",
								refreshActive && "animate-spin [animation-duration:650ms]",
							)}
						/>
					</Button>
				) : null}

				<Popover
					open={popoverOpen}
					onOpenChange={(open, eventDetails) => {
						const eventTarget = eventDetails.event.target;
						if (
							!open &&
							eventDetails.reason === "outside-press" &&
							eventTarget instanceof Node &&
							rangeAnchorRef.current?.contains(eventTarget)
						) {
							eventDetails.cancel();
							return;
						}
						setPopoverOpen(open);
						if (!open) {
							setIsEditingRangeInput(false);
							setRangeInputValue("");
						}
					}}
				>
					<PopoverAnchor asChild>
						<div ref={rangeAnchorRef} className="relative w-[min(17rem,calc(100vw-8rem))] sm:w-[18rem]">
							{effectivePreset === "live" ? (
								<div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<LiveIndicator />
								</div>
							) : (
								<div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
								</div>
							)}
							<Input
								ref={rangeInputRef}
								value={
									isEditingRangeInput
										? rangeInputValue
										: effectivePreset === "live"
											? `Live | refreshing in ${secondsUntilRefresh}s`
											: displayLabel
								}
							onFocus={(event) => {
								beginEditingRange(event.currentTarget);
							}}
							onClick={(event) => {
								if (!isEditingRangeInput) beginEditingRange(event.currentTarget);
							}}
								onBlur={() => {
									window.setTimeout(() => {
										if (!popoverOpen) {
											setIsEditingRangeInput(false);
											setRangeInputValue("");
										}
									}, 0);
								}}
								onChange={(event) => setRangeInputValue(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										applyTypedRange();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										setPopoverOpen(false);
										setIsEditingRangeInput(false);
										setRangeInputValue("");
										rangeInputRef.current?.blur();
									}
								}}
								aria-label="Usage time range"
						placeholder="YYYY-MM-DD HH:mm – YYYY-MM-DD HH:mm"
								className={cn(
									"h-9 rounded-lg border-transparent bg-input/50 pl-9 pr-10 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
									effectivePreset === "live" &&
										"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/40 hover:bg-emerald-500/15 dark:text-emerald-300",
								)}
							/>
							<div className="absolute inset-y-0 right-1 flex items-center">
								<PopoverTrigger asChild>
									<Button
										ref={rangeTriggerRef}
										type="button"
										variant="ghost"
										size="icon"
										className="h-7 w-7 rounded-lg text-muted-foreground"
										aria-label="Open range presets"
										onMouseDown={(event) => event.preventDefault()}
									>
										<ChevronDown className="h-3.5 w-3.5" />
									</Button>
								</PopoverTrigger>
							</div>
						</div>
					</PopoverAnchor>
					<PopoverContent
						ref={rangePopoverContentRef}
						align="start"
						anchor={rangeAnchorRef}
						finalFocus={false}
						initialFocus={false}
						onOpenAutoFocus={(event) => event.preventDefault()}
						className={cn(showCustomRange ? "w-max p-0" : "w-[320px] p-3")}
					>
						{showCustomRange ? (
							<div className="flex flex-col">
								<div className="flex items-center gap-2 px-4 py-3">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="-ml-2 h-8 rounded-md px-2 text-xs text-muted-foreground"
										onClick={() => setShowCustomRange(false)}
									>
										<ChevronLeft className="h-3.5 w-3.5" />
										Back
									</Button>
									<div className="text-xs font-medium">Custom Range</div>
								</div>
								<Separator />
								<div className="px-4 py-3">
									<Calendar
										mode="range"
										numberOfMonths={2}
										selected={draftRange}
										onSelect={(nextRange) => setDraftRange(nextRange)}
										defaultMonth={draftRange?.from}
										className="rounded-lg border-0 p-0"
									/>
								</div>
								<Separator />
								<div className="flex items-center justify-end gap-2 px-4 py-3">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="rounded-md"
										onClick={() => setPopoverOpen(false)}
									>
										Cancel
									</Button>
									<Button
										type="button"
										size="sm"
										className="rounded-md"
										onClick={applyCustomRange}
										disabled={!draftRange?.from}
									>
										Apply
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-2.5">
								<div className="space-y-0.5">
									{rollingOptions.map((option) => (
										<RangeOptionButton
											key={serializeUsageRangePreset(option.preset)}
											badge={option.badge}
											label={getUsageRangeLabel({ preset: option.preset })}
											active={effectivePreset === option.preset}
											onClick={() => selectPreset(option.preset)}
										/>
									))}
								</div>

								<Separator />

								<div className="grid grid-cols-2 gap-0.5">
									{anchoredOptions.map((option) => (
										<RangeOptionButton
											key={serializeUsageRangePreset(option.preset)}
											badge={option.badge}
											label={getUsageRangeLabel({ preset: option.preset })}
											active={effectivePreset === option.preset}
											onClick={() => selectPreset(option.preset)}
										/>
									))}
								</div>

								<Separator />

								<div className="space-y-0.5">
									<RangeOptionButton
										badge={<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />}
										badgeVariant="plain"
										label="Custom Range"
										active={effectivePreset === "custom"}
										onClick={() => setShowCustomRange(true)}
									/>

									{showLivePreset ? (
										<RangeOptionButton
											badge="live"
											label="Live"
											live
											active={effectivePreset === "live"}
											onClick={() => selectPreset("live")}
										/>
									) : null}
								</div>
							</div>
						)}
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
