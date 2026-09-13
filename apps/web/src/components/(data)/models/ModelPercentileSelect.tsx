"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const MODEL_PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99] as const;
export type ModelPercentile = (typeof MODEL_PERCENTILES)[number];
export const DEFAULT_MODEL_PERCENTILE: ModelPercentile = 50;

export function isModelPercentile(value: number): value is ModelPercentile {
	return MODEL_PERCENTILES.includes(value as ModelPercentile);
}

export function formatModelPercentile(value: ModelPercentile): string {
	return `P${String(value).padStart(2, "0")}`;
}

export default function ModelPercentileSelect({
	value,
	onChange,
	isLoading = false,
	disabled = false,
	ariaLabel = "Select percentile",
	className,
}: {
	value: ModelPercentile;
	onChange: (value: ModelPercentile) => void;
	isLoading?: boolean;
	disabled?: boolean;
	ariaLabel?: string;
	className?: string;
}) {
	const selector = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn("h-8 gap-2 rounded-md px-3 text-xs", className)}
					aria-label={ariaLabel}
					title={disabled ? "Coming Soon" : undefined}
					disabled={disabled || isLoading}
				>
					{isLoading ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<BarChart3 className="size-3.5" />
					)}
					{formatModelPercentile(value)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48 rounded-md">
				<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
					Performance Percentile
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup
					value={String(value)}
					onValueChange={(next) => {
						const parsed = Number(next);
						if (isModelPercentile(parsed)) onChange(parsed);
					}}
				>
					{MODEL_PERCENTILES.map((percentile) => (
						<DropdownMenuRadioItem
							key={percentile}
							value={String(percentile)}
						>
							{formatModelPercentile(percentile)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	if (!disabled) return selector;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex" tabIndex={0}>
					{selector}
				</span>
			</TooltipTrigger>
			<TooltipContent>Coming Soon</TooltipContent>
		</Tooltip>
	);
}
