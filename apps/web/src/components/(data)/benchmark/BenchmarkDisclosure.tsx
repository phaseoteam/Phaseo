import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Keyboard-accessible disclosure row used to keep secondary benchmark detail out of the main view. */
export function BenchmarkDisclosure({ id, title, count, children }: { id?: string; title: ReactNode; count?: ReactNode; children: ReactNode }) {
	return <Collapsible id={id} className="scroll-mt-36 border-t">
		<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-3 py-4 text-left text-sm font-medium hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<span className="flex-1">{title}</span>
			{count !== undefined ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span> : null}
			<ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
		</CollapsibleTrigger>
		<CollapsibleContent hiddenUntilFound><div className="pb-6">{children}</div></CollapsibleContent>
	</Collapsible>;
}
