import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * What a metric measures. Opens on hover, and on click, tap or Enter/Space, so
 * it works on touch screens and from the keyboard; Escape or a click outside
 * closes it. The trigger is a help icon, or the metric's label when `children`
 * is given (shown with a dotted underline).
 */
export function ModelMetricInfo({
	label,
	description,
	children,
	triggerClassName,
	side = "top",
	align = "center",
}: {
	label: string;
	description: ReactNode;
	children?: ReactNode;
	triggerClassName?: string;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
}) {
	return (
		<Popover>
			<PopoverTrigger openOnHover delay={120} closeDelay={80} asChild>
				{children ? (
					<button
						type="button"
						className={cn(
							"cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
							triggerClassName,
						)}
					>
						{children}
					</button>
				) : (
					<button
						type="button"
						aria-label={`About ${label}`}
						className={cn(
							"relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors after:absolute after:-inset-3.5 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							triggerClassName,
						)}
					>
						<CircleHelp className="size-3.5" />
					</button>
				)}
			</PopoverTrigger>
			<PopoverContent
				side={side}
				align={align}
				sideOffset={6}
				className="w-72 gap-1 rounded-md bg-foreground px-3 py-2 text-xs leading-5 text-background shadow-md ring-0"
			>
				{description}
			</PopoverContent>
		</Popover>
	);
}
