"use client";

import * as React from "react";
import {
    CircleDollarSign,
    Gift,
    Layers,
    Sparkles,
    Zap,
} from "lucide-react";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";

export default function PricingPlanSelect({
	value,
	onChange,
	plans,
}: {
	value: string;
	onChange: (p: string) => void;
	plans: string[];
}) {
	// Capitalize first letter for display in trigger
    const display = value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
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
    const TriggerIcon = iconForPlan(value);

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-[180px]">
                {/* Provide the capitalized value as the visible content */}
                <SelectValue placeholder="Plan">
                    <span className="inline-flex items-center gap-2">
                        <TriggerIcon className="h-4 w-4 text-muted-foreground" />
                        {display}
                    </span>
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {plans.map((p) => {
                    const ItemIcon = iconForPlan(p);
                    return (
                        <SelectItem key={p} value={p} className="capitalize">
                            <span className="inline-flex items-center gap-2">
                                <ItemIcon className="h-4 w-4 text-muted-foreground" />
                                {p}
                            </span>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}
