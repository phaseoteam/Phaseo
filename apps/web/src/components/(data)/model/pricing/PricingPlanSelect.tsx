"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";

export default function PricingPlanSelect({
	value,
	onChange,
	plans,
	planMetaLabels = {},
	compact = false,
	variant = "tabs",
}: {
	value: string;
	onChange: (p: string) => void;
	plans: string[];
	planMetaLabels?: Record<string, string | null | undefined>;
	compact?: boolean;
	variant?: "tabs" | "dropdown";
}) {
	const labelForPlan = (plan: string) => {
		switch (plan) {
			case "standard":
				return "Standard";
			case "free":
				return "Free";
			case "batch":
				return "Batch";
			case "flex":
				return "Flex";
			case "priority":
				return "Priority";
			default:
				return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : plan;
		}
	};
	const renderPlanIcon = (plan: string, className: string) => {
		const tierMeta = getTierFilterMeta(plan);
		const TierIcon = tierMeta.icon;
		return <TierIcon className={cn(className, tierMeta.iconClassName)} />;
	};
	const selectedClassesForPlan = (plan: string) => {
		switch (plan) {
			case "free":
				return "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100";
			case "flex":
				return "bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100";
			case "batch":
				return "bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-100";
			case "priority":
				return "bg-violet-50 text-violet-950 dark:bg-violet-950/30 dark:text-violet-100";
			case "standard":
			default:
				return "bg-background text-foreground dark:bg-zinc-950";
		}
	};
	const multiplierClassesForPlan = (plan: string, _selected: boolean) => {
		switch (plan) {
			case "batch":
				return "text-orange-700 dark:text-orange-300";
			case "flex":
				return "text-sky-700 dark:text-sky-300";
			case "priority":
				return "text-violet-700 dark:text-violet-300";
			case "free":
				return "text-emerald-700 dark:text-emerald-300";
			case "standard":
			default:
				return "text-muted-foreground";
		}
	};
	const descriptionForPlan = (plan: string) => {
		switch (plan) {
			case "free":
				return "Free routes where available.";
			case "batch":
				return "Queued or batch-oriented capacity.";
			case "flex":
				return "Flexible routing for best-effort capacity.";
			case "priority":
				return "Higher-priority routing when available.";
			case "standard":
			default:
				return "Default balanced provider routing.";
		}
	};

	if (variant === "dropdown") {
		const selectedMetaLabel = planMetaLabels[value] ?? null;

		return (
			<DropdownMenu>
				<DropdownMenuTrigger render={<button
						type="button"
						className="inline-flex h-9 min-w-[178px] items-center justify-between gap-3 rounded-md border border-zinc-200 bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-zinc-800 dark:hover:bg-zinc-900"
						aria-label="Select service tier" />}>

						<span className="inline-flex min-w-0 items-center gap-2">
							{renderPlanIcon(value, "h-3.5 w-3.5 shrink-0 text-muted-foreground")}
							<span className="truncate">{labelForPlan(value)}</span>
							{selectedMetaLabel ? (
								<span
									className={cn(
										"shrink-0 text-xs font-semibold tabular-nums",
										multiplierClassesForPlan(value, true),
									)}
								>
									{selectedMetaLabel}
								</span>
							) : null}
						</span>
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-72 p-1.5">
					{plans.map((plan) => {
						const selected = plan === value;
						const metaLabel = planMetaLabels[plan] ?? null;
						return (
							<DropdownMenuItem
								key={plan}
								onSelect={() => onChange(plan)}
								className="items-start gap-3 rounded-md px-2.5 py-2"
							>
								{renderPlanIcon(plan, "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground")}
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-2">
										<span className="font-medium text-foreground">
											{labelForPlan(plan)}
										</span>
										{metaLabel ? (
											<span
												className={cn(
													"text-xs font-semibold tabular-nums",
													multiplierClassesForPlan(plan, selected),
												)}
											>
												{metaLabel}
											</span>
										) : null}
									</span>
									<span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
										{descriptionForPlan(plan)}
									</span>
								</span>
								{selected ? (
									<Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
								) : null}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

    return (
        <div
            role="tablist"
            aria-label="Pricing plan"
            className={cn(
				"inline-flex flex-wrap items-center rounded-lg border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40",
				compact ? "gap-0.5 p-0.5" : "gap-1 p-1",
			)}
		>
			{plans.map((plan) => {
				const selected = plan === value;
				const metaLabel = planMetaLabels[plan] ?? null;
				return (
					<button
						key={plan}
						type="button"
						role="tab"
						aria-selected={selected}
						onClick={() => onChange(plan)}
						className={cn(
							"group",
							compact
								? "inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-medium transition-colors"
								: "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors sm:text-sm",
							selected
								? selectedClassesForPlan(plan)
								: "text-muted-foreground hover:bg-background/80 hover:text-foreground dark:hover:bg-zinc-950/60",
						)}
					>
						{!compact
							? renderPlanIcon(plan, "h-3.5 w-3.5 text-muted-foreground")
							: null}
						<span className={selected && metaLabel ? "text-muted-foreground" : undefined}>
							{labelForPlan(plan)}
						</span>
						{metaLabel ? (
							<span
								className={cn(
									"font-medium",
									multiplierClassesForPlan(plan, selected),
									compact ? "text-[9px]" : "text-[11px]",
								)}
							>
								{metaLabel}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
