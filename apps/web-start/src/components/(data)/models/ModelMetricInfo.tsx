"use client";

import { CircleHelp } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

export function ModelMetricInfo({
	label,
	description,
}: {
	label: string;
	description: string;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`About ${label}`}
					className="relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors after:absolute after:-inset-3.5 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<CircleHelp className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				sideOffset={6}
				className="w-72 rounded-xl bg-foreground px-3 py-2 text-xs leading-5 text-background shadow-md ring-0"
			>
				{description}
			</PopoverContent>
		</Popover>
	);
}
