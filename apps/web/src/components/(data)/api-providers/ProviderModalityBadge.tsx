import type { LucideIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { cn } from "@/lib/utils";
import { DisplayNumber } from "@/components/display/DisplayValue";

type ProviderModalityBadgeProps = {
	label: string;
	modality: string;
	icon: LucideIcon;
	inputCount: number;
	outputCount: number;
};

export function ProviderModalityBadge({
	label,
	modality,
	icon: Icon,
	inputCount,
	outputCount,
}: ProviderModalityBadgeProps) {
	const tone = getModalityTone(modality);

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span
					aria-label={label}
					tabIndex={0}
					className={cn(
						"inline-flex size-6 cursor-default items-center justify-center rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						tone.badgeClassName,
					)}
				>
					<Icon className={cn("size-3.5", tone.iconClassName)} />
				</span>
			</HoverCardTrigger>
			<HoverCardContent side="top" className="w-56 rounded-md p-3">
				<div className="flex items-center gap-2">
					<span className={cn("inline-flex size-7 items-center justify-center rounded-md", tone.badgeClassName)}>
						<Icon className={cn("size-4", tone.iconClassName)} />
					</span>
					<div>
						<p className="font-medium text-foreground">{label}</p>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
					<div><p className="text-xs text-muted-foreground">Input</p><p className="font-medium tabular-nums"><DisplayNumber value={inputCount} /></p></div>
					<div><p className="text-xs text-muted-foreground">Output</p><p className="font-medium tabular-nums"><DisplayNumber value={outputCount} /></p></div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
