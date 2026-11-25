import { useId } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { useTranslations } from "@/i18n/react";
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
	ariaLabel,
	className,
}: {
	value: ModelPercentile;
	onChange: (value: ModelPercentile) => void;
	isLoading?: boolean;
	disabled?: boolean;
	ariaLabel?: string;
	className?: string;
}) {
	const tPerformance = useTranslations("Catalogue.modelDetail.performance");
	const tQuickstart = useTranslations("Catalogue.models.detail.quickstart");
	const comingSoonId = useId();
	const selector = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn("h-8 gap-2 rounded-md px-3 text-xs", className)}
					aria-label={`${formatModelPercentile(value)}, ${ariaLabel ?? tPerformance("selectPercentile")}`}
					title={disabled ? tQuickstart("comingSoon") : undefined}
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
					{tPerformance("selectPercentile")}
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

	// A disabled button can't take focus, so keyboard users could never reach the
	// "coming soon" tooltip. This one stays focusable but does nothing.
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn("h-8 cursor-not-allowed gap-2 rounded-md px-3 text-xs opacity-50", className)}
					aria-label={`${formatModelPercentile(value)}, ${ariaLabel ?? tPerformance("selectPercentile")}`}
					aria-describedby={comingSoonId}
					aria-disabled="true"
				>
					<BarChart3 className="size-3.5" />
					{formatModelPercentile(value)}
					<span id={comingSoonId} className="sr-only">
						{tQuickstart("comingSoon")}
					</span>
				</Button>
			</TooltipTrigger>
		<TooltipContent>{tQuickstart("comingSoon")}</TooltipContent>
		</Tooltip>
	);
}
