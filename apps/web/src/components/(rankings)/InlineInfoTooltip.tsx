"use client";

import { CircleHelp } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type InlineInfoTooltipProps = {
	label: string;
	description: string;
};

export function InlineInfoTooltip({
	label,
	description,
}: InlineInfoTooltipProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:text-muted-foreground"
				>
					<CircleHelp className="h-3.5 w-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} className="max-w-72">
				{description}
			</TooltipContent>
		</Tooltip>
	);
}
