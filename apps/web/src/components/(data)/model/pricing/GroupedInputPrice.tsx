import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function GroupedInputPrice({ price, modalities }: { price: string; modalities: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" aria-label={`${price} per 1M input tokens: ${modalities}`} className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					{price}
				</button>
			</TooltipTrigger>
			<TooltipContent>{modalities}</TooltipContent>
		</Tooltip>
	);
}
