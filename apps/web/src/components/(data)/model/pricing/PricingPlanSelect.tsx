"use client";

import * as React from "react";
import {
    CircleDollarSign,
    Gift,
    Layers,
    Sparkles,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function PricingPlanSelect({
	value,
	onChange,
	plans,
	planMetaLabels = {},
	compact = false,
}: {
	value: string;
	onChange: (p: string) => void;
	plans: string[];
	planMetaLabels?: Record<string, string | null | undefined>;
	compact?: boolean;
}) {
    const getMultiplierTone = (value: string | null) => {
        if (!value) return "neutral" as const;
        const match = value.match(/(\d+(?:\.\d+)?)/);
        const numeric = match ? Number.parseFloat(match[1]) : Number.NaN;
        if (!Number.isFinite(numeric)) return "neutral" as const;
        if (numeric < 1) return "cheaper" as const;
        if (numeric > 1) return "premium" as const;
        return "neutral" as const;
    };
    const isBatchPlan = (plan: string) => plan === "batch";
    const getAccentClasses = (tone: "neutral" | "cheaper" | "premium", isBatch: boolean) => {
        if (isBatch) {
            return {
                selected: "text-orange-700 dark:text-orange-300",
                hover: "group-hover:text-orange-700 dark:group-hover:text-orange-300",
            };
        }
        if (tone === "cheaper") {
            return {
                selected: "text-emerald-700 dark:text-emerald-300",
                hover: "group-hover:text-emerald-700 dark:group-hover:text-emerald-300",
            };
        }
        if (tone === "premium") {
            return {
                selected: "text-violet-700 dark:text-violet-300",
                hover: "group-hover:text-violet-700 dark:group-hover:text-violet-300",
            };
        }
        return {
            selected: "text-foreground",
            hover: "group-hover:text-foreground/80",
        };
    };

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
    const iconForPlan = (plan: string) => {
        switch (plan) {
            case "free":
                return Gift;
            case "batch":
                return Layers;
            case "flex":
                return Zap;
            case "priority":
                return Sparkles;
            case "standard":
            default:
                return CircleDollarSign;
        }
    };

    return (
        <div
            role="tablist"
            aria-label="Pricing plan"
            className={cn(
                "inline-flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40",
                compact ? "p-0.5" : "p-1"
            )}
        >
            {plans.map((plan) => {
                const Icon = iconForPlan(plan);
                const selected = plan === value;
                const metaLabel = planMetaLabels[plan] ?? null;
                const multiplierTone = getMultiplierTone(metaLabel);
                const batchPlan = isBatchPlan(plan);
                const accentClasses = getAccentClasses(multiplierTone, batchPlan);
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
                                ? "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors"
                                : "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors sm:text-sm",
                            selected
                                ? "bg-background text-foreground shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-700"
                                : "text-muted-foreground hover:bg-background/80 hover:text-foreground dark:hover:bg-zinc-950/60"
                        )}
                    >
                        {!compact ? <Icon className="h-3.5 w-3.5" /> : null}
                        <span
                            className={cn(
                                selected && accentClasses.selected,
                            )}
                        >
                            {labelForPlan(plan)}
                        </span>
                        {metaLabel ? (
                            <span
                                className={cn(
                                    "font-medium transition-colors",
                                    compact ? "text-[10px]" : "text-[11px]",
                                    !selected && "text-muted-foreground/90",
                                    !selected && accentClasses.hover,
                                    selected &&
                                        (multiplierTone === "neutral"
                                            ? "text-muted-foreground"
                                            : accentClasses.selected),
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
