"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function GroupedInputPrice({ price, modalities }: { price: string; modalities: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span tabIndex={0} aria-label={`${price} per 1M input tokens: ${modalities}`} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					{price}
				</span>
			</TooltipTrigger>
			<TooltipContent>{modalities}</TooltipContent>
		</Tooltip>
	);
}
