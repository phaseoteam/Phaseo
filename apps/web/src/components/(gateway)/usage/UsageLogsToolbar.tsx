"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { revalidateUsage } from "@/app/(dashboard)/gateway/usage/actions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
	getUsageRangeLabel,
	getUsageRangeParamKeys,
	parseUsageDateInput,
	type UsageLogsViewKey,
	type UsageRangePreset,
} from "@/lib/gateway/usage/timeRange";
import { runUsageViewRefresh } from "@/lib/gateway/usage/refreshBus";

function parseDateInput(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const parts = value.split("-");
	if (parts.length !== 3) return undefined;
	const [year, month, day] = parts.map((part) => Number(part));
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

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
}

function getAnchorTab(preset: UsageRangePreset): "current" | "previous" {
	switch (preset) {
		case "last_week":
		case "last_month":
		case "last_quarter":
			return "previous";
		default:
			return "current";
	}
}

function LiveIndicator({ className }: { className?: string }) {
	return (
		<span className={cn("relative flex h-2 w-2", className)}>
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
			<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
		</span>
	);
}

function PresetButton({
	label,
	active,
	live,
	onClick,
}: {
	label: string;
	active: boolean;
	live?: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			className={cn(
				"h-auto w-full justify-between rounded-md px-2 py-2 text-left text-xs font-normal",
				active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
			)}
			onClick={onClick}
		>
			<div className="flex items-center gap-2">
				{live ? <LiveIndicator /> : null}
				<span>{label}</span>
			</div>
			{active ? <Check className="h-3.5 w-3.5" /> : null}
		</Button>
	);
}

export default function UsageLogsToolbar({
	view,
	preset,
	customFrom,
	customTo,
	filters,
}: {
	view: UsageLogsViewKey;
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	filters?: React.ReactNode;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isRefreshing, startRefreshing] = React.useTransition();
	const [isRevalidating, setIsRevalidating] = React.useState(false);
	const [popoverOpen, setPopoverOpen] = React.useState(false);
	const [showCustomRange, setShowCustomRange] = React.useState(preset === "custom");
	const [anchorTab, setAnchorTab] = React.useState<"current" | "previous">(
		getAnchorTab(preset),
	);
	const [secondsUntilRefresh, setSecondsUntilRefresh] = React.useState(15);
	const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(() => ({
		from: parseDateInput(customFrom ?? undefined),
		to: parseDateInput(customTo ?? undefined),
	}));

	React.useEffect(() => {
		setShowCustomRange(preset === "custom");
		setAnchorTab(getAnchorTab(preset));
		setSecondsUntilRefresh(15);
		setDraftRange({
			from: parseDateInput(customFrom ?? undefined),
			to: parseDateInput(customTo ?? undefined),
		});
	}, [customFrom, customTo, preset]);

	const paramKeys = React.useMemo(() => getUsageRangeParamKeys(), []);
	const triggerLabel = React.useMemo(
		() =>
			getUsageRangeLabel({
				preset,
				customFrom,
				customTo,
			}),
		[customFrom, customTo, preset],
	);

	const applyParams = React.useCallback(
		(next: Partial<Record<keyof ReturnType<typeof getUsageRangeParamKeys>, string | null>>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(next)) {
				const paramKey = paramKeys[key as keyof typeof paramKeys];
				if (!paramKey) continue;
				if (!value) params.delete(paramKey);
				else params.set(paramKey, value);
			}
			const query = params.toString();
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
			applyParams({
				preset: nextPreset,
				from: null,
				to: null,
			});
			setPopoverOpen(false);
		},
		[applyParams],
	);

	const applyCustomRange = React.useCallback(() => {
		const nextFrom = draftRange?.from ? formatDateInput(draftRange.from) : null;
		const nextTo = draftRange?.to ? formatDateInput(draftRange.to) : nextFrom;
		if (!nextFrom || !nextTo) return;
		applyParams({
			preset: "custom",
			from: nextFrom,
			to: nextTo,
		});
		setPopoverOpen(false);
	}, [applyParams, draftRange]);

	const runRefresh = React.useCallback(async (showToast: boolean) => {
		if (isRefreshing || isRevalidating) return;
		setIsRevalidating(true);
		try {
			const refreshPromise = (async () => {
				const result = await revalidateUsage();
				if (!result.ok) {
					throw new Error(result.message || "Failed to revalidate usage data.");
				}
				await runUsageViewRefresh(view);
				setSecondsUntilRefresh(15);
			})();
			if (showToast) {
				await toast.promise(refreshPromise, {
					loading: "Refreshing usage data...",
					success: "Usage data refreshed.",
					error: (error) =>
						getErrorMessage(error, "Failed to revalidate usage data."),
				});
			} else {
				await refreshPromise;
			}
		} finally {
			setIsRevalidating(false);
		}
	}, [isRefreshing, isRevalidating, view]);

	const handleRefresh = React.useCallback(async () => {
		await runRefresh(true);
	}, [runRefresh]);

	React.useEffect(() => {
		if (preset !== "live") return;
		const interval = window.setInterval(() => {
			setSecondsUntilRefresh((current) => {
				if (isRefreshing || isRevalidating) {
					return current;
				}
				if (current <= 1) {
					void runRefresh(false);
					return 15;
				}
				return current - 1;
			});
		}, 1_000);
		return () => window.clearInterval(interval);
	}, [isRefreshing, isRevalidating, preset, runRefresh]);

	const anchoredOptions: Array<{ preset: UsageRangePreset; label: string }> = [
		{ preset: "this_week", label: getUsageRangeLabel({ preset: "this_week" }) },
		{ preset: "last_week", label: getUsageRangeLabel({ preset: "last_week" }) },
		{ preset: "this_month", label: getUsageRangeLabel({ preset: "this_month" }) },
		{ preset: "last_month", label: getUsageRangeLabel({ preset: "last_month" }) },
		{ preset: "this_quarter", label: getUsageRangeLabel({ preset: "this_quarter" }) },
		{ preset: "last_quarter", label: getUsageRangeLabel({ preset: "last_quarter" }) },
	];
	const rollingOptions: Array<{ preset: UsageRangePreset; label: string; live?: boolean }> = [
		{ preset: "live", label: "Live", live: true },
		{ preset: "past_hour", label: getUsageRangeLabel({ preset: "past_hour" }) },
		{ preset: "past_24h", label: getUsageRangeLabel({ preset: "past_24h" }) },
		{ preset: "last_7d", label: getUsageRangeLabel({ preset: "last_7d" }) },
		{ preset: "last_30d", label: getUsageRangeLabel({ preset: "last_30d" }) },
		{ preset: "last_90d", label: getUsageRangeLabel({ preset: "last_90d" }) },
	];

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{filters}
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => void handleRefresh()}
					disabled={isRefreshing || isRevalidating}
					aria-label="Refresh current view"
				>
					<RefreshCw
						className={cn("h-3 w-3", (isRefreshing || isRevalidating) && "animate-spin")}
					/>
				</Button>

				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							className={cn(
								"min-w-[220px] justify-between gap-3 text-xs",
								preset === "live" &&
									"border-emerald-300 text-emerald-700 shadow-none hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700",
							)}
						>
							{preset === "live" ? (
								<div className="flex min-w-0 items-center gap-2">
									<LiveIndicator />
									<span className="truncate font-medium">Live</span>
									<span className="truncate text-xs text-muted-foreground">
										refreshing in {secondsUntilRefresh}s
									</span>
								</div>
							) : (
								<div className="flex min-w-0 items-center gap-2">
									<CalendarDays className="h-3 w-3 shrink-0" />
									<span className="truncate">{triggerLabel}</span>
								</div>
							)}
							<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className={cn(
							showCustomRange ? "w-max p-0" : "w-[320px] p-3",
						)}
					>
						{showCustomRange ? (
							<div className="flex flex-col">
								<div className="flex items-center gap-2 px-4 py-3">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="-ml-2 h-8 px-2 text-xs text-muted-foreground"
										onClick={() => setShowCustomRange(false)}
									>
										<ChevronLeft className="mr-0 h-3.5 w-3.5" />
										Back
									</Button>
									<div className="text-xs font-medium">Custom range</div>
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
										onClick={() => setShowCustomRange(false)}
									>
										Cancel
									</Button>
									<Button
										type="button"
										size="sm"
										onClick={applyCustomRange}
										disabled={!draftRange?.from}
									>
										Apply
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-3">
								<div className="space-y-1">
									{rollingOptions.map((option) => (
										<PresetButton
											key={option.preset}
											label={option.label}
											live={option.live}
											active={preset === option.preset}
											onClick={() => selectPreset(option.preset)}
										/>
									))}
								</div>

								<Separator />

								<div className="space-y-3">
									<Tabs
										value={anchorTab}
										onValueChange={(value) =>
											setAnchorTab(value === "previous" ? "previous" : "current")
										}
									>
										<TabsList className="grid w-full grid-cols-2">
											<TabsTrigger value="current" className="text-xs">Current</TabsTrigger>
											<TabsTrigger value="previous" className="text-xs">Previous</TabsTrigger>
										</TabsList>
									</Tabs>

									<div className="space-y-1">
										{anchoredOptions
											.filter((option) =>
												anchorTab === "previous"
													? option.preset === "last_week" ||
														option.preset === "last_month" ||
														option.preset === "last_quarter"
													: option.preset === "this_week" ||
														option.preset === "this_month" ||
														option.preset === "this_quarter",
											)
											.map((option) => (
												<PresetButton
													key={option.preset}
													label={option.label}
													active={preset === option.preset}
													onClick={() => selectPreset(option.preset)}
												/>
											))}
									</div>
								</div>

								<Separator />

								<div className="space-y-2">
									<PresetButton
										label={
											preset === "custom"
												? getUsageRangeLabel({
														preset: "custom",
														customFrom: parseUsageDateInput(customFrom),
														customTo: parseUsageDateInput(customTo),
												  })
												: "Custom range"
										}
										active={preset === "custom"}
										onClick={() => setShowCustomRange(true)}
									/>
								</div>
							</div>
						)}
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
